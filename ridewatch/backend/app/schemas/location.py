from typing import Annotated
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]


class PlaceResult(BaseModel):
    id: str | None = None
    label: str = Field(min_length=1)
    latitude: Latitude
    longitude: Longitude


class PlaceSearchResponse(BaseModel):
    results: list[PlaceResult]


class RouteRequest(BaseModel):
    start_lat: Latitude
    start_lng: Longitude
    destination_lat: Latitude
    destination_lng: Longitude


class RoutePoint(BaseModel):
    model_config = ConfigDict(frozen=True)
    latitude: Latitude
    longitude: Longitude


class RouteEstimate(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    distance_km: float = Field(gt=0)
    duration_minutes: int = Field(gt=0)
    duration_seconds: float | None = Field(default=None, gt=0)
    route_geometry: tuple[RoutePoint, ...] = ()
    traffic_aware: bool = False
    route_estimate_id: UUID | None = None
    calculated_at: datetime | None = None
    expires_at: datetime | None = None
