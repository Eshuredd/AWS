from uuid import UUID, uuid4

import pytest
from botocore.stub import Stubber
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.sms.aws import AwsSmsProvider
from app.sms.base import FakeSmsProvider
from app.models.sos import SosDispatch
from app.repositories.dynamodb import DynamoDBSosDispatchRepository, DynamoDBStore, decode
from fake_dynamodb import FakeDynamoDB
from test_location import FakeLocationProvider
from test_monitoring import Clock


@pytest.fixture
def sos_session():
    clock = Clock()
    provider = FakeSmsProvider()
    app = create_app(location_provider=FakeLocationProvider(), clock=clock, sms_provider=provider,
                     settings=Settings(_env_file=None, public_app_url="https://ridewatch.example"))
    with TestClient(app) as client:
        points = dict(start_lat=17.44, start_lng=78.49, destination_lat=17.44, destination_lng=78.51)
        route = client.post("/api/route-estimate", json=points).json()
        fare = client.post("/api/fare-estimate", json={**points, "distance_km": route["distance_km"],
                                                        "duration_minutes": route["duration_minutes"]}).json()
        ride = client.post("/api/rides", json={**points, "destination": "Station", "vehicle_number": "TS09AB1234",
                           "expected_distance_km": route["distance_km"], "expected_duration_minutes": route["duration_minutes"],
                           "route_estimate_id": route["route_estimate_id"], "fare_estimate_id": fare["estimate_id"]}).json()
        yield client, clock, app, provider, ride


def test_sos_sends_all_contacts_and_stores_no_contact_data(sos_session):
    client, _, app, provider, ride = sos_session
    request_id = str(uuid4())
    phones = ["+919876543210", "+14155552671"]
    response = client.post(f"/api/rides/{ride['id']}/sos",
                           json={"request_id": request_id, "phone_numbers": phones})
    assert response.status_code == 200
    assert {key: response.json()[key] for key in ("requested", "sent", "failed")} == {
        "requested": 2, "sent": 2, "failed": 0}
    assert [phone for phone, _ in provider.messages] == phones
    message = provider.messages[0][1]
    assert "Station" in message and "TS09AB1234" in message
    assert f"https://ridewatch.example/share/{response.json()['token']}" in message
    assert client.get(f"/api/share/{response.json()['token']}").status_code == 200
    dispatch = app.state.storage.sos_dispatches.get(UUID(request_id))
    serialized = dispatch.model_dump_json()
    assert request_id not in serialized
    assert all(phone not in serialized for phone in phones)
    assert "RideWatch SOS" not in serialized


def test_sos_is_idempotent_and_partial_failures_are_counted(sos_session):
    client, _, _, provider, ride = sos_session
    provider.failing_numbers.add("+14155552671")
    payload = {"request_id": str(uuid4()), "phone_numbers": ["+919876543210", "+14155552671"]}
    first = client.post(f"/api/rides/{ride['id']}/sos", json=payload)
    second = client.post(f"/api/rides/{ride['id']}/sos", json=payload)
    assert first.json()["sent"] == 1 and first.json()["failed"] == 1
    assert second.json()["sent"] == 1 and second.json()["failed"] == 1
    assert len(provider.messages) == 2
    assert second.json()["token"] != first.json()["token"]


@pytest.mark.parametrize("phone_numbers", [[], ["9876543210"], ["+919876543210"] * 2,
                                              ["+10000000001", "+10000000002", "+10000000003", "+10000000004"]])
def test_sos_validates_phone_numbers(sos_session, phone_numbers):
    client, _, _, provider, ride = sos_session
    response = client.post(f"/api/rides/{ride['id']}/sos",
                           json={"request_id": str(uuid4()), "phone_numbers": phone_numbers})
    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid SOS request"}
    assert all(number not in response.text for number in phone_numbers)
    assert provider.messages == []


def test_sos_rejects_contact_names(sos_session):
    client, _, _, provider, ride = sos_session
    response = client.post(f"/api/rides/{ride['id']}/sos", json={
        "request_id": str(uuid4()), "phone_numbers": ["+919876543210"], "names": ["Alice"]})
    assert response.status_code == 422
    assert provider.messages == []


def test_disabled_provider_and_completed_ride_fail_cleanly(sos_session):
    client, _, _, _, ride = sos_session
    disabled = create_app(location_provider=FakeLocationProvider(), settings=Settings(_env_file=None))
    with TestClient(disabled) as api:
        assert api.post(f"/api/rides/{ride['id']}/sos", json={
            "request_id": str(uuid4()), "phone_numbers": ["+919876543210"]}).status_code == 503
    client.patch(f"/api/rides/{ride['id']}/end")
    response = client.post(f"/api/rides/{ride['id']}/sos", json={
        "request_id": str(uuid4()), "phone_numbers": ["+919876543210"]})
    assert response.status_code == 409
    assert "+919876543210" not in response.text


def test_aws_provider_uses_transactional_parameters():
    import boto3
    client = boto3.client("pinpoint-sms-voice-v2", region_name="ap-south-1",
                          aws_access_key_id="test", aws_secret_access_key="test")
    settings = Settings(_env_file=None, sms_provider="aws", sms_dry_run=True,
                        public_app_url="https://ridewatch.example", aws_region="ap-south-1",
                        sms_origination_identity="sender", sms_configuration_set="config",
                        sms_india_entity_id="entity", sms_india_template_id="template")
    provider = AwsSmsProvider(settings, client)
    with Stubber(client) as stubber:
        stubber.add_response("send_text_message", {"MessageId": "message-id"}, {
            "DestinationPhoneNumber": "+919876543210", "MessageBody": "help",
            "MessageType": "TRANSACTIONAL", "TimeToLive": 300, "DryRun": True,
            "OriginationIdentity": "sender", "ConfigurationSetName": "config",
            "DestinationCountryParameters": {"IN_ENTITY_ID": "entity", "IN_TEMPLATE_ID": "template"},
        })
        provider.send("+919876543210", "help")


def test_sms_settings_validate_public_url_and_india_pair():
    with pytest.raises(ValueError):
        Settings(_env_file=None, sms_provider="aws", public_app_url="http://ridewatch.example")
    with pytest.raises(ValueError):
        Settings(_env_file=None, sms_india_entity_id="entity")


def test_dynamodb_dispatch_has_short_ttl_and_no_contact_data():
    clock = Clock()
    client = FakeDynamoDB()
    repository = DynamoDBSosDispatchRepository(DynamoDBStore("ridewatch-test", client=client))
    request_id = uuid4()
    dispatch = SosDispatch(ride_id=uuid4(), requested=2, sent=0, failed=0, created_at=clock())
    assert repository.claim(request_id, dispatch) is True
    assert repository.claim(request_id, dispatch) is False
    stored = decode(client.items[f"sos#{request_id}"])
    assert stored["entity_type"] == "SOS_DISPATCH"
    assert set(stored["data"]) == {"ride_id", "requested", "sent", "failed", "created_at"}
    assert stored["ttl"] == int(clock().timestamp()) + 300
