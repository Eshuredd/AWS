from uuid import UUID, uuid4
from contextlib import nullcontext
from app.models.ride import Ride, RideStatus
from app.repositories.ride_repository import RideRepository
from app.schemas.ride import CreateRide
from app.schemas.fare import DropLocation, FareQuery
from app.services.fare_service import FareService
from app.services.route_service import utc_now


class RideNotFound(Exception):
    pass


class RideService:
    def __init__(self, repository: RideRepository, fares: FareService | None = None, routes=None, clock=utc_now, monitoring=None) -> None:
        self.repository = repository
        self.fares = fares
        self.routes, self.clock = routes, clock
        self.monitoring = monitoring

    def create(self, data: CreateRide) -> Ride:
        route = self.routes.snapshot(data) if data.route_estimate_id else None
        snapshot = None
        if self.fares and data.expected_distance_km is not None:
            query = FareQuery(distance_km=data.expected_distance_km, duration_minutes=data.expected_duration_minutes, start_lat=data.start_lat, start_lng=data.start_lng, destination_lat=data.destination_lat, destination_lng=data.destination_lng)
            snapshot = self.fares.snapshot(query, data.fare_estimate_id)
        return self.repository.save(Ride(id=uuid4(), **data.model_dump(exclude={"fare_estimate_id"}), expected_route=route, fare_estimate=snapshot, status=RideStatus.ACTIVE, started_at=self.clock()))

    def get(self, ride_id: UUID) -> Ride:
        ride = self.repository.get(ride_id)
        if ride is None:
            raise RideNotFound()
        return ride

    def end(self, ride_id: UUID, drop: DropLocation | None = None) -> Ride:
        with self.monitoring.completion_guard() if self.monitoring is not None else nullcontext():
            ride = self.repository.end(ride_id, drop)
            if ride is None:
                raise RideNotFound()
            if self.monitoring is not None:
                self.monitoring.delete(ride_id)
            return ride
