from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from app.schemas.ride import CreateRide, RideResponse
from app.schemas.fare import DropLocation
from app.services.ride_service import RideService
from app.schemas.monitoring import LocationSample, MonitoringResponse

router = APIRouter(prefix="/api/rides", tags=["rides"])


def get_service(request: Request) -> RideService:
    return RideService(request.app.state.ride_repository, request.app.state.fare_service,
                       request.app.state.route_service, request.app.state.clock, request.app.state.storage.monitoring)


Service = Annotated[RideService, Depends(get_service)]


@router.post("", response_model=RideResponse, status_code=201)
def create_ride(data: CreateRide, service: Service):
    return service.create(data)


@router.get("/{ride_id}", response_model=RideResponse)
def get_ride(ride_id: UUID, service: Service):
    return service.get(ride_id)


@router.patch("/{ride_id}/end", response_model=RideResponse)
def end_ride(ride_id: UUID, service: Service, data: DropLocation | None = None):
    return service.end(ride_id, data)


@router.post("/{ride_id}/locations", response_model=MonitoringResponse)
def update_location(ride_id: UUID, data: LocationSample, request: Request):
    return request.app.state.monitoring_service.update(ride_id, data)


@router.get("/{ride_id}/monitoring", response_model=MonitoringResponse)
def get_monitoring(ride_id: UUID, request: Request):
    return request.app.state.monitoring_service.get(ride_id)
