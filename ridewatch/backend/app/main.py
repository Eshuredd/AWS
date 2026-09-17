from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.rides import router
from app.core.config import Settings
from app.repositories.ride_repository import InMemoryRideRepository, RideRepository
from app.services.ride_service import RideNotFound


def create_app(repository: RideRepository | None = None) -> FastAPI:
    application = FastAPI(title="RideWatch API", version="0.1.0")
    application.state.ride_repository = repository if repository is not None else InMemoryRideRepository()
    application.add_middleware(CORSMiddleware, allow_origins=Settings().cors_origins, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type"])
    application.include_router(router)

    @application.exception_handler(RideNotFound)
    async def not_found(request: Request, error: RideNotFound):
        return JSONResponse(status_code=404, content={"detail": "Ride not found"})

    @application.get("/health")
    def health():
        return {"status": "ok", "service": "ridewatch-api"}

    return application


app = create_app()
