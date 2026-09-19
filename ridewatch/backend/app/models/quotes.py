from datetime import datetime
from pydantic import BaseModel
from app.schemas.location import RouteRequest, RouteEstimate
from app.schemas.fare import FareQuery, FareEstimate


class RouteQuote(BaseModel):
    request: RouteRequest
    estimate: RouteEstimate


class FareQuote(BaseModel):
    request: FareQuery
    estimate: FareEstimate
    expires_at: datetime
