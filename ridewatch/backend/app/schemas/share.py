from datetime import datetime
from typing import Literal
from pydantic import BaseModel


class ShareCreated(BaseModel):
    token: str
    expires_at: datetime


class SharedLocation(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: float
    updated_at: datetime


class SharedRideState(BaseModel):
    ride_status: Literal["ACTIVE", "COMPLETED"]
    destination: str
    vehicle_number: str | None
    started_at: datetime
    ended_at: datetime | None
    expected_distance_km: float | None
    expected_duration_minutes: int | None
    gps_status: Literal["WAITING", "GOOD", "POOR", "STALE", "UNAVAILABLE"]
    route_status: Literal["UNKNOWN", "ON_ROUTE", "POSSIBLE_DEVIATION", "DEVIATED"]
    stop_status: Literal["UNKNOWN", "MOVING", "PROLONGED_STOP"]
    delay_status: Literal["UNKNOWN", "ON_TIME", "DELAYED"]
    last_updated_at: datetime | None
    current_location: SharedLocation | None
