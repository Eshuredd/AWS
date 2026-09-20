from dataclasses import dataclass
from math import cos, radians, hypot
from app.models.ride import RideStatus
from app.schemas.monitoring import MonitoringResponse
from app.services.fare_service import FareError
from app.services.ride_service import RideNotFound
from app.services.route_service import utc_now
from app.models.monitoring import LatestLocation, MonitoringState
from app.schemas.location import RoutePoint
from app.repositories.monitoring_repository import InMemoryMonitoringStateRepository
from app.repositories.errors import WriteConflict, RideNotActive, StorageUnavailable


@dataclass(frozen=True)
class MonitoringRules:
    good_accuracy_m: float = 100
    deviation_threshold_m: float = 150
    deviation_samples: int = 3
    recovery_samples: int = 2
    stop_radius_m: float = 30
    stop_seconds: float = 180
    max_sample_gap_seconds: float = 30
    min_sample_interval_seconds: float = 5
    delay_multiplier: float = 1.5
    delay_grace_seconds: float = 300


def distance_to_route(point, geometry):
    """Minimum point-to-segment distance, using a city-scale equirectangular
    projection centered on the sample. Not intended for polar/global routes.
    Coordinates are named latitude/longitude, never ambiguous numeric pairs.
    """
    def xy(p):
        return (6371000 * radians(p.longitude - point.longitude) * cos(radians(point.latitude)),
                6371000 * radians(p.latitude - point.latitude))
    best = float("inf")
    for a, b in zip(geometry, geometry[1:]):
        ax, ay = xy(a)
        bx, by = xy(b)
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        t = max(0, min(1, -(ax * dx + ay * dy) / length)) if length else 0
        best = min(best, hypot(ax + t * dx, ay + t * dy))
    return best


class MonitoringService:
    def __init__(self, repository, clock=utc_now, rules=MonitoringRules(), state_repository=None):
        self.repository, self.clock, self.rules = repository, clock, rules
        self.states = state_repository if state_repository is not None else InMemoryMonitoringStateRepository(repository)

    def _ride(self, ride_id):
        ride = self.repository.get(ride_id)
        if ride is None:
            raise RideNotFound()
        if ride.status != RideStatus.ACTIVE:
            raise FareError("Live monitoring is available only for active rides")
        return ride

    def clear(self, ride_id):
        self.states.delete(ride_id)

    def _state(self, ride_id):
        return self.states.get(ride_id) or MonitoringState(response=MonitoringResponse(ride_id=ride_id))

    def _response(self, ride, state, now):
        response = state.response.model_copy()
        baseline = ride.expected_route
        if not baseline or not baseline.traffic_aware or not baseline.duration_seconds or len(baseline.route_geometry) < 2:
            return MonitoringResponse(ride_id=ride.id, gps_status="UNAVAILABLE")
        elapsed = (now - ride.started_at).total_seconds()
        response.delay_status = "DELAYED" if elapsed > baseline.duration_seconds * self.rules.delay_multiplier + self.rules.delay_grace_seconds else "ON_TIME"
        if response.last_updated_at and (now - response.last_updated_at).total_seconds() > self.rules.max_sample_gap_seconds:
            response.gps_status = "STALE"
            response.route_status, response.stop_status, response.distance_from_route_m = "UNKNOWN", "UNKNOWN", None
        return response

    def get(self, ride_id):
        ride = self._ride(ride_id)
        state = self._state(ride_id)
        self._ride(ride_id)
        return self._response(ride, state, self.clock())

    def update(self, ride_id, sample):
        # Fixed server receipt time prevents retries from making an old sample newer.
        now = self.clock()
        for _ in range(3):
            ride = self._ride(ride_id)
            state = self._state(ride_id)
            baseline = ride.expected_route
            if not baseline or not baseline.traffic_aware or len(baseline.route_geometry) < 2:
                raise FareError("This ride has no validated route for live monitoring")
            if state.response.last_updated_at and (now - state.response.last_updated_at).total_seconds() < self.rules.min_sample_interval_seconds:
                self._ride(ride_id)
                return self._response(ride, state, now)
            version = state.version
            self._advance(state, sample, baseline, now)
            state.response = self._response(ride, state, now)
            try:
                saved = self.states.save(state, version)
                return saved.response
            except RideNotActive:
                self._ride(ride_id)
                raise FareError("Live monitoring is available only for active rides") from None
            except WriteConflict:
                continue
        self._ride(ride_id)
        raise StorageUnavailable()

    def _advance(self, state, sample, baseline, now):
        response, rules = state.response, self.rules
        state.latest_location = LatestLocation(latitude=sample.latitude, longitude=sample.longitude,
                                               accuracy_m=sample.accuracy_m, received_at=now)
        response.last_updated_at = now
        gap = state.last_good_at is None or (now - state.last_good_at).total_seconds() > rules.max_sample_gap_seconds
        if gap or sample.accuracy_m > rules.good_accuracy_m:
            state.anchor, state.stopped_since = None, None
            state.off_count = state.on_count = 0
            response.route_status, response.stop_status, response.distance_from_route_m = "UNKNOWN", "UNKNOWN", None
        if sample.accuracy_m > rules.good_accuracy_m:
            response.gps_status = "POOR"
            state.last_good_at = None
            return
        response.gps_status = "GOOD"
        state.last_good_at = now
        distance = distance_to_route(sample, baseline.route_geometry)
        response.distance_from_route_m = round(distance, 1)
        if distance > rules.deviation_threshold_m + sample.accuracy_m:
            state.off_count += 1
            state.on_count = 0
            if state.off_count >= rules.deviation_samples or response.route_status == "DEVIATED":
                response.route_status = "DEVIATED"
            else:
                response.route_status = "POSSIBLE_DEVIATION"
        else:
            state.off_count = 0
            state.on_count += 1
            if response.route_status != "DEVIATED" or state.on_count >= rules.recovery_samples:
                response.route_status = "ON_ROUTE"
        # Stop detection requires accuracy finer than the movement radius.
        # Otherwise uncertainty could conceal motion and create a false stop.
        if sample.accuracy_m > rules.stop_radius_m:
            state.anchor, state.stopped_since = None, None
            response.stop_status = "UNKNOWN"
        else:
            if state.anchor is None or distance_to_route(sample, (state.anchor, state.anchor)) >= rules.stop_radius_m:
                state.anchor, state.stopped_since = RoutePoint(latitude=sample.latitude, longitude=sample.longitude), now
            response.stop_status = "PROLONGED_STOP" if (now - state.stopped_since).total_seconds() >= rules.stop_seconds else "MOVING"
