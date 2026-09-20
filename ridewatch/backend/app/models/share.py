from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class ShareSession(BaseModel):
    model_config = ConfigDict(frozen=True)
    ride_id: UUID
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
