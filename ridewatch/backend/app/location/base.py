from abc import ABC, abstractmethod
from app.schemas.location import PlaceResult, RouteEstimate


class LocationError(Exception):
    """A safe public message, separate from upstream exceptions."""


class SearchUnavailable(LocationError):
    def __init__(self) -> None:
        super().__init__("Destination search is temporarily unavailable")


class RouteUnavailable(LocationError):
    def __init__(self) -> None:
        super().__init__("Unable to calculate this route")


class LocationProvider(ABC):
    @abstractmethod
    def search_places(self, query: str, bias_lat: float | None = None,
                      bias_lng: float | None = None) -> list[PlaceResult]: ...

    @abstractmethod
    def calculate_route(self, start_lat: float, start_lng: float,
                        destination_lat: float, destination_lng: float) -> RouteEstimate: ...
