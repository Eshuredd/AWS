from abc import ABC, abstractmethod
from contextlib import nullcontext
from threading import RLock
from uuid import UUID
from app.models.monitoring import MonitoringState
from app.models.ride import RideStatus
from app.repositories.ride_repository import InMemoryRideRepository
from app.repositories.errors import WriteConflict, RideNotActive


class MonitoringStateRepository(ABC):
    def completion_guard(self):
        """Memory may serialize completion locally; durable stores use transactions."""
        return nullcontext()

    @abstractmethod
    def get(self, ride_id: UUID) -> MonitoringState | None: ...

    @abstractmethod
    def save(self, state: MonitoringState, expected_version: int) -> MonitoringState:
        """Atomically check ACTIVE ride and expected version, then replace state."""
        ...

    @abstractmethod
    def delete(self, ride_id: UUID) -> None: ...


class InMemoryMonitoringStateRepository(MonitoringStateRepository):
    def __init__(self, rides: InMemoryRideRepository):
        self.rides = rides
        # Shared by all app instances using this ride repository, including end().
        self._lock = getattr(rides, "transaction_lock", RLock())
        self._states: dict[UUID, MonitoringState] = {}

    def completion_guard(self):
        return self._lock

    def get(self, ride_id):
        with self._lock:
            state = self._states.get(ride_id)
            return state.model_copy(deep=True) if state else None

    def save(self, state, expected_version):
        with self._lock:
            ride_id = state.response.ride_id
            ride = self.rides.get(ride_id)
            if ride is None or ride.status != RideStatus.ACTIVE:
                raise RideNotActive()
            current = self._states.get(ride_id)
            if (current.version if current else 0) != expected_version:
                raise WriteConflict()
            saved = state.model_copy(deep=True, update={"version": expected_version + 1})
            self._states[ride_id] = saved
            return saved.model_copy(deep=True)

    def delete(self, ride_id):
        with self._lock:
            self._states.pop(ride_id, None)
