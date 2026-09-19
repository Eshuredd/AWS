import re
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.models.ride import Ride


class CreateRide(BaseModel):
    model_config = ConfigDict(extra="forbid")
    route_estimate_id: UUID | None = None
    fare_estimate_id: UUID | None = None
    start_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    start_lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    destination: str = Field(min_length=1, max_length=200)
    vehicle_number: str | None = Field(default=None, max_length=30)

    # Optional as a complete bundle for compatibility with original text-only clients.
    destination_lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    destination_lng: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    expected_distance_km: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    expected_duration_minutes: int | None = Field(default=None, gt=0, strict=True)

    @model_validator(mode="after")
    def complete_route_information(self) -> "CreateRide":
        fields = (self.destination_lat, self.destination_lng,
                  self.expected_distance_km, self.expected_duration_minutes)
        if any(value is not None for value in fields) and not all(value is not None for value in fields):
            raise ValueError("Supply all destination coordinates and route estimate fields together")
        if self.fare_estimate_id is not None and self.expected_distance_km is None:
            raise ValueError("Fare snapshot requires route information")
        return self

    @field_validator("destination", mode="before")
    @classmethod
    def trim_destination(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("vehicle_number")
    @classmethod
    def normalize_vehicle(cls, value: str | None) -> str | None:
        if not value or not value.strip():
            return None
        value = re.sub(r"\s+", "", value).upper()
        # Conventional state registrations and Bharat-series registrations.
        if not re.fullmatch(r"(?:[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}|[0-9]{2}BH[0-9]{1,4}[A-Z]{1,2})", value):
            raise ValueError("Enter a vehicle number such as TS 09 AB 1234 or leave it blank")
        return value


class RideResponse(Ride):
    # Actual historical drop coordinates are for internal matching only.
    drop_lat: float | None = Field(default=None, exclude=True)
    drop_lng: float | None = Field(default=None, exclude=True)
