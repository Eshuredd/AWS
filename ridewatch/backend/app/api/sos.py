from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from app.schemas.sos import SendSosRequest, SendSosResponse
from app.services.sos_service import SosService


router = APIRouter(prefix="/api/rides", tags=["sos"])


def get_service(request: Request) -> SosService:
    return request.app.state.sos_service


Service = Annotated[SosService, Depends(get_service)]


@router.post("/{ride_id}/sos", response_model=SendSosResponse)
def send_sos(ride_id: UUID, data: SendSosRequest, service: Service):
    return service.send(ride_id, data)
