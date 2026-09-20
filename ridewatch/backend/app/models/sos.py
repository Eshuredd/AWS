from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SosDispatch(BaseModel):
    model_config = ConfigDict(frozen=True)
    ride_id: UUID
    requested: int
    sent: int
    failed: int
    created_at: datetime
