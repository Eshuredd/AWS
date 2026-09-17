from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from app.location.base import LocationProvider
from app.schemas.location import Latitude, Longitude, PlaceSearchResponse, RouteRequest, RouteEstimate

router = APIRouter(prefix="/api", tags=["location"])


def get_location_provider(request: Request) -> LocationProvider:
    return request.app.state.location_provider


Provider = Annotated[LocationProvider, Depends(get_location_provider)]


@router.get("/places/search", response_model=PlaceSearchResponse)
def search_places(provider: Provider, q: Annotated[str, Query(min_length=3, max_length=200)],
                  lat: Latitude | None = None, lng: Longitude | None = None) -> PlaceSearchResponse:
    query = q.strip()
    if len(query) < 3:
        raise HTTPException(422, "Search must contain at least 3 characters")
    if (lat is None) != (lng is None):
        raise HTTPException(422, "Supply both lat and lng for location bias")
    return PlaceSearchResponse(results=provider.search_places(query, lat, lng)[:5])


@router.post("/route-estimate", response_model=RouteEstimate)
def route_estimate(data: RouteRequest, provider: Provider) -> RouteEstimate:
    return provider.calculate_route(**data.model_dump())
