from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def payload():
    return {"start_lat": 17.0, "start_lng": 78.0, "destination": " Secunderabad Railway Station ", "vehicle_number": "ts 09 ab 1234"}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "service": "ridewatch-api"}


def test_create_and_fetch(client, payload):
    response = client.post("/api/rides", json=payload)
    assert response.status_code == 201
    ride = response.json()
    assert ride["status"] == "ACTIVE"
    assert ride["vehicle_number"] == "TS09AB1234"
    assert ride["destination"] == payload["destination"].strip()
    assert ride["ended_at"] is None
    assert ride["started_at"].endswith("Z")
    assert client.get(f"/api/rides/{ride['id']}").json() == ride


@pytest.mark.parametrize("method,path", [("get", ""), ("patch", "/end")])
def test_missing(client, method, path):
    assert getattr(client, method)(f"/api/rides/{uuid4()}{path}").status_code == 404


def test_end(client, payload):
    ride = client.post("/api/rides", json=payload).json()
    url = f"/api/rides/{ride['id']}/end"
    response = client.patch(url)
    assert response.status_code == 200
    ended = response.json()
    assert ended["status"] == "COMPLETED"
    assert ended["ended_at"] >= ended["started_at"]
    assert client.patch(url).json() == ended
    assert client.get(f"/api/rides/{ride['id']}").json() == ended


@pytest.mark.parametrize("destination", ["", "   ", "x" * 201])
def test_invalid_destination(client, payload, destination):
    payload["destination"] = destination
    assert client.post("/api/rides", json=payload).status_code == 422


@pytest.mark.parametrize("field,value", [("start_lat", -91), ("start_lat", 91), ("start_lng", -181), ("start_lng", 181)])
def test_invalid_coordinates(client, payload, field, value):
    payload[field] = value
    assert client.post("/api/rides", json=payload).status_code == 422


@pytest.mark.parametrize("number,expected", [(None, None), ("", None), ("22 bh 1234 aa", "22BH1234AA"), ("DL 1 C 123", "DL1C123")])
def test_optional_vehicle(client, payload, number, expected):
    payload["vehicle_number"] = number
    response = client.post("/api/rides", json=payload)
    assert response.status_code == 201
    assert response.json()["vehicle_number"] == expected


def test_invalid_vehicle(client, payload):
    payload["vehicle_number"] = "???"
    assert client.post("/api/rides", json=payload).status_code == 422


def test_cors(client):
    response = client.options("/api/rides", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
