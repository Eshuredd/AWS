from datetime import datetime, timezone
from uuid import uuid4, UUID
from unittest.mock import Mock
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import boto3
import pytest
from botocore.stub import Stubber, ANY
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.core.config import Settings
from app.main import create_app
from app.models.ride import Ride, RideStatus
from app.models.fare_report import FareReport
from app.models.quotes import RouteQuote
from app.models.monitoring import MonitoringState
from app.schemas.fare import DropLocation, TypicalFare
from app.schemas.location import RouteRequest, RoutePoint
from app.schemas.monitoring import LocationSample, MonitoringResponse
from app.repositories.dynamodb import (
    DynamoDBStore, DynamoDBRideRepository, DynamoDBFareReportRepository,
    DynamoDBMonitoringStateRepository, DynamoDBRouteQuoteRepository,
    encode, decode, model_item, model_from_item,
)
from app.repositories.errors import WriteConflict, RideNotActive, StorageUnavailable
from app.repositories.fare_report_repository import DuplicateFareReport
from app.repositories.ride_repository import InMemoryRideRepository
from test_location import FakeLocationProvider
from test_monitoring import Clock
from fake_dynamodb import FakeDynamoDB


def config():
    return Settings(_env_file=None, storage_backend="dynamodb", dynamodb_table_name="ridewatch-test", aws_region="ap-south-1")


@pytest.fixture
def setup():
    client, clock = FakeDynamoDB(), Clock()
    settings = config()
    app = create_app(settings=settings, dynamodb_client=client, clock=clock, location_provider=FakeLocationProvider())
    coordinates = dict(start_lat=17.44, start_lng=78.49, destination_lat=17.44, destination_lng=78.51)
    with TestClient(app) as api:
        quote = api.post('/api/route-estimate', json=coordinates).json()
        fare = api.post('/api/fare-estimate', json={**coordinates, 'distance_km': quote['distance_km'], 'duration_minutes': quote['duration_minutes']}).json()
        payload = {**coordinates, 'destination': 'Station', 'route_estimate_id': quote['route_estimate_id'], 'fare_estimate_id': fare['estimate_id'], 'expected_distance_km': quote['distance_km'], 'expected_duration_minutes': quote['duration_minutes']}
        response = api.post('/api/rides', json=payload)
        assert response.status_code == 201
        ride = app.state.storage.rides.get(UUID(response.json()['id']))
        yield client, clock, app, api, ride, payload


def test_model_round_trip(setup):
    _, _, _, _, ride, _ = setup
    item = model_item(f'ride#{ride.id}', 'RIDE', ride)
    assert model_from_item(Ride, item) == ride
    result = model_from_item(Ride, item)
    assert isinstance(result.id, UUID)
    assert isinstance(result.started_at, datetime)
    assert result.status is RideStatus.ACTIVE
    assert result.ended_at is None and result.vehicle_number is None
    assert result.fare_estimate.official_meter == ride.fare_estimate.official_meter
    assert result.expected_route.route_geometry == ride.expected_route.route_geometry
    assert item['data']['M']['start_lat'] == {'N': '17.44'}
    typical = TypicalFare(minimum=100, maximum=140, median=120, sample_count=5,
                          pickup_radius_m=200, destination_radius_m=200, confidence='MEDIUM')
    with_typical = ride.model_copy(update={'fare_estimate': ride.fare_estimate.model_copy(update={'typical_reported': typical})})
    assert model_from_item(Ride, model_item(f'ride#{ride.id}', 'RIDE', with_typical)) == with_typical


def test_ride_create_missing_and_repeated_completion(setup):
    _, clock, app, _, ride, _ = setup
    repo = app.state.storage.rides
    assert repo.get(ride.id) == ride
    assert repo.get(uuid4()) is None
    assert repo.end(uuid4()) is None
    ended = repo.end(ride.id, DropLocation(drop_location_source='GPS', drop_lat=17.45, drop_lng=78.5))
    clock.advance(60)
    assert repo.end(ride.id, DropLocation()) == ended
    assert ended.drop_lat == 17.45
    assert ended.fare_estimate == ride.fare_estimate
    with pytest.raises(WriteConflict):
        repo.save(ride)  # Cannot resurrect a ride via unconditional put.


def test_simultaneous_completers_preserve_winner(setup):
    client, clock, app, _, ride, _ = setup
    barrier = Barrier(2)
    class RacingRepository(DynamoDBRideRepository):
        def __init__(self):
            super().__init__(DynamoDBStore('ridewatch-test', client=client), clock)
            self.first = True
        def get(self, ride_id):
            value = super().get(ride_id)
            if self.first:
                self.first = False
                barrier.wait(timeout=5)
            return value
    repos = [RacingRepository(), RacingRepository()]
    drops = [DropLocation(drop_location_source='GPS', drop_lat=17.45, drop_lng=78.5), DropLocation()]
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(repo.end, ride.id, drop) for repo, drop in zip(repos, drops)]
        results = [future.result(timeout=10) for future in futures]
    assert results[0] == results[1] == app.state.storage.rides.get(ride.id)
    assert results[0].fare_estimate == ride.fare_estimate


def report(ride_id):
    return FareReport(ride_id=ride_id, pickup_lat=17.44, pickup_lng=78.49, drop_lat=17.44, drop_lng=78.51,
                      drop_location_source='GPS', route_distance_km=9.2, route_duration_minutes=31,
                      fare_paid=120, reported_at=datetime(2026, 1, 1, tzinfo=timezone.utc))


def test_fare_reports_atomic_and_paginated(setup):
    client, _, app, _, ride, _ = setup
    repo = app.state.storage.reports
    expected = report(ride.id)
    assert repo.save(expected) == expected
    assert repo.get_for_ride(ride.id) == expected
    assert repo.get_for_ride(uuid4()) is None
    with pytest.raises(DuplicateFareReport):
        repo.save(expected.model_copy(update={'fare_paid': 200}))
    assert repo.get_for_ride(ride.id).fare_paid == 120
    others = [report(uuid4()) for _ in range(4)]
    for value in others:
        repo.save(value)
    client.calls.clear()
    assert {value.ride_id for value in repo.list_all()} == {ride.id, *(value.ride_id for value in others)}
    scans = [args for method, args in client.calls if method == 'scan']
    assert len(scans) > 1 and 'ExclusiveStartKey' in scans[1]


def test_route_quote_ttl_and_application_expiry(setup):
    client, clock, app, api, ride, payload = setup
    quote = app.state.storage.routes.get(ride.route_estimate_id)
    assert isinstance(quote, RouteQuote)
    assert quote.estimate == ride.expected_route
    item = decode(client.items[f'route-quote#{ride.route_estimate_id}'])
    assert int(item['ttl']) == int(quote.estimate.expires_at.timestamp())
    assert quote.request == RouteRequest(**{key: payload[key] for key in ('start_lat','start_lng','destination_lat','destination_lng')})
    clock.advance(300)
    # Simulate asynchronous TTL: the item still exists, but the application rejects it.
    response = api.post('/api/rides', json=payload)
    assert response.status_code == 409
    assert response.json()['detail'] == 'Route estimate expired or unavailable. Refresh route and fare estimates.'
    assert app.state.storage.routes.get(ride.route_estimate_id) is not None


def sample(lat=17.45):
    return LocationSample(latitude=lat, longitude=78.50, accuracy_m=10)


def test_monitoring_round_trip_counters_anchor_and_no_trail(setup):
    client, clock, app, _, ride, _ = setup
    other = create_app(settings=config(), dynamodb_client=client, clock=clock, location_provider=FakeLocationProvider())
    services = [app.state.monitoring_service, other.state.monitoring_service]
    for index in range(100):
        clock.advance(5)
        result = services[index % 2].update(ride.id, sample())
    assert result.route_status == 'DEVIATED'
    state = other.state.storage.monitoring.get(ride.id)
    assert state.version == 100 and state.off_count == 100
    assert state.anchor == RoutePoint(latitude=17.45, longitude=78.50)
    assert state.stopped_since and state.last_good_at
    assert state.response.stop_status == 'PROLONGED_STOP'
    assert model_from_item(MonitoringState, model_item('monitoring', 'MONITORING', state)) == state
    assert set(state.model_dump()) == {'response','version','off_count','on_count','anchor','stopped_since','last_good_at'}
    assert len([key for key in client.items if key.startswith('monitoring#')]) == 1
    assert len([key for key in client.items if key.startswith('ride#')]) == 1
    assert len(client.items) == 4  # Ride, route quote, fare quote, one monitoring item.


def test_monitoring_conflict_retries_without_double_counting(setup):
    client, clock, app, _, ride, _ = setup
    other = create_app(settings=config(), dynamodb_client=client, clock=clock)
    client.before_transaction = lambda: other.state.monitoring_service.update(ride.id, sample())
    assert app.state.monitoring_service.update(ride.id, sample()).route_status == 'POSSIBLE_DEVIATION'
    assert app.state.storage.monitoring.get(ride.id).off_count == 1
    clock.advance(5)
    assert other.state.monitoring_service.update(ride.id, sample()).route_status == 'POSSIBLE_DEVIATION'
    clock.advance(5)
    assert app.state.monitoring_service.update(ride.id, sample()).route_status == 'DEVIATED'


def test_older_request_cannot_replace_newer_sample(setup):
    client, clock, app, _, ride, _ = setup
    other = create_app(settings=config(), dynamodb_client=client, clock=clock)
    def newer_sample():
        clock.advance(10)
        other.state.monitoring_service.update(ride.id, sample(lat=17.44))
    client.before_transaction = newer_sample
    result = app.state.monitoring_service.update(ride.id, sample(lat=17.45))
    state = app.state.storage.monitoring.get(ride.id)
    assert result.route_status == 'ON_ROUTE'
    assert state.version == 1 and state.off_count == 0
    assert state.response.last_updated_at == clock()


def test_monitoring_stale_version_and_bounded_retries(setup, monkeypatch):
    _, _, app, api, ride, _ = setup
    repo = app.state.storage.monitoring
    initial = MonitoringState(response=MonitoringResponse(ride_id=ride.id))
    saved = repo.save(initial, 0)
    assert saved.version == 1
    with pytest.raises(WriteConflict):
        repo.save(initial, 0)
    conflict = Mock(side_effect=WriteConflict)
    monkeypatch.setattr(repo, 'save', conflict)
    response = api.post(f'/api/rides/{ride.id}/locations', json=sample().model_dump())
    assert response.status_code == 503
    assert conflict.call_count == 3


def test_completion_wins_location_race(setup):
    client, _, app, api, ride, _ = setup
    client.before_transaction = lambda: app.state.storage.rides.end(ride.id)
    response = api.post(f'/api/rides/{ride.id}/locations', json=sample().model_dump())
    assert response.status_code == 409
    assert app.state.storage.monitoring.get(ride.id) is None
    assert api.get(f'/api/rides/{ride.id}/monitoring').status_code == 409
    with pytest.raises(RideNotActive):
        app.state.storage.monitoring.save(MonitoringState(response=MonitoringResponse(ride_id=ride.id)), 0)


def test_location_wins_then_completion_removes_state(setup):
    client, _, app, api, ride, _ = setup
    client.before_transaction = lambda: app.state.monitoring_service.update(ride.id, sample())
    assert api.patch(f'/api/rides/{ride.id}/end').status_code == 200
    assert f'monitoring#{ride.id}' not in client.items
    assert api.post(f'/api/rides/{ride.id}/locations', json=sample().model_dump()).status_code == 409


def test_restart_preserves_fare_quote_and_lifecycle(setup):
    client, clock, app, _, ride, payload = setup
    restarted = create_app(settings=config(), dynamodb_client=client, clock=clock, location_provider=FakeLocationProvider())
    with TestClient(restarted) as api:
        assert api.get(f'/api/rides/{ride.id}').status_code == 200
        created = api.post('/api/rides', json=payload)
        assert created.status_code == 201
        assert created.json()['fare_estimate'] == ride.fare_estimate.model_dump(mode='json')
        assert api.patch(f'/api/rides/{ride.id}/end').status_code == 200
        assert api.post(f'/api/rides/{ride.id}/fare-report', json={'fare_paid': 120}).status_code == 201
        assert api.post(f'/api/rides/{ride.id}/fare-report', json={'fare_paid': 120}).status_code == 409
    assert app.state.storage.reports.get_for_ride(ride.id).fare_paid == 120


def test_storage_configuration_and_injection(monkeypatch):
    monkeypatch.delenv('STORAGE_BACKEND', raising=False)
    assert Settings(_env_file=None).storage_backend == 'memory'
    with pytest.raises(ValidationError):
        Settings(_env_file=None, storage_backend='invalid')
    with pytest.raises(ValidationError):
        Settings(_env_file=None, storage_backend='dynamodb')
    factory = Mock()
    monkeypatch.setattr(boto3.session, 'Session', factory)
    app = create_app(settings=config())
    assert isinstance(app.state.storage.rides, DynamoDBRideRepository)
    assert isinstance(app.state.storage.routes, DynamoDBRouteQuoteRepository)
    assert isinstance(app.state.storage.monitoring, DynamoDBMonitoringStateRepository)
    with TestClient(app) as api:
        assert api.get('/health').status_code == 200
    factory.assert_not_called()
    rides = InMemoryRideRepository()
    injected = create_app(repository=rides, settings=Settings(_env_file=None))
    assert injected.state.storage.rides is rides


@pytest.mark.parametrize('profile', ['ridewatch', None, ''])
def test_lazy_credentials_chain(monkeypatch, profile):
    factory = Mock()
    monkeypatch.setattr(boto3.session, 'Session', factory)
    store = DynamoDBStore('ridewatch-test', 'ap-south-1', profile)
    factory.assert_not_called()
    assert store.client is store.client
    options = {'region_name': 'ap-south-1'}
    if profile:
        options['profile_name'] = profile
    factory.assert_called_once_with(**options)
    assert factory.return_value.client.call_count == 1


def test_sdk_monitoring_transaction_contract():
    client = boto3.client('dynamodb', region_name='ap-south-1', aws_access_key_id='testing', aws_secret_access_key='testing')
    store = DynamoDBStore('ridewatch-test', client=client)
    ride_id = uuid4()
    state = MonitoringState(response=MonitoringResponse(ride_id=ride_id), version=1)
    saved = state.model_copy(update={'version': 2})
    expected = {'TransactItems': [
        {'ConditionCheck': {'TableName':'ridewatch-test', 'Key':encode({'pk':f'ride#{ride_id}'}), 'ConditionExpression':'#data.#status = :active', 'ExpressionAttributeNames':{'#data':'data','#status':'status'}, 'ExpressionAttributeValues':encode({':active':'ACTIVE'})}},
        {'Put': {'TableName':'ridewatch-test','Item':model_item(f'monitoring#{ride_id}', 'MONITORING', saved, version=2), 'ConditionExpression':'#version = :version', 'ExpressionAttributeNames':{'#version':'version'},'ExpressionAttributeValues':encode({':version':1})}},
    ], 'ClientRequestToken': ANY}
    with Stubber(client) as stub:
        stub.add_response('transact_write_items', {}, expected)
        assert DynamoDBMonitoringStateRepository(store).save(state, 1) == saved
        stub.assert_no_pending_responses()


def test_sdk_completion_and_report_conditions(setup):
    _, clock, _, _, ride, _ = setup
    client = boto3.client('dynamodb', region_name='ap-south-1', aws_access_key_id='testing', aws_secret_access_key='testing')
    store = DynamoDBStore('ridewatch-test', client=client)
    ended = ride.model_copy(update={'status': RideStatus.COMPLETED, 'ended_at': clock(), 'drop_lat': ride.destination_lat,
                                    'drop_lng': ride.destination_lng, 'drop_location_source': 'DESTINATION_FALLBACK'})
    key = encode({'pk': f'ride#{ride.id}'})
    with Stubber(client) as stub:
        stub.add_response('get_item', {'Item': model_item(f'ride#{ride.id}', 'RIDE', ride)},
                          {'TableName':'ridewatch-test', 'Key':key, 'ConsistentRead':True})
        stub.add_response('transact_write_items', {}, {'TransactItems': [
            {'Put': {'TableName':'ridewatch-test', 'Item':model_item(f'ride#{ride.id}', 'RIDE', ended),
                     'ConditionExpression':'#data.#status = :active', 'ExpressionAttributeNames':{'#data':'data','#status':'status'},
                     'ExpressionAttributeValues':encode({':active':'ACTIVE'})}},
            {'Delete': {'TableName':'ridewatch-test', 'Key':encode({'pk':f'monitoring#{ride.id}'})}},
        ], 'ClientRequestToken':ANY})
        assert DynamoDBRideRepository(store, clock).end(ride.id) == ended
        saved = report(ride.id)
        stub.add_client_error('put_item', service_error_code='ConditionalCheckFailedException',
                              expected_params={'TableName':'ridewatch-test','Item':model_item(f'fare-report#{ride.id}', 'FARE_REPORT', saved), 'ConditionExpression':'attribute_not_exists(pk)'})
        with pytest.raises(DuplicateFareReport):
            DynamoDBFareReportRepository(store).save(saved)
        stub.assert_no_pending_responses()


def test_injected_custom_memory_repository():
    from app.repositories.ride_repository import RideRepository
    class FakeRides(RideRepository):
        def __init__(self):
            self.inner = InMemoryRideRepository()
        def get(self, ride_id):
            return self.inner.get(ride_id)
        def save(self, ride):
            return self.inner.save(ride)
        def end(self, ride_id, drop=None):
            return self.inner.end(ride_id, drop)
    rides = FakeRides()
    with TestClient(create_app(repository=rides, settings=Settings(_env_file=None))) as api:
        created = api.post('/api/rides', json={'start_lat':17.44, 'start_lng':78.49, 'destination':'Station'})
        assert created.status_code == 201
        assert api.patch(f"/api/rides/{created.json()['id']}/end").status_code == 200


@pytest.mark.parametrize('error', [NoCredentialsError(), ClientError({'Error':{'Code':'AccessDeniedException','Message':'private coordinates'}}, 'GetItem')])
def test_storage_errors_are_sanitized(error, caplog):
    client = Mock()
    client.get_item.side_effect = error
    store = DynamoDBStore('ridewatch-test', client=client)
    with pytest.raises(StorageUnavailable) as caught:
        store.get('ride#test', Ride)
    assert 'private' not in str(caught.value)
    assert 'private' not in caplog.text
