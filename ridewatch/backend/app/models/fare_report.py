from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class FareReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    ride_id: UUID
    pickup_lat: float
    pickup_lng: float
    drop_lat: float
    drop_lng: float
    drop_location_source: str
    route_distance_km: float
    route_duration_minutes: int
    fare_paid: float
    reported_at: datetime
