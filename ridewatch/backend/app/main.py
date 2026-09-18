from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.rides import router
from app.api.location import router as location_router
from app.location.base import LocationProvider, LocationError
from app.location.amazon_location import AmazonLocationProvider
from app.core.config import Settings
from app.repositories.ride_repository import InMemoryRideRepository, RideRepository
from app.services.ride_service import RideNotFound
from app.api.fares import router as fare_router
from app.fares.base import FareProvider
from app.fares.telangana import TelanganaFareProvider
from app.repositories.fare_report_repository import FareReportRepository, InMemoryFareReportRepository, DuplicateFareReport
from app.services.fare_service import FareService, FareError


def create_app(repository: RideRepository | None = None, location_provider: LocationProvider | None = None, fare_repository: FareReportRepository | None = None, fare_provider: FareProvider | None = None) -> FastAPI:
    settings = Settings()
    application = FastAPI(title="RideWatch API", version="0.1.0")
    application.state.ride_repository = repository if repository is not None else InMemoryRideRepository()
    application.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type"])
    application.state.fare_service = FareService(fare_provider or TelanganaFareProvider(), fare_repository if fare_repository is not None else InMemoryFareReportRepository())
    application.include_router(fare_router)
    application.include_router(router)
    application.include_router(location_router)
    application.state.location_provider = location_provider if location_provider is not None else AmazonLocationProvider(settings.aws_region)

    @application.exception_handler(FareError)
    async def fare_error(request: Request, error: FareError):
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @application.exception_handler(DuplicateFareReport)
    async def duplicate_fare(request: Request, error: DuplicateFareReport):
        return JSONResponse(status_code=409, content={"detail": "A fare has already been reported for this ride"})

    @application.exception_handler(LocationError)
    async def location_error(request: Request, error: LocationError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(error)})

    @application.exception_handler(RideNotFound)
    async def not_found(request: Request, error: RideNotFound):
        return JSONResponse(status_code=404, content={"detail": "Ride not found"})

    @application.get("/health")
    def health():
        return {"status": "ok", "service": "ridewatch-api"}

    return application


app = create_app()
