from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Request, Response
from app.schemas.share import ShareCreated, SharedRideState
from app.services.share_service import ShareService


router = APIRouter(prefix="/api", tags=["sharing"])


def get_service(request: Request) -> ShareService:
    return request.app.state.share_service


Service = Annotated[ShareService, Depends(get_service)]


@router.post("/rides/{ride_id}/share", response_model=ShareCreated, status_code=201)
def create_share(ride_id: UUID, service: Service):
    return service.create(ride_id)


@router.get("/share/{token}", response_model=SharedRideState)
def get_share(token: str, service: Service):
    return service.get(token)


@router.delete("/share/{token}", status_code=204)
def revoke_share(token: str, service: Service):
    service.revoke(token)
    return Response(status_code=204)
