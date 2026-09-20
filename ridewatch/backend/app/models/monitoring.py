from datetime import datetime
from pydantic import BaseModel
from app.schemas.location import RoutePoint
from app.schemas.monitoring import MonitoringResponse


class LatestLocation(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: float
    received_at: datetime


class MonitoringState(BaseModel):
    """Sufficient statistics only: no sample list or location history."""
    response: MonitoringResponse
    version: int = 0
    off_count: int = 0
    on_count: int = 0
    anchor: RoutePoint | None = None
    stopped_since: datetime | None = None
    last_good_at: datetime | None = None
    latest_location: LatestLocation | None = None
