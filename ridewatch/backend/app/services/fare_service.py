from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4
from app.fares.base import FareProvider
from app.fares.matching import MatchingRules, typical_fare
from app.models.fare_report import FareReport
from app.models.ride import Ride, RideStatus
from app.repositories.fare_report_repository import FareReportRepository
from app.schemas.fare import FareEstimate, FareQuery, FareReportInput
from app.models.quotes import FareQuote
from app.repositories.quote_repository import InMemoryFareQuoteRepository


class FareError(Exception):
    pass


@dataclass(frozen=True)
class SupportedArea:
    # Deliberately limited MVP coverage, not an administrative boundary.
    min_lat: float = 17.2
    max_lat: float = 17.6
    min_lng: float = 78.2
    max_lng: float = 78.7

    def contains(self, lat: float, lng: float) -> bool:
        return self.min_lat <= lat <= self.max_lat and self.min_lng <= lng <= self.max_lng


class FareService:
    def __init__(self, provider: FareProvider, repository: FareReportRepository, rules: MatchingRules = MatchingRules(), area: SupportedArea = SupportedArea(), quote_repository=None, clock=lambda: datetime.now(timezone.utc), quote_max_age_seconds=300):
        self.provider, self.repository, self.rules, self.area = provider, repository, rules, area
        self.quotes = quote_repository if quote_repository is not None else InMemoryFareQuoteRepository()
        self.clock, self.quote_max_age_seconds = clock, quote_max_age_seconds

    def estimate(self, query: FareQuery) -> FareEstimate:
        supported = self.area.contains(query.start_lat, query.start_lng) and self.area.contains(query.destination_lat, query.destination_lng)
        result = FareEstimate(estimate_id=uuid4(), supported=supported, official_meter=self.provider.estimate_official(query.distance_km) if supported else None, typical_reported=typical_fare(query, self.repository.list_all(), self.rules) if supported else None)
        self.quotes.save(FareQuote(request=query, estimate=result, expires_at=self.clock() + timedelta(seconds=self.quote_max_age_seconds)))
        return result

    def snapshot(self, query: FareQuery, estimate_id: UUID | None) -> FareEstimate:
        if estimate_id is None:
            return self.estimate(query)
        saved = self.quotes.get(estimate_id)
        if saved is None or saved.request != query or self.clock() >= saved.expires_at:
            raise FareError("Fare estimate expired or does not match this route. Refresh the estimate.")
        return saved.estimate

    def report(self, ride: Ride, data: FareReportInput) -> FareReport:
        if ride.status != RideStatus.COMPLETED:
            raise FareError("Complete the ride before reporting a fare")
        if ride.expected_distance_km is None or ride.expected_duration_minutes is None:
            raise FareError("This ride has no route information for fare matching")
        lat, lng, source = ride.drop_lat, ride.drop_lng, ride.drop_location_source
        if data.drop_location_source == "GPS":
            lat, lng, source = data.drop_lat, data.drop_lng, "GPS"
        if lat is None or lng is None:
            raise FareError("This ride has no drop location for fare matching")
        return self.repository.save(FareReport(ride_id=ride.id, pickup_lat=ride.start_lat, pickup_lng=ride.start_lng, drop_lat=lat, drop_lng=lng, drop_location_source=source, route_distance_km=ride.expected_distance_km, route_duration_minutes=ride.expected_duration_minutes, fare_paid=data.fare_paid, reported_at=datetime.now(timezone.utc)))
