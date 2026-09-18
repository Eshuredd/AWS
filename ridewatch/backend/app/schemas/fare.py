from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class FareQuery(BaseModel):
    distance_km: float = Field(gt=0, allow_inf_nan=False)
    duration_minutes: int = Field(gt=0, strict=True)
    start_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    start_lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    destination_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    destination_lng: float = Field(ge=-180, le=180, allow_inf_nan=False)


class OfficialFare(BaseModel):
    model_config = ConfigDict(frozen=True)
    minimum: int
    maximum: int
    source: str
    effective_from: str
    night_applied: bool


class TypicalFare(BaseModel):
    model_config = ConfigDict(frozen=True)
    minimum: int
    maximum: int
    median: int
    sample_count: int
    pickup_radius_m: int
    destination_radius_m: int
    confidence: Literal["LOW", "MEDIUM", "HIGH"]
    source: str = "RideWatch completed ride reports"


class FareEstimate(BaseModel):
    model_config = ConfigDict(frozen=True)
    estimate_id: UUID
    currency: Literal["INR"] = "INR"
    official_meter: OfficialFare | None
    typical_reported: TypicalFare | None
    supported: bool


class DropLocation(BaseModel):
    drop_lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    drop_lng: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    drop_location_source: Literal["GPS", "DESTINATION_FALLBACK"] = "DESTINATION_FALLBACK"

    @model_validator(mode="after")
    def paired_coordinates(self):
        if (self.drop_lat is None) != (self.drop_lng is None):
            raise ValueError("Supply both drop coordinates")
        if self.drop_location_source == "GPS" and self.drop_lat is None:
            raise ValueError("GPS requires drop coordinates")
        if self.drop_location_source == "DESTINATION_FALLBACK" and self.drop_lat is not None:
            raise ValueError("Destination fallback uses the stored destination")
        return self


class FareReportInput(DropLocation):
    fare_paid: float = Field(gt=0, le=10000, allow_inf_nan=False)


class FareReportReceipt(BaseModel):
    ride_id: UUID
    fare_paid: float
    reported_at: datetime
