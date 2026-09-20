from datetime import datetime, timedelta
from uuid import UUID, uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.services.share_service import ShareService
from test_location import FakeLocationProvider
from test_monitoring import Clock


@pytest.fixture
def session():
    clock = Clock()
    app = create_app(location_provider=FakeLocationProvider(), clock=clock)
    with TestClient(app) as client:
        points = dict(start_lat=17.44, start_lng=78.49, destination_lat=17.44, destination_lng=78.51)
        route = client.post("/api/route-estimate", json=points).json()
        fare = client.post("/api/fare-estimate", json={**points, "distance_km": route["distance_km"], "duration_minutes": route["duration_minutes"]}).json()
        ride = client.post("/api/rides", json={**points, "destination": "Station", "vehicle_number": "TS09AB1234",
                           "expected_distance_km": route["distance_km"], "expected_duration_minutes": route["duration_minutes"],
                           "route_estimate_id": route["route_estimate_id"], "fare_estimate_id": fare["estimate_id"]}).json()
        yield client, clock, app, ride


def create_share(client, ride):
    response = client.post(f"/api/rides/{ride['id']}/share")
    assert response.status_code == 201
    return response.json()


def test_create_token_is_secret_and_not_in_ride(session):
    client, _, _, ride = session
    shared = create_share(client, ride)
    assert shared["token"] != ride["id"]
    assert len(shared["token"]) >= 43  # token_urlsafe(32): at least 256 random bits.
    assert "token" not in client.get(f"/api/rides/{ride['id']}").text


def test_read_only_share_state_and_latest_location_replaces(session):
    client, clock, app, ride = session
    shared = create_share(client, ride)
    location_url = f"/api/rides/{ride['id']}/locations"
    client.post(location_url, json={"latitude": 17.44, "longitude": 78.50, "accuracy_m": 20})
    clock.advance(5)
    client.post(location_url, json={"latitude": 17.45, "longitude": 78.51, "accuracy_m": 12})
    response = client.get(f"/api/share/{shared['token']}")
    assert response.status_code == 200
    body = response.json()
    assert body["destination"] == "Station" and body["vehicle_number"] == "TS09AB1234"
    assert body["current_location"] == {"latitude": 17.45, "longitude": 78.51, "accuracy_m": 12.0,
                                        "updated_at": clock().isoformat().replace("+00:00", "Z")}
    state = app.state.storage.monitoring.get(UUID(ride["id"]))
    assert "history" not in state.model_dump() and not isinstance(state.latest_location, list)
    assert set(body) == {"ride_status", "destination", "vehicle_number", "started_at", "ended_at",
                         "expected_distance_km", "expected_duration_minutes", "gps_status", "route_status",
                         "stop_status", "delay_status", "last_updated_at", "current_location"}
    assert client.post(f"/api/share/{shared['token']}").status_code == 405
    assert client.patch(f"/api/share/{shared['token']}").status_code == 405


def test_invalid_expired_and_revoked_tokens(session):
    client, clock, _, ride = session
    assert client.get("/api/share/not-a-token").status_code == 404
    expired = create_share(client, ride)
    clock.advance(24 * 60 * 60)
    assert client.get(f"/api/share/{expired['token']}").status_code == 404
    clock.now -= timedelta(hours=24)
    revoked = create_share(client, ride)
    assert client.delete(f"/api/share/{revoked['token']}").status_code == 204
    assert client.get(f"/api/share/{revoked['token']}").status_code == 404


def test_completed_ride_has_no_live_location_and_grace_expires(session):
    client, clock, _, ride = session
    shared = create_share(client, ride)
    client.post(f"/api/rides/{ride['id']}/locations", json={"latitude": 17.44, "longitude": 78.50, "accuracy_m": 10})
    ended = client.patch(f"/api/rides/{ride['id']}/end").json()
    body = client.get(f"/api/share/{shared['token']}").json()
    assert body["ride_status"] == "COMPLETED" and body["ended_at"] == ended["ended_at"]
    assert body["current_location"] is None
    clock.now = datetime.fromisoformat(ended["ended_at"].replace("Z", "+00:00")) + timedelta(hours=1)
    assert client.get(f"/api/share/{shared['token']}").status_code == 404
    assert client.post(f"/api/rides/{ride['id']}/share").status_code == 409


def test_hash_is_sha256_and_bearer_is_not_stored(session):
    client, _, app, ride = session
    shared = create_share(client, ride)
    digest = ShareService.token_hash(shared["token"])
    assert len(digest) == 64
    assert app.state.storage.shares.get(digest).ride_id == UUID(ride["id"])
    assert app.state.storage.shares.get(shared["token"]) is None
