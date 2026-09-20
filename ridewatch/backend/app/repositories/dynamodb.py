"""Single-table, low-level DynamoDB adapters. No resource provisioning here."""
import json
from datetime import datetime, timezone
from decimal import Decimal
from threading import Lock
from uuid import uuid4
import boto3
from boto3.dynamodb.types import TypeSerializer, TypeDeserializer
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, ValidationError
from app.models.ride import Ride, RideStatus
from app.models.fare_report import FareReport
from app.models.quotes import RouteQuote, FareQuote
from app.models.monitoring import MonitoringState
from app.models.share import ShareSession
from app.schemas.fare import DropLocation
from app.repositories.ride_repository import RideRepository
from app.repositories.fare_report_repository import FareReportRepository, DuplicateFareReport
from app.repositories.quote_repository import RouteQuoteRepository, FareQuoteRepository
from app.repositories.monitoring_repository import MonitoringStateRepository
from app.repositories.share_repository import ShareSessionRepository
from app.repositories.errors import StorageUnavailable, WriteConflict, RideNotActive


def encode(values: dict) -> dict:
    # JSON-normalize nested models/enums/UUID/datetimes, then convert floats to Decimal.
    def normalize(value):
        if isinstance(value, BaseModel):
            return value.model_dump(mode="json")
        raise TypeError("Unsupported storage value")
    plain = json.loads(json.dumps(values, default=normalize, allow_nan=False), parse_float=Decimal)
    serializer = TypeSerializer()
    return {key: serializer.serialize(value) for key, value in plain.items()}


def decode(item: dict) -> dict:
    deserializer = TypeDeserializer()
    return {key: deserializer.deserialize(value) for key, value in item.items()}


def model_from_item(model, item: dict):
    # Validate from JSON so strict integer fields see JSON integers, not Decimal.
    def number(value):
        if isinstance(value, Decimal):
            return int(value) if value == value.to_integral_value() else float(value)
        raise TypeError("Unsupported stored value")
    try:
        return model.model_validate_json(json.dumps(decode(item)["data"], default=number))
    except (KeyError, ValueError, TypeError, ValidationError):
        raise StorageUnavailable() from None


def model_item(pk: str, entity_type: str, model: BaseModel, **attributes) -> dict:
    return encode({"pk": pk, "entity_type": entity_type, "data": model, **attributes})


class DynamoDBStore:
    def __init__(self, table_name: str, region=None, profile=None, client=None):
        self.table_name, self.region, self.profile = table_name, region, profile
        self._client = client
        self._lock = Lock()  # Lazy initialization only, never distributed correctness.

    @property
    def client(self):
        with self._lock:
            if self._client is None:
                options = {"region_name": self.region}
                if self.profile:
                    options["profile_name"] = self.profile
                self._client = boto3.session.Session(**options).client(
                    "dynamodb", config=Config(connect_timeout=3, read_timeout=5,
                                              retries={"mode": "standard", "total_max_attempts": 2}))
            return self._client

    def call(self, operation, **kwargs):
        try:
            return getattr(self.client, operation)(**kwargs)
        except ClientError as error:
            code = error.response["Error"]["Code"]
            if code in {"ConditionalCheckFailedException", "TransactionCanceledException", "TransactionConflictException"}:
                raise
            raise StorageUnavailable() from None
        except BotoCoreError:
            raise StorageUnavailable() from None

    def get(self, pk, model):
        response = self.call("get_item", TableName=self.table_name, Key=encode({"pk": pk}), ConsistentRead=True)
        return model_from_item(model, response["Item"]) if "Item" in response else None

    def insert(self, item):
        try:
            self.call("put_item", TableName=self.table_name, Item=item, ConditionExpression="attribute_not_exists(pk)")
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise WriteConflict() from None
            raise StorageUnavailable() from None

    def transact(self, actions, *, check_active=False):
        try:
            # Token makes SDK retries of the identical transaction idempotent.
            self.call("transact_write_items", TransactItems=actions, ClientRequestToken=str(uuid4()))
        except ClientError as error:
            code = error.response["Error"]["Code"]
            reasons = [reason.get("Code", "None") for reason in error.response.get("CancellationReasons", [])]
            if check_active and reasons and reasons[0] == "ConditionalCheckFailed":
                raise RideNotActive() from None
            if code == "TransactionConflictException" or (reasons and all(reason in {"None", "ConditionalCheckFailed", "TransactionConflict"} for reason in reasons)):
                raise WriteConflict() from None
            # Do not expose AWS messages, cancellation item contents or coordinates.
            raise StorageUnavailable() from None


class DynamoDBRideRepository(RideRepository):
    def __init__(self, store: DynamoDBStore, clock=lambda: datetime.now(timezone.utc)):
        self.store, self.clock = store, clock

    def save(self, ride):
        self.store.insert(model_item(f"ride#{ride.id}", "RIDE", ride))
        return ride

    def get(self, ride_id):
        return self.store.get(f"ride#{ride_id}", Ride)

    def end(self, ride_id, drop=None):
        drop = drop or DropLocation()
        for _ in range(3):
            ride = self.get(ride_id)
            if ride is None or ride.status == RideStatus.COMPLETED:
                return ride
            gps = drop.drop_location_source == "GPS"
            ended = ride.model_copy(update={
                "status": RideStatus.COMPLETED, "ended_at": self.clock(),
                "drop_lat": drop.drop_lat if gps else ride.destination_lat,
                "drop_lng": drop.drop_lng if gps else ride.destination_lng,
                "drop_location_source": drop.drop_location_source,
            })
            try:
                self.store.transact([
                    {"Put": {"TableName": self.store.table_name,
                             "Item": model_item(f"ride#{ride_id}", "RIDE", ended),
                             "ConditionExpression": "#data.#status = :active",
                             "ExpressionAttributeNames": {"#data": "data", "#status": "status"},
                             "ExpressionAttributeValues": encode({":active": "ACTIVE"})}},
                    {"Delete": {"TableName": self.store.table_name, "Key": encode({"pk": f"monitoring#{ride_id}"})}},
                ])
                return ended
            except WriteConflict:
                continue
        # Another completer may have won on the last attempt.
        ride = self.get(ride_id)
        if ride is None or ride.status == RideStatus.COMPLETED:
            return ride
        raise StorageUnavailable()


class DynamoDBFareReportRepository(FareReportRepository):
    def __init__(self, store):
        self.store = store

    def save(self, report):
        try:
            self.store.insert(model_item(f"fare-report#{report.ride_id}", "FARE_REPORT", report))
        except WriteConflict:
            raise DuplicateFareReport() from None
        return report

    def get_for_ride(self, ride_id):
        return self.store.get(f"fare-report#{ride_id}", FareReport)

    def list_all(self):
        reports = []
        params = {"TableName": self.store.table_name, "ConsistentRead": True,
                  "FilterExpression": "#entity = :entity", "ExpressionAttributeNames": {"#entity": "entity_type"},
                  "ExpressionAttributeValues": encode({":entity": "FARE_REPORT"})}
        while True:
            response = self.store.call("scan", **params)
            reports.extend(model_from_item(FareReport, item) for item in response.get("Items", []))
            if not response.get("LastEvaluatedKey"):
                return reports
            params["ExclusiveStartKey"] = response["LastEvaluatedKey"]


class DynamoDBRouteQuoteRepository(RouteQuoteRepository):
    def __init__(self, store):
        self.store = store

    def save(self, quote):
        self.store.insert(model_item(f"route-quote#{quote.estimate.route_estimate_id}", "ROUTE_QUOTE", quote,
                                    ttl=int(quote.estimate.expires_at.timestamp())))
        return quote

    def get(self, quote_id):
        return self.store.get(f"route-quote#{quote_id}", RouteQuote)


class DynamoDBFareQuoteRepository(FareQuoteRepository):
    def __init__(self, store):
        self.store = store

    def save(self, quote):
        self.store.insert(model_item(f"fare-quote#{quote.estimate.estimate_id}", "FARE_QUOTE", quote,
                                    ttl=int(quote.expires_at.timestamp())))
        return quote

    def get(self, quote_id):
        return self.store.get(f"fare-quote#{quote_id}", FareQuote)


class DynamoDBMonitoringStateRepository(MonitoringStateRepository):
    def __init__(self, store):
        self.store = store

    def get(self, ride_id):
        return self.store.get(f"monitoring#{ride_id}", MonitoringState)

    def save(self, state, expected_version):
        ride_id = state.response.ride_id
        saved = state.model_copy(deep=True, update={"version": expected_version + 1})
        put = {"TableName": self.store.table_name,
               "Item": model_item(f"monitoring#{ride_id}", "MONITORING", saved, version=saved.version),
               "ConditionExpression": "attribute_not_exists(pk)" if expected_version == 0 else "#version = :version"}
        if expected_version:
            put.update(ExpressionAttributeNames={"#version": "version"}, ExpressionAttributeValues=encode({":version": expected_version}))
        self.store.transact([
            {"ConditionCheck": {"TableName": self.store.table_name, "Key": encode({"pk": f"ride#{ride_id}"}),
                                "ConditionExpression": "#data.#status = :active",
                                "ExpressionAttributeNames": {"#data": "data", "#status": "status"},
                                "ExpressionAttributeValues": encode({":active": "ACTIVE"})}},
            {"Put": put},
        ], check_active=True)
        return saved

    def delete(self, ride_id):
        # Completion already deletes atomically; this also permits idempotent cleanup.
        self.store.call("delete_item", TableName=self.store.table_name, Key=encode({"pk": f"monitoring#{ride_id}"}))


class DynamoDBShareSessionRepository(ShareSessionRepository):
    def __init__(self, store):
        self.store = store

    def save(self, token_hash, session):
        self.store.insert(model_item(f"share#{token_hash}", "SHARE_SESSION", session,
                                     ttl=int(session.expires_at.timestamp())))
        return session

    def get(self, token_hash):
        return self.store.get(f"share#{token_hash}", ShareSession)

    def revoke(self, token_hash, revoked_at):
        session = self.get(token_hash)
        if session is None:
            return None
        revoked = session.model_copy(update={"revoked_at": revoked_at})
        self.store.call("put_item", TableName=self.store.table_name,
                        Item=model_item(f"share#{token_hash}", "SHARE_SESSION", revoked,
                                        ttl=int(revoked.expires_at.timestamp())))
        return revoked
