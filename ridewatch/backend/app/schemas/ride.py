import re
from pydantic import BaseModel, Field, field_validator
from app.models.ride import Ride


class CreateRide(BaseModel):
    start_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    start_lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    destination: str = Field(min_length=1, max_length=200)
    vehicle_number: str | None = Field(default=None, max_length=30)

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
    pass
