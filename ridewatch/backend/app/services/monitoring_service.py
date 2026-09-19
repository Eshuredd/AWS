from dataclasses import dataclass, field
from datetime import datetime
from math import cos, radians, hypot
from threading import RLock
from app.models.ride import RideStatus
from app.schemas.monitoring import MonitoringResponse
from app.services.fare_service import FareError
from app.services.ride_service import RideNotFound
from app.services.route_service import utc_now


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


@dataclass
class MonitoringState:
    response: MonitoringResponse
    off_count: int = 0
    on_count: int = 0
    anchor: object = None
    stopped_since: datetime | None = None
    last_good_at: datetime | None = None
    # A bounded recent window only; never exposed by the API.
    recent: list = field(default_factory=list)


class MonitoringService:
    def __init__(self, repository, clock=utc_now, rules=MonitoringRules()):
        self.repository, self.clock, self.rules = repository, clock, rules
        self._states = {}
        # Shared with completion: an update cannot race past ride completion.
        self.lock = RLock()

    def _ride(self, ride_id):
        ride = self.repository.get(ride_id)
        if ride is None:
            raise RideNotFound()
        if ride.status != RideStatus.ACTIVE:
            raise FareError("Live monitoring is available only for active rides")
        return ride

    def clear(self, ride_id):
        with self.lock:
            self._states.pop(ride_id, None)

    def _state(self, ride_id):
        return self._states.setdefault(ride_id, MonitoringState(MonitoringResponse(ride_id=ride_id)))

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
        with self.lock:
            ride = self._ride(ride_id)
            return self._response(ride, self._state(ride_id), self.clock())

    def update(self, ride_id, sample):
        with self.lock:
            ride = self._ride(ride_id)
            state, now, rules = self._state(ride_id), self.clock(), self.rules
            baseline = ride.expected_route
            if not baseline or not baseline.traffic_aware or len(baseline.route_geometry) < 2:
                raise FareError("This ride has no validated route for live monitoring")
            response = state.response
            if response.last_updated_at and (now - response.last_updated_at).total_seconds() < rules.min_sample_interval_seconds:
                return self._response(ride, state, now)
            response.last_updated_at = now
            gap = state.last_good_at is None or (now - state.last_good_at).total_seconds() > rules.max_sample_gap_seconds
            if gap or sample.accuracy_m > rules.good_accuracy_m:
                state.anchor, state.stopped_since = None, None
                state.off_count = state.on_count = 0
                state.recent.clear()
                response.route_status, response.stop_status, response.distance_from_route_m = "UNKNOWN", "UNKNOWN", None
            if sample.accuracy_m > rules.good_accuracy_m:
                response.gps_status = "POOR"
                state.last_good_at = None
                return self._response(ride, state, now)
            response.gps_status = "GOOD"
            state.last_good_at = now
            state.recent.append((now, sample))
            state.recent = state.recent[-60:]
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
                    state.anchor, state.stopped_since = sample, now
                response.stop_status = "PROLONGED_STOP" if (now - state.stopped_since).total_seconds() >= rules.stop_seconds else "MOVING"
            return self._response(ride, state, now)
