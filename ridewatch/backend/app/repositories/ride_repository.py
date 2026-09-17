from abc import ABC, abstractmethod
from threading import Lock
from uuid import UUID
from app.models.ride import Ride


class RideRepository(ABC):
    @abstractmethod
    def save(self, ride: Ride) -> Ride: ...

    @abstractmethod
    def get(self, ride_id: UUID) -> Ride | None: ...

    @abstractmethod
    def end(self, ride_id: UUID) -> Ride | None:
        """Atomically complete a ride; repeated calls preserve its end timestamp."""
        ...


class InMemoryRideRepository(RideRepository):
    def __init__(self) -> None:
        self._rides: dict[UUID, Ride] = {}
        self._lock = Lock()

    def save(self, ride: Ride) -> Ride:
        with self._lock:
            self._rides[ride.id] = ride
        return ride

    def get(self, ride_id: UUID) -> Ride | None:
        with self._lock:
            return self._rides.get(ride_id)

    def end(self, ride_id: UUID) -> Ride | None:
        from datetime import datetime, timezone
        from app.models.ride import RideStatus
        with self._lock:
            ride = self._rides.get(ride_id)
            if ride and ride.status == RideStatus.ACTIVE:
                ride = ride.model_copy(update={"status": RideStatus.COMPLETED, "ended_at": datetime.now(timezone.utc)})
                self._rides[ride_id] = ride
            return ride
