from abc import ABC, abstractmethod
from datetime import timedelta
from threading import RLock
from uuid import UUID

from app.models.sos import SosDispatch


class SosDispatchRepository(ABC):
    @abstractmethod
    def get(self, request_id: UUID) -> SosDispatch | None: ...

    @abstractmethod
    def claim(self, request_id: UUID, dispatch: SosDispatch) -> bool: ...

    @abstractmethod
    def complete(self, request_id: UUID, dispatch: SosDispatch) -> SosDispatch: ...


class InMemorySosDispatchRepository(SosDispatchRepository):
    RETENTION = timedelta(minutes=5)

    def __init__(self, clock=None):
        from datetime import datetime, timezone
        self._dispatches: dict[UUID, SosDispatch] = {}
        self._lock = RLock()
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def _current(self, request_id, now):
        dispatch = self._dispatches.get(request_id)
        if dispatch and dispatch.created_at + self.RETENTION <= now:
            self._dispatches.pop(request_id, None)
            return None
        return dispatch

    def get(self, request_id):
        with self._lock:
            return self._current(request_id, self.clock())

    def claim(self, request_id, dispatch):
        with self._lock:
            if self._current(request_id, dispatch.created_at) is not None:
                return False
            self._dispatches[request_id] = dispatch
            return True

    def complete(self, request_id, dispatch):
        with self._lock:
            self._dispatches[request_id] = dispatch
            return dispatch
