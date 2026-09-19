from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.location import RoutePoint


class LocationSample(RoutePoint):
    model_config = ConfigDict(extra="forbid", frozen=True)
    accuracy_m: float = Field(gt=0, le=10000, allow_inf_nan=False)


class MonitoringResponse(BaseModel):
    ride_id: UUID
    gps_status: Literal["WAITING", "GOOD", "POOR", "STALE", "UNAVAILABLE"] = "WAITING"
    route_status: Literal["UNKNOWN", "ON_ROUTE", "POSSIBLE_DEVIATION", "DEVIATED"] = "UNKNOWN"
    distance_from_route_m: float | None = None
    stop_status: Literal["UNKNOWN", "MOVING", "PROLONGED_STOP"] = "UNKNOWN"
    delay_status: Literal["UNKNOWN", "ON_TIME", "DELAYED"] = "UNKNOWN"
    last_updated_at: datetime | None = None
