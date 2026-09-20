import hashlib
import secrets
from datetime import timedelta
from app.models.ride import RideStatus
from app.models.share import ShareSession
from app.schemas.monitoring import MonitoringResponse
from app.schemas.share import ShareCreated, SharedLocation, SharedRideState
from app.services.ride_service import RideNotFound


class ShareNotFound(Exception):
    pass


class ShareNotActive(Exception):
    pass


class ShareService:
    MAX_LIFETIME = timedelta(hours=24)
    COMPLETED_GRACE = timedelta(hours=1)

    def __init__(self, rides, monitoring, shares, clock, monitoring_service=None):
        self.rides, self.monitoring, self.shares, self.clock = rides, monitoring, shares, clock
        self.monitoring_service = monitoring_service

    @staticmethod
    def token_hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def create(self, ride_id):
        ride = self.rides.get(ride_id)
        if ride is None:
            raise RideNotFound()
        if ride.status != RideStatus.ACTIVE:
            raise ShareNotActive("Live sharing is available only for active rides")
        now = self.clock()
        token = secrets.token_urlsafe(32)
        session = ShareSession(ride_id=ride_id, created_at=now, expires_at=now + self.MAX_LIFETIME)
        self.shares.save(self.token_hash(token), session)
        return ShareCreated(token=token, expires_at=session.expires_at)

    def _session(self, token):
        session = self.shares.get(self.token_hash(token))
        now = self.clock()
        if session is None or session.revoked_at is not None or session.expires_at <= now:
            raise ShareNotFound()
        ride = self.rides.get(session.ride_id)
        if ride is None:
            raise ShareNotFound()
        if ride.ended_at and ride.ended_at + self.COMPLETED_GRACE <= now:
            raise ShareNotFound()
        return session, ride

    def get(self, token):
        _, ride = self._session(token)
        state = self.monitoring.get(ride.id) if ride.status == RideStatus.ACTIVE else None
        response = self.monitoring_service.get(ride.id) if self.monitoring_service and ride.status == RideStatus.ACTIVE else (
            state.response if state else MonitoringResponse(ride_id=ride.id, gps_status="UNAVAILABLE")
        )
        location = state.latest_location if state else None
        return SharedRideState(
            ride_status=ride.status, destination=ride.destination, vehicle_number=ride.vehicle_number,
            started_at=ride.started_at, ended_at=ride.ended_at,
            expected_distance_km=ride.expected_distance_km,
            expected_duration_minutes=ride.expected_duration_minutes,
            gps_status=response.gps_status, route_status=response.route_status,
            stop_status=response.stop_status, delay_status=response.delay_status,
            last_updated_at=response.last_updated_at,
            current_location=SharedLocation(latitude=location.latitude, longitude=location.longitude,
                                            accuracy_m=location.accuracy_m, updated_at=location.received_at)
            if location else None,
        )

    def revoke(self, token):
        self._session(token)
        if self.shares.revoke(self.token_hash(token), self.clock()) is None:
            raise ShareNotFound()
