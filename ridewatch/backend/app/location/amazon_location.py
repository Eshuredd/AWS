import logging
import math
from threading import Lock
from typing import Any
import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from app.location.base import LocationProvider, SearchUnavailable, RouteUnavailable
from app.schemas.location import PlaceResult, RouteEstimate, RoutePoint

logger = logging.getLogger(__name__)
_PROVIDER_ERRORS = (BotoCoreError, ClientError, KeyError, IndexError, TypeError, ValueError)


class AmazonLocationProvider(LocationProvider):
    """Current Places/Routes APIs. Clients initialize lazily; health needs no credentials."""
    def __init__(self, region: str | None, *, profile: str | None = None, places_client: Any = None, routes_client: Any = None) -> None:
        self.region = region
        self.profile = profile
        self._session = None
        self._clients: dict[str, Any] = {}
        if places_client is not None:
            self._clients["geo-places"] = places_client
        if routes_client is not None:
            self._clients["geo-routes"] = routes_client
        self._lock = Lock()

    def _client(self, service: str) -> Any:
        with self._lock:
            if service not in self._clients:
                if self._session is None:
                    if self.profile:
                        self._session = boto3.session.Session(
                            profile_name=self.profile, region_name=self.region,
                        )
                    else:
                        self._session = boto3.session.Session(region_name=self.region)
                self._clients[service] = self._session.client(
                    service,
                    config=Config(connect_timeout=3, read_timeout=5,
                                  retries={"mode": "standard", "total_max_attempts": 2}),
                )
            return self._clients[service]

    @staticmethod
    def _log_failure(operation: str, error: Exception) -> None:
        # Never log request coordinates, free text, credential values or exception messages.
        logger.warning("Amazon Location %s failed (%s)", operation, type(error).__name__)

    def search_places(self, query: str, bias_lat: float | None = None,
                      bias_lng: float | None = None) -> list[PlaceResult]:
        params: dict[str, Any] = {
            "QueryText": query, "MaxResults": 5,
            "Filter": {"IncludeCountries": ["IND"]},
            "IntendedUse": "Storage",  # Selected labels/coordinates are retained in rides.
        }
        if bias_lat is not None and bias_lng is not None:
            params["BiasPosition"] = [bias_lng, bias_lat]
        try:
            response = self._client("geo-places").search_text(**params)
            return [self._place(item) for item in response.get("ResultItems", [])[:5]]
        except _PROVIDER_ERRORS as error:
            self._log_failure("SearchText", error)
            raise SearchUnavailable() from error

    @staticmethod
    def _place(item: dict[str, Any]) -> PlaceResult:
        longitude, latitude = item["Position"]
        label = item.get("Address", {}).get("Label") or item["Title"]
        title = item.get("Title")
        if title and title.casefold() not in label.casefold():
            label = f"{title}, {label}"
        return PlaceResult(id=item.get("PlaceId"), label=label,
                           latitude=latitude, longitude=longitude)

    def calculate_route(self, start_lat: float, start_lng: float,
                        destination_lat: float, destination_lng: float) -> RouteEstimate:
        try:
            response = self._client("geo-routes").calculate_routes(
                Origin=[start_lng, start_lat], Destination=[destination_lng, destination_lat],
                TravelMode="Car", OptimizeRoutingFor="FastestRoute", MaxAlternatives=0,
                DepartNow=True, Traffic={"Usage": "UseTrafficData"}, LegGeometryFormat="Simple",
            )
            summary = response["Routes"][0]["Summary"]
            distance = float(summary["Distance"])
            duration = float(summary["Duration"])
            if not math.isfinite(duration) or duration <= 0:
                raise ValueError("Nonpositive or nonfinite duration")
            geometry = []
            for leg in response["Routes"][0]["Legs"]:
                points = [RoutePoint(longitude=lng, latitude=lat) for lng, lat in leg["Geometry"]["LineString"]]
                if len(points) < 2:
                    raise ValueError("Unusable route geometry")
                if geometry and geometry[-1] != points[0]:
                    raise ValueError("Disconnected route geometry")
                geometry.extend(points[1:] if geometry else points)
            if len(set((p.latitude, p.longitude) for p in geometry)) < 2:
                raise ValueError("Unusable route geometry")
            return RouteEstimate(distance_km=distance / 1000, duration_minutes=math.ceil(duration / 60), duration_seconds=duration, route_geometry=tuple(geometry), traffic_aware=True)
        except _PROVIDER_ERRORS as error:
            self._log_failure("CalculateRoutes", error)
            raise RouteUnavailable() from error
