from unittest.mock import Mock
import boto3
from botocore.stub import Stubber
from botocore.exceptions import NoCredentialsError, EndpointConnectionError
from fastapi.testclient import TestClient
import pytest
from app.main import create_app
from app.location.base import LocationProvider, SearchUnavailable, RouteUnavailable
from app.location.amazon_location import AmazonLocationProvider
from app.schemas.location import PlaceResult, RouteEstimate


class FakeLocationProvider(LocationProvider):
    def __init__(self):
        self.search_calls = []
        self.route_calls = []
        self.fail = False

    def search_places(self, query, bias_lat=None, bias_lng=None):
        self.search_calls.append((query, bias_lat, bias_lng))
        if self.fail:
            raise SearchUnavailable()
        return [PlaceResult(id="test-place", label="Secunderabad Junction, India", latitude=17.433, longitude=78.501)]

    def calculate_route(self, start_lat, start_lng, destination_lat, destination_lng):
        self.route_calls.append((start_lat, start_lng, destination_lat, destination_lng))
        if self.fail:
            raise RouteUnavailable()
        return RouteEstimate(distance_km=9.2, duration_minutes=31)


@pytest.fixture
def provider():
    return FakeLocationProvider()


@pytest.fixture
def client(provider):
    with TestClient(create_app(location_provider=provider)) as client:
        yield client


@pytest.fixture
def coordinates():
    return {"start_lat": 17.44, "start_lng": 78.49, "destination_lat": 17.433, "destination_lng": 78.501}


def test_search_success(client, provider):
    response = client.get("/api/places/search", params={"q": " Secunderabad "})
    assert response.status_code == 200
    assert response.json()["results"][0]["latitude"] == 17.433
    assert provider.search_calls == [("Secunderabad", None, None)]


def test_search_bias(client, provider):
    assert client.get("/api/places/search?q=station&lat=17.44&lng=78.49").status_code == 200
    assert provider.search_calls == [("station", 17.44, 78.49)]


@pytest.mark.parametrize("params", [{"q": "ab"}, {"q": "   "}, {"q": "  a "}, {"q": "x" * 201}, {"q": "station", "lat": 17}, {"q": "station", "lat": 91, "lng": 78}, {"q": "station", "lat": 17, "lng": "NaN"}])
def test_search_invalid(client, provider, params):
    assert client.get("/api/places/search", params=params).status_code == 422
    assert provider.search_calls == []


def test_route_success(client, provider, coordinates):
    response = client.post("/api/route-estimate", json=coordinates)
    assert response.status_code == 200
    assert response.json() == {"distance_km": 9.2, "duration_minutes": 31}
    assert provider.route_calls == [(17.44, 78.49, 17.433, 78.501)]


@pytest.mark.parametrize("field,value", [("start_lat", 91), ("start_lng", -181), ("destination_lat", -91), ("destination_lng", 181), ("destination_lat", "NaN"), ("start_lat", "Infinity")])
def test_route_invalid(client, provider, coordinates, field, value):
    coordinates[field] = value
    assert client.post("/api/route-estimate", json=coordinates).status_code == 422
    assert provider.route_calls == []


def test_failures(client, provider, coordinates):
    provider.fail = True
    response = client.get("/api/places/search?q=station")
    assert response.status_code == 503
    assert response.json() == {"detail": "Destination search is temporarily unavailable"}
    response = client.post("/api/route-estimate", json=coordinates)
    assert response.status_code == 503
    assert response.json() == {"detail": "Unable to calculate this route"}


def test_ride_estimate_round_trip(client, coordinates):
    estimate = client.post("/api/route-estimate", json=coordinates).json()
    payload = {**coordinates, "destination": "Secunderabad Junction", "expected_distance_km": estimate["distance_km"], "expected_duration_minutes": estimate["duration_minutes"]}
    response = client.post("/api/rides", json=payload)
    assert response.status_code == 201
    ride = response.json()
    for key, value in payload.items():
        assert ride[key] == value
    assert client.get(f"/api/rides/{ride['id']}").json() == ride
    ended = client.patch(f"/api/rides/{ride['id']}/end").json()
    assert ended["expected_distance_km"] == 9.2
    assert ended["expected_duration_minutes"] == 31
    assert ended["status"] == "COMPLETED"


@pytest.mark.parametrize("field,value", [("destination_lat", 91), ("destination_lng", -181), ("expected_distance_km", 0), ("expected_distance_km", -1), ("expected_distance_km", "Infinity"), ("expected_duration_minutes", 0), ("expected_duration_minutes", -1), ("expected_duration_minutes", 1.2), ("expected_duration_minutes", True), ("destination_lat", None)])
def test_invalid_ride_route(client, coordinates, field, value):
    payload = {**coordinates, "destination": "Station", "expected_distance_km": 9.2, "expected_duration_minutes": 31}
    payload[field] = value
    assert client.post("/api/rides", json=payload).status_code == 422


def sdk_client(service):
    # Non-secret test placeholders prevent any credential-chain/network lookup.
    return boto3.client(service, region_name="ap-south-1", aws_access_key_id="testing", aws_secret_access_key="testing")


@pytest.mark.parametrize("bias", [False, True])
def test_aws_search_contract(bias):
    sdk = sdk_client("geo-places")
    params = {"QueryText": "Station", "MaxResults": 5, "Filter": {"IncludeCountries": ["IND"]}, "IntendedUse": "Storage"}
    if bias:
        params["BiasPosition"] = [78.49, 17.44]
    with Stubber(sdk) as stub:
        stub.add_response("search_text", {"PricingBucket": "test", "ResultItems": [{"PlaceType": "PointOfInterest", "PlaceId": "place", "Title": "Station", "Address": {"Label": "Hyderabad, India"}, "Position": [78.501, 17.433]}]}, params)
        provider = AmazonLocationProvider("ap-south-1", places_client=sdk)
        results = provider.search_places("Station", 17.44 if bias else None, 78.49 if bias else None)
        assert results[0].model_dump() == {"id": "place", "label": "Station, Hyderabad, India", "latitude": 17.433, "longitude": 78.501}
        stub.assert_no_pending_responses()


@pytest.mark.parametrize("response", [{"ResultItems": []}, {}])
def test_aws_empty_search(response):
    sdk = Mock()
    sdk.search_text.return_value = response
    assert AmazonLocationProvider("ap-south-1", places_client=sdk).search_places("Unknown") == []


def test_aws_route_contract():
    sdk = sdk_client("geo-routes")
    with Stubber(sdk) as stub:
        stub.add_response("calculate_routes", {"LegGeometryFormat": "Simple", "Notices": [], "PricingBucket": "test", "Routes": [{"Summary": {"Distance": 9200, "Duration": 1801}, "Legs": [], "MajorRoadLabels": []}]}, {"Origin": [78.49, 17.44], "Destination": [78.501, 17.433], "TravelMode": "Car", "OptimizeRoutingFor": "FastestRoute", "MaxAlternatives": 0})
        provider = AmazonLocationProvider("ap-south-1", routes_client=sdk)
        assert provider.calculate_route(17.44, 78.49, 17.433, 78.501).model_dump() == {"distance_km": 9.2, "duration_minutes": 31}
        stub.assert_no_pending_responses()


@pytest.mark.parametrize("response", [{"Routes": []}, {}, {"Routes": [{"Summary": {"Distance": 0, "Duration": 12}}]}, {"Routes": [{"Summary": {"Distance": 1, "Duration": 0}}]}, {"Routes": [{"Summary": {"Distance": float("inf"), "Duration": 1}}]}])
def test_invalid_upstream_route(response):
    sdk = Mock()
    sdk.calculate_routes.return_value = response
    with pytest.raises(RouteUnavailable):
        AmazonLocationProvider("ap-south-1", routes_client=sdk).calculate_route(17, 78, 18, 79)


@pytest.mark.parametrize("exception", [NoCredentialsError(), EndpointConnectionError(endpoint_url="https://test.invalid")])
def test_aws_errors_are_safe(exception, caplog):
    sdk = Mock()
    sdk.search_text.side_effect = exception
    provider = AmazonLocationProvider("ap-south-1", places_client=sdk)
    with pytest.raises(SearchUnavailable, match="Destination search is temporarily unavailable"):
        provider.search_places("private destination")
    assert "private destination" not in caplog.text
    assert "test.invalid" not in caplog.text


def test_aws_access_denied():
    sdk = sdk_client("geo-routes")
    with Stubber(sdk) as stub:
        stub.add_client_error("calculate_routes", service_error_code="AccessDeniedException", service_message="sensitive upstream detail", http_status_code=403)
        provider = AmazonLocationProvider("ap-south-1", routes_client=sdk)
        with TestClient(create_app(location_provider=provider)) as client:
            response = client.post("/api/route-estimate", json={"start_lat": 17, "start_lng": 78, "destination_lat": 18, "destination_lng": 79})
        assert response.status_code == 503
        assert "sensitive" not in response.text


def test_startup_does_not_load_aws_credentials(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Startup must not create AWS clients")
    monkeypatch.setattr(boto3.session, "Session", forbidden)
    with TestClient(create_app()) as client:
        assert client.get("/health").status_code == 200
