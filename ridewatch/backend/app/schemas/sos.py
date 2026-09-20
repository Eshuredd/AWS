from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SendSosRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    phone_numbers: list[str] = Field(min_length=1, max_length=3)

    @field_validator("phone_numbers")
    @classmethod
    def valid_phone_numbers(cls, numbers):
        import re
        if any(not re.fullmatch(r"\+[1-9]\d{7,14}", number) for number in numbers):
            raise ValueError("Phone numbers must use E.164 format")
        if len(set(numbers)) != len(numbers):
            raise ValueError("Phone numbers must not contain duplicates")
        return numbers


class SendSosResponse(BaseModel):
    token: str
    expires_at: datetime
    requested: int
    sent: int
    failed: int
