from datetime import datetime, timezone, timedelta
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.schemas.location import RoutePoint
from app.services.monitoring_service import distance_to_route
from test_location import FakeLocationProvider


class Clock:
    def __init__(self):
        self.now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    def __call__(self):
        return self.now
    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def session():
    clock = Clock()
    app = create_app(location_provider=FakeLocationProvider(), clock=clock)
    with TestClient(app) as client:
        coordinates = dict(start_lat=17.44, start_lng=78.49, destination_lat=17.44, destination_lng=78.51)
        quote = client.post('/api/route-estimate', json=coordinates).json()
        payload = dict(**coordinates, destination='Station', expected_distance_km=quote['distance_km'], expected_duration_minutes=quote['duration_minutes'], route_estimate_id=quote['route_estimate_id'])
        fare = client.post('/api/fare-estimate', json=dict(**coordinates, distance_km=quote['distance_km'], duration_minutes=quote['duration_minutes'])).json()
        payload['fare_estimate_id'] = fare['estimate_id']
        ride = client.post('/api/rides', json=payload).json()
        yield client, clock, ride, payload, app


def send(session, lat=17.44, lng=78.50, accuracy=10, seconds=5):
    client, clock, ride, *_ = session
    clock.advance(seconds)
    result = client.post(f"/api/rides/{ride['id']}/locations", json=dict(latitude=lat, longitude=lng, accuracy_m=accuracy))
    assert result.status_code == 200
    return result.json()


def point(lat, lng):
    return RoutePoint(latitude=lat, longitude=lng)


def test_segment_distances():
    line = [point(17, 78), point(17, 78.02)]
    assert distance_to_route(point(17, 78.01), line) == pytest.approx(0)
    assert distance_to_route(point(17.001, 78.01), line) == pytest.approx(111.2, abs=1)
    assert distance_to_route(point(17, 78.03), line) > 1000
    assert distance_to_route(point(17.01, 78.02), line + [point(17.02, 78.02)]) == pytest.approx(0)
    assert distance_to_route(point(17, 78), [point(17, 78), point(17, 78)]) == 0


def test_deviation_and_recovery(session):
    assert send(session, lat=17.45)['route_status'] == 'POSSIBLE_DEVIATION'
    assert send(session, lat=17.45)['route_status'] == 'POSSIBLE_DEVIATION'
    assert send(session, lat=17.45)['route_status'] == 'DEVIATED'
    assert send(session)['route_status'] == 'DEVIATED'
    assert send(session)['route_status'] == 'ON_ROUTE'


def test_poor_quality_resets_evidence(session):
    send(session, lat=17.45)
    state = send(session, lat=17.45, accuracy=101)
    assert state['gps_status'] == 'POOR'
    assert state['route_status'] == 'UNKNOWN'
    assert state['stop_status'] == 'UNKNOWN'
    assert send(session, lat=17.45)['route_status'] == 'POSSIBLE_DEVIATION'


def test_uncertainty_threshold(session):
    for _ in range(3):
        assert send(session, lat=17.442, accuracy=100)['route_status'] == 'ON_ROUTE'


def test_stop_and_resume(session):
    assert send(session)['stop_status'] == 'MOVING'
    for _ in range(5):
        assert send(session, seconds=30)['stop_status'] == 'MOVING'
    assert send(session, seconds=30)['stop_status'] == 'PROLONGED_STOP'
    assert send(session, lng=78.501)['stop_status'] == 'MOVING'


def test_gaps_and_accuracy_cannot_create_stop(session):
    send(session)
    assert send(session, seconds=180)['stop_status'] == 'MOVING'
    for _ in range(7):
        assert send(session, accuracy=50, seconds=30)['stop_status'] == 'UNKNOWN'
    assert send(session)['stop_status'] == 'MOVING'


def test_delay_boundary_and_staleness(session):
    client, clock, ride, *_ = session
    send(session)
    url = f"/api/rides/{ride['id']}/monitoring"
    clock.now = datetime.fromisoformat(ride['started_at'].replace('Z', '+00:00')) + timedelta(seconds=1801 * 1.5 + 300)
    state = client.get(url).json()
    assert state['delay_status'] == 'ON_TIME'
    assert state['gps_status'] == 'STALE'
    assert state['route_status'] == 'UNKNOWN'
    clock.advance(.001)
    assert client.get(url).json()['delay_status'] == 'DELAYED'


def test_throttle_and_no_history(session):
    first = send(session)
    assert send(session, lat=17.45, seconds=0) == first
    assert set(first) == {'ride_id', 'gps_status', 'route_status', 'stop_status', 'delay_status', 'last_updated_at', 'distance_from_route_m'}


@pytest.mark.parametrize('field,value', [('latitude',91), ('longitude',181), ('latitude','NaN'), ('longitude','Infinity'), ('accuracy_m',0), ('accuracy_m',-1), ('accuracy_m',10001), ('accuracy_m','NaN'), ('accuracy_m','Infinity'), ('timestamp','2020-01-01')])
def test_invalid_samples(session, field, value):
    client, _, ride, *_ = session
    payload = dict(latitude=17, longitude=78, accuracy_m=10)
    payload[field] = value
    assert client.post(f"/api/rides/{ride['id']}/locations", json=payload).status_code == 422


def test_missing_completed_and_cleanup(session):
    client, _, ride, _, app = session
    payload = dict(latitude=17, longitude=78, accuracy_m=10)
    assert client.post(f'/api/rides/{uuid4()}/locations', json=payload).status_code == 404
    assert client.get(f'/api/rides/{uuid4()}/monitoring').status_code == 404
    send(session)
    client.patch(f"/api/rides/{ride['id']}/end")
    assert not app.state.monitoring_service._states
    assert client.post(f"/api/rides/{ride['id']}/locations", json=payload).status_code == 409
    assert client.get(f"/api/rides/{ride['id']}/monitoring").status_code == 409


def test_quote_snapshot_and_expiry(session):
    client, clock, ride, payload, _ = session
    assert ride['expected_route']['route_estimate_id'] == payload['route_estimate_id']
    assert ride['expected_route']['route_geometry'][0] == dict(latitude=17.44, longitude=78.49)
    assert ride['fare_estimate']['estimate_id'] == payload['fare_estimate_id']
    clock.advance(300)
    assert client.post('/api/rides', json=payload).status_code == 409


@pytest.mark.parametrize('change', [dict(start_lat=17.43), dict(destination_lng=78.52), dict(expected_distance_km=10), dict(expected_duration_minutes=20), dict(route_estimate_id=str(uuid4()))])
def test_mismatched_quote(session, change):
    client, _, _, payload, _ = session
    assert client.post('/api/rides', json={**payload, **change}).status_code == 409


@pytest.mark.parametrize('field', ['route_geometry', 'expected_route', 'duration_seconds', 'traffic_aware'])
def test_cannot_forge_route(session, field):
    client, _, _, payload, _ = session
    assert client.post('/api/rides', json={**payload, field: []}).status_code == 422
