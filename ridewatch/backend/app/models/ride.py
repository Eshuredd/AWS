from datetime import datetime
from enum import StrEnum
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class RideStatus(StrEnum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


class Ride(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: UUID
    start_lat: float
    start_lng: float
    destination: str
    vehicle_number: str | None
    status: RideStatus
    started_at: datetime
    ended_at: datetime | None = None
