from datetime import datetime, timezone
from uuid import UUID, uuid4
from app.models.ride import Ride, RideStatus
from app.repositories.ride_repository import RideRepository
from app.schemas.ride import CreateRide


class RideNotFound(Exception):
    pass


class RideService:
    def __init__(self, repository: RideRepository) -> None:
        self.repository = repository

    def create(self, data: CreateRide) -> Ride:
        return self.repository.save(Ride(id=uuid4(), **data.model_dump(), status=RideStatus.ACTIVE, started_at=datetime.now(timezone.utc)))

    def get(self, ride_id: UUID) -> Ride:
        ride = self.repository.get(ride_id)
        if ride is None:
            raise RideNotFound()
        return ride

    def end(self, ride_id: UUID) -> Ride:
        ride = self.repository.end(ride_id)
        if ride is None:
            raise RideNotFound()
        return ride
