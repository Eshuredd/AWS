from datetime import datetime
from enum import StrEnum
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.schemas.fare import FareEstimate


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
    destination_lat: float | None = None
    destination_lng: float | None = None
    expected_distance_km: float | None = None
    expected_duration_minutes: int | None = None
    fare_estimate: FareEstimate | None = None
    drop_lat: float | None = None
    drop_lng: float | None = None
    drop_location_source: str | None = None
