from datetime import datetime, timezone, timedelta
from threading import Lock
from uuid import uuid4
from app.schemas.location import RouteRequest
from app.services.fare_service import FareError


def utc_now():
    return datetime.now(timezone.utc)


class RouteService:
    """Process-local quotes; only provider geometry becomes a monitoring baseline."""
    def __init__(self, provider, clock=utc_now, max_age_seconds=300):
        self.provider, self.clock, self.max_age_seconds = provider, clock, max_age_seconds
        self._quotes = {}
        self._lock = Lock()

    def estimate(self, query: RouteRequest):
        now = self.clock()
        route = self.provider.calculate_route(**query.model_dump()).model_copy(update={
            "route_estimate_id": uuid4(), "calculated_at": now,
            "expires_at": now + timedelta(seconds=self.max_age_seconds),
        })
        with self._lock:
            self._quotes = {key: value for key, value in self._quotes.items() if value[1].expires_at > now}
            self._quotes[route.route_estimate_id] = (query, route)
        return route

    def snapshot(self, data):
        with self._lock:
            saved = self._quotes.get(data.route_estimate_id)
        if saved is None or self.clock() >= saved[1].expires_at:
            raise FareError("Route estimate expired or unavailable. Refresh route and fare estimates.")
        query, route = saved
        if any(getattr(data, key) != value for key, value in query.model_dump().items()) or data.expected_distance_km != route.distance_km or data.expected_duration_minutes != route.duration_minutes:
            raise FareError("Route estimate does not match this ride. Refresh route and fare estimates.")
        return route.model_copy(deep=True)
