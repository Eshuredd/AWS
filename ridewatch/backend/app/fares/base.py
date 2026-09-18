from abc import ABC, abstractmethod
from datetime import datetime
from app.schemas.fare import OfficialFare


class FareProvider(ABC):
    @abstractmethod
    def estimate_official(self, distance_km: float, timestamp: datetime | None = None) -> OfficialFare: ...
