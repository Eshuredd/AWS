from datetime import datetime, timezone, timedelta
from uuid import uuid4
from app.schemas.location import RouteRequest
from app.services.fare_service import FareError
from app.models.quotes import RouteQuote
from app.repositories.quote_repository import InMemoryRouteQuoteRepository


def utc_now():
    return datetime.now(timezone.utc)


class RouteService:
    """Only provider geometry becomes a monitoring baseline; expiry is checked here."""
    def __init__(self, provider, clock=utc_now, max_age_seconds=300, repository=None):
        self.provider, self.clock, self.max_age_seconds = provider, clock, max_age_seconds
        self.repository = repository if repository is not None else InMemoryRouteQuoteRepository()

    def estimate(self, query: RouteRequest):
        now = self.clock()
        route = self.provider.calculate_route(**query.model_dump()).model_copy(update={
            "route_estimate_id": uuid4(), "calculated_at": now,
            "expires_at": now + timedelta(seconds=self.max_age_seconds),
        })
        self.repository.save(RouteQuote(request=query, estimate=route))
        return route

    def snapshot(self, data):
        saved = self.repository.get(data.route_estimate_id)
        if saved is None or self.clock() >= saved.estimate.expires_at:
            raise FareError("Route estimate expired or unavailable. Refresh route and fare estimates.")
        query, route = saved.request, saved.estimate
        if any(getattr(data, key) != value for key, value in query.model_dump().items()) or data.expected_distance_km != route.distance_km or data.expected_duration_minutes != route.duration_minutes:
            raise FareError("Route estimate does not match this ride. Refresh route and fare estimates.")
        return route.model_copy(deep=True)
