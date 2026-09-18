from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from app.schemas.fare import FareEstimate, FareQuery, FareReportInput, FareReportReceipt
from app.services.fare_service import FareService
from app.api.rides import Service

router = APIRouter(tags=["fares"])


def get_fare_service(request: Request) -> FareService:
    return request.app.state.fare_service


FareDependency = Annotated[FareService, Depends(get_fare_service)]


@router.post("/api/fare-estimate", response_model=FareEstimate)
def estimate_fare(data: FareQuery, service: FareDependency):
    return service.estimate(data)


@router.post("/api/rides/{ride_id}/fare-report", response_model=FareReportReceipt, status_code=201)
def report_fare(ride_id: UUID, data: FareReportInput, service: FareDependency, rides: Service):
    return service.report(rides.get(ride_id), data)
