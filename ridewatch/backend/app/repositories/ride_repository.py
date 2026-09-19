from abc import ABC, abstractmethod
from threading import RLock
from uuid import UUID
from app.models.ride import Ride
from app.schemas.fare import DropLocation


class RideRepository(ABC):
    @abstractmethod
    def save(self, ride: Ride) -> Ride: ...

    @abstractmethod
    def get(self, ride_id: UUID) -> Ride | None: ...

    @abstractmethod
    def end(self, ride_id: UUID, drop: DropLocation | None = None) -> Ride | None:
        """Atomically complete a ride; repeated calls preserve its end timestamp."""
        ...


class InMemoryRideRepository(RideRepository):
    def __init__(self) -> None:
        self._rides: dict[UUID, Ride] = {}
        self.transaction_lock = RLock()
        self._lock = self.transaction_lock

    def save(self, ride: Ride) -> Ride:
        with self._lock:
            self._rides[ride.id] = ride
        return ride

    def get(self, ride_id: UUID) -> Ride | None:
        with self._lock:
            return self._rides.get(ride_id)

    def end(self, ride_id: UUID, drop: DropLocation | None = None) -> Ride | None:
        from datetime import datetime, timezone
        from app.models.ride import RideStatus
        with self._lock:
            ride = self._rides.get(ride_id)
            if ride and ride.status == RideStatus.ACTIVE:
                drop = drop or DropLocation()
                gps = drop.drop_location_source == "GPS"
                ride = ride.model_copy(update={"status": RideStatus.COMPLETED, "ended_at": datetime.now(timezone.utc), "drop_lat": drop.drop_lat if gps else ride.destination_lat, "drop_lng": drop.drop_lng if gps else ride.destination_lng, "drop_location_source": drop.drop_location_source})
                self._rides[ride_id] = ride
            return ride
