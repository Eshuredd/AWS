from dataclasses import dataclass
from app.repositories.ride_repository import RideRepository, InMemoryRideRepository
from app.repositories.fare_report_repository import FareReportRepository, InMemoryFareReportRepository
from app.repositories.quote_repository import (
    RouteQuoteRepository, FareQuoteRepository, InMemoryRouteQuoteRepository, InMemoryFareQuoteRepository,
)
from app.repositories.monitoring_repository import MonitoringStateRepository, InMemoryMonitoringStateRepository
from app.repositories.share_repository import ShareSessionRepository, InMemoryShareSessionRepository
from app.repositories.dynamodb import (
    DynamoDBStore, DynamoDBRideRepository, DynamoDBFareReportRepository,
    DynamoDBRouteQuoteRepository, DynamoDBFareQuoteRepository, DynamoDBMonitoringStateRepository,
    DynamoDBShareSessionRepository,
)


@dataclass
class Repositories:
    rides: RideRepository
    reports: FareReportRepository
    routes: RouteQuoteRepository
    fares: FareQuoteRepository
    monitoring: MonitoringStateRepository
    shares: ShareSessionRepository


def create_storage(settings, clock, *, rides=None, reports=None, routes=None, fares=None, monitoring=None, shares=None, client=None):
    """One mode decision. Explicit repository injections take precedence."""
    if settings.storage_backend == "memory":
        rides = rides if rides is not None else InMemoryRideRepository()
        return Repositories(
            rides, reports if reports is not None else InMemoryFareReportRepository(),
            routes if routes is not None else InMemoryRouteQuoteRepository(),
            fares if fares is not None else InMemoryFareQuoteRepository(),
            monitoring if monitoring is not None else InMemoryMonitoringStateRepository(rides),
            shares if shares is not None else InMemoryShareSessionRepository(),
        )
    store = DynamoDBStore(settings.dynamodb_table_name, settings.aws_region, settings.aws_profile, client)
    return Repositories(
        rides if rides is not None else DynamoDBRideRepository(store, clock),
        reports if reports is not None else DynamoDBFareReportRepository(store),
        routes if routes is not None else DynamoDBRouteQuoteRepository(store),
        fares if fares is not None else DynamoDBFareQuoteRepository(store),
        monitoring if monitoring is not None else DynamoDBMonitoringStateRepository(store),
        shares if shares is not None else DynamoDBShareSessionRepository(store),
    )
