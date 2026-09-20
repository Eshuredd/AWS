from abc import ABC, abstractmethod
from datetime import datetime
from threading import RLock
from app.models.share import ShareSession


class ShareSessionRepository(ABC):
    @abstractmethod
    def save(self, token_hash: str, session: ShareSession) -> ShareSession: ...

    @abstractmethod
    def get(self, token_hash: str) -> ShareSession | None: ...

    @abstractmethod
    def revoke(self, token_hash: str, revoked_at: datetime) -> ShareSession | None: ...


class InMemoryShareSessionRepository(ShareSessionRepository):
    def __init__(self):
        self._sessions: dict[str, ShareSession] = {}
        self._lock = RLock()

    def save(self, token_hash, session):
        with self._lock:
            self._sessions[token_hash] = session
            return session

    def get(self, token_hash):
        with self._lock:
            return self._sessions.get(token_hash)

    def revoke(self, token_hash, revoked_at):
        with self._lock:
            session = self._sessions.get(token_hash)
            if session is None:
                return None
            revoked = session.model_copy(update={"revoked_at": revoked_at})
            self._sessions[token_hash] = revoked
            return revoked
