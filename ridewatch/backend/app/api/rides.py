from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from app.schemas.ride import CreateRide, RideResponse
from app.services.ride_service import RideService

router = APIRouter(prefix="/api/rides", tags=["rides"])


def get_service(request: Request) -> RideService:
    return RideService(request.app.state.ride_repository)


Service = Annotated[RideService, Depends(get_service)]


@router.post("", response_model=RideResponse, status_code=201)
def create_ride(data: CreateRide, service: Service):
    return service.create(data)


@router.get("/{ride_id}", response_model=RideResponse)
def get_ride(ride_id: UUID, service: Service):
    return service.get(ride_id)


@router.patch("/{ride_id}/end", response_model=RideResponse)
def end_ride(ride_id: UUID, service: Service):
    return service.end(ride_id)
