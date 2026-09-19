from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.rides import router
from app.api.location import router as location_router
from app.location.base import LocationProvider, LocationError
from app.location.amazon_location import AmazonLocationProvider
from app.core.config import Settings
from app.repositories.ride_repository import RideRepository
from app.services.ride_service import RideNotFound
from app.api.fares import router as fare_router
from app.fares.base import FareProvider
from app.fares.telangana import TelanganaFareProvider
from app.repositories.fare_report_repository import FareReportRepository, DuplicateFareReport
from app.services.fare_service import FareService, FareError
from app.services.route_service import RouteService, utc_now
from app.services.monitoring_service import MonitoringService, MonitoringRules
from app.repositories.storage import create_storage
from app.repositories.errors import StorageUnavailable, WriteConflict


def create_app(repository: RideRepository | None = None, location_provider: LocationProvider | None = None,
               fare_repository: FareReportRepository | None = None, fare_provider: FareProvider | None = None,
               clock=utc_now, monitoring_rules=MonitoringRules(), *, settings: Settings | None = None,
               route_quote_repository=None, fare_quote_repository=None, monitoring_repository=None,
               dynamodb_client=None) -> FastAPI:
    settings = settings if settings is not None else Settings()
    storage = create_storage(settings, clock, rides=repository, reports=fare_repository,
                             routes=route_quote_repository, fares=fare_quote_repository,
                             monitoring=monitoring_repository, client=dynamodb_client)
    application = FastAPI(title="RideWatch API", version="0.1.0")
    application.state.storage = storage
    application.state.ride_repository = storage.rides
    application.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type"])
    application.state.fare_service = FareService(fare_provider or TelanganaFareProvider(), storage.reports,
                                               quote_repository=storage.fares, clock=clock,
                                               quote_max_age_seconds=settings.route_estimate_max_age_seconds)
    application.include_router(fare_router)
    application.include_router(router)
    application.include_router(location_router)
    application.state.location_provider = location_provider if location_provider is not None else AmazonLocationProvider(settings.aws_region, profile=settings.aws_profile)
    application.state.clock = clock
    application.state.route_service = RouteService(application.state.location_provider, clock, settings.route_estimate_max_age_seconds, storage.routes)
    application.state.monitoring_service = MonitoringService(storage.rides, clock, monitoring_rules, storage.monitoring)

    @application.exception_handler(StorageUnavailable)
    async def storage_unavailable(request: Request, error: StorageUnavailable):
        return JSONResponse(status_code=503, content={"detail": str(error)})

    @application.exception_handler(WriteConflict)
    async def storage_conflict(request: Request, error: WriteConflict):
        return JSONResponse(status_code=409, content={"detail": "RideWatch state changed. Please retry."})

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
