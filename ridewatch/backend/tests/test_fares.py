from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.fares.matching import MatchingRules, distance_between_points_m, percentile, typical_fare
from app.fares.telangana import TELANGANA_AUTO_RULE, TelanganaFareProvider
from app.main import create_app
from app.models.fare_report import FareReport
from app.repositories.fare_report_repository import DuplicateFareReport, InMemoryFareReportRepository
from app.schemas.fare import FareQuery, FareReportInput

DAY = datetime(2026, 9, 18, 12, tzinfo=ZoneInfo("Asia/Kolkata"))
QUERY = dict(distance_km=9.2, duration_minutes=31, start_lat=17.44, start_lng=78.49, destination_lat=17.43, destination_lng=78.50)


def sample(fare=200, pickup_offset=0, drop_offset=0, distance=9.2):
    return FareReport(ride_id=uuid4(), pickup_lat=17.44 + pickup_offset, pickup_lng=78.49, drop_lat=17.43 + drop_offset, drop_lng=78.50, drop_location_source="GPS", route_distance_km=distance, route_duration_minutes=31, fare_paid=fare, reported_at=DAY)


@pytest.mark.parametrize("distance,expected", [(0.1, 20), (1.6, 20), (2.6, 31), (9.2, 104)])
def test_official(distance, expected):
    result = TelanganaFareProvider().estimate_official(distance, DAY)
    assert result.minimum == result.maximum == expected
    assert not result.night_applied
    assert result.source == "Telangana G.O.Ms.No.20"


@pytest.mark.parametrize("hour,minute,expected", [(22, 59, 104), (23, 0, 155), (0, 0, 155), (4, 59, 155), (5, 0, 104)])
def test_night_boundaries(hour, minute, expected):
    timestamp = DAY.replace(hour=hour, minute=minute).astimezone(timezone.utc)
    assert TelanganaFareProvider().estimate_official(9.2, timestamp).minimum == expected


@pytest.mark.parametrize("distance", [0, -1, float("nan"), float("inf"), -float("inf")])
def test_invalid_official_distance(distance):
    with pytest.raises(ValueError):
        TelanganaFareProvider().estimate_official(distance, DAY)


def test_configurable_tariff_and_naive_time():
    provider = TelanganaFareProvider(replace(TELANGANA_AUTO_RULE, base_fare="30", per_km_after_base="12"))
    assert provider.estimate_official(2.6, DAY).minimum == 42
    with pytest.raises(ValueError):
        provider.estimate_official(2, datetime(2026, 1, 1))


def test_haversine_known_and_identical():
    assert distance_between_points_m(17.44, 78.49, 17.44, 78.49) == 0
    assert distance_between_points_m(0, 0, 1, 0) == pytest.approx(111195.08, abs=.1)
    assert distance_between_points_m(17.44, 78.49, 17.441, 78.49) == pytest.approx(111.195, abs=.01)
    assert 200 < distance_between_points_m(17.44, 78.49, 17.443, 78.49) < 500


@pytest.mark.parametrize("pickup,drop,radius", [(0, 0, 200), (.001, .001, 200), (.003, .003, 500), (0, .006, None), (.006, 0, None), (.006, .006, None)])
def test_proximity_requires_both_ends(pickup, drop, radius):
    result = typical_fare(FareQuery(**QUERY), [sample(pickup_offset=pickup, drop_offset=drop) for _ in range(5)])
    if radius is None:
        assert result is None
    else:
        assert result.pickup_radius_m == result.destination_radius_m == radius


@pytest.mark.parametrize("distance,accepted", [(7.82, True), (10.58, True), (7.81, False), (10.59, False)])
def test_route_distance_filter(distance, accepted):
    result = typical_fare(FareQuery(**QUERY), [sample(distance=distance) for _ in range(5)])
    assert (result is not None) == accepted


def test_sample_threshold_percentiles_and_confidence():
    reports = [sample(fare) for fare in [180, 190, 200, 210, 220]]
    query = FareQuery(**QUERY)
    assert typical_fare(query, reports[:4]) is None
    result = typical_fare(query, reports)
    assert (result.minimum, result.median, result.maximum, result.sample_count, result.confidence) == (190, 200, 210, 5, "MEDIUM")
    assert percentile([180, 190, 200, 200, 210, 220, 220, 250], .25) == 197.5
    assert percentile([180, 190, 200, 200, 210, 220, 220, 250], .5) == 205
    assert percentile([180, 190, 200, 200, 210, 220, 220, 250], .75) == 220


def test_outlier_removal_and_count():
    result = typical_fare(FareQuery(**QUERY), [sample(f) for f in [180, 190, 200, 200, 210, 220, 220, 250, 900]])
    assert (result.minimum, result.median, result.maximum, result.sample_count) == (198, 205, 220, 8)


def test_zero_iqr_outlier():
    result = typical_fare(FareQuery(**QUERY), [sample(200) for _ in range(8)] + [sample(900)])
    assert (result.maximum, result.sample_count) == (200, 8)


def test_tier_preference_and_fallback():
    inner = [sample(200) for _ in range(5)]
    outer = [sample(300, .003, .003) for _ in range(5)]
    query = FareQuery(**QUERY)
    result = typical_fare(query, inner + outer)
    assert (result.sample_count, result.median, result.pickup_radius_m) == (5, 200, 200)
    result = typical_fare(query, inner[:4] + outer)
    assert (result.sample_count, result.pickup_radius_m, result.confidence) == (9, 500, "LOW")
    assert typical_fare(query, inner * 2).confidence == "HIGH"


def test_configurable_matching_and_post_filter_minimum():
    query = FareQuery(**QUERY)
    assert typical_fare(query, [sample() for _ in range(4)], MatchingRules(min_samples=4)) is not None
    assert typical_fare(query, [sample(distance=10) for _ in range(5)], MatchingRules(route_distance_tolerance=.01)) is None
    assert typical_fare(query, [sample(200) for _ in range(7)] + [sample(900)], MatchingRules(min_samples=8)) is None


@pytest.fixture
def api():
    repository = InMemoryFareReportRepository()
    app = create_app(fare_repository=repository)
    with TestClient(app) as client:
        yield client, repository


def create_ride(client, **extra):
    body = dict(start_lat=QUERY["start_lat"], start_lng=QUERY["start_lng"], destination="Secunderabad", destination_lat=QUERY["destination_lat"], destination_lng=QUERY["destination_lng"], expected_distance_km=QUERY["distance_km"], expected_duration_minutes=QUERY["duration_minutes"])
    response = client.post("/api/rides", json={**body, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def test_estimate_empty_and_outside_city(api):
    client, _ = api
    result = client.post("/api/fare-estimate", json=QUERY).json()
    assert result["supported"] and result["official_meter"] is not None
    assert result["typical_reported"] is None
    outside = client.post("/api/fare-estimate", json={**QUERY, "start_lat": 28.61}).json()
    assert outside["supported"] is False
    assert outside["official_meter"] is outside["typical_reported"] is None


@pytest.mark.parametrize("field,value", [("distance_km", 0), ("distance_km", -1), ("distance_km", "NaN"), ("distance_km", "Infinity"), ("duration_minutes", 0), ("start_lat", 91), ("start_lng", 181), ("destination_lat", -91), ("destination_lng", "NaN")])
def test_invalid_estimate_api(api, field, value):
    assert api[0].post("/api/fare-estimate", json={**QUERY, field: value}).status_code == 422


@pytest.mark.parametrize("fare", [0, -1, "NaN", "Infinity", "-Infinity", "bad", 10001])
def test_invalid_report(api, fare):
    client, _ = api
    ride = create_ride(client)
    client.patch(f"/api/rides/{ride['id']}/end")
    assert client.post(f"/api/rides/{ride['id']}/fare-report", json={"fare_paid": fare}).status_code == 422


@pytest.mark.parametrize("fare", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_schema(fare):
    with pytest.raises(ValidationError):
        FareReportInput(fare_paid=fare)


def test_report_lifecycle_fallback_duplicate_and_privacy(api):
    client, repository = api
    ride = create_ride(client)
    url = f"/api/rides/{ride['id']}"
    assert client.post(url + "/fare-report", json={"fare_paid": 210}).status_code == 409
    ended = client.patch(url + "/end").json()
    assert ended["drop_location_source"] == "DESTINATION_FALLBACK"
    assert "drop_lat" not in ended and "drop_lng" not in ended
    receipt = client.post(url + "/fare-report", json={"fare_paid": 210})
    assert receipt.status_code == 201
    assert set(receipt.json()) == {"ride_id", "fare_paid", "reported_at"}
    saved = repository.list_all()[0]
    assert str(saved.ride_id) == ride["id"]
    assert (saved.drop_lat, saved.drop_lng, saved.drop_location_source) == (QUERY["destination_lat"], QUERY["destination_lng"], "DESTINATION_FALLBACK")
    assert saved.route_distance_km == 9.2 and saved.route_duration_minutes == 31
    assert client.post(url + "/fare-report", json={"fare_paid": 300}).status_code == 409
    assert repository.get_for_ride(saved.ride_id).fare_paid == 210
    assert client.post(f"/api/rides/{uuid4()}/fare-report", json={"fare_paid": 210}).status_code == 404


@pytest.mark.parametrize("at_end", [True, False])
def test_gps_drop_stored(api, at_end):
    client, repository = api
    ride = create_ride(client)
    url = f"/api/rides/{ride['id']}"
    gps = dict(drop_lat=17.431, drop_lng=78.501, drop_location_source="GPS")
    client.patch(url + "/end", json=gps if at_end else {})
    assert client.post(url + "/fare-report", json={"fare_paid": 10000, **({} if at_end else gps)}).status_code == 201
    saved = repository.list_all()[0]
    assert (saved.drop_lat, saved.drop_lng, saved.drop_location_source) == (17.431, 78.501, "GPS")


@pytest.mark.parametrize("drop", [{"drop_lat": 17.4}, {"drop_location_source": "GPS"}, {"drop_lat": 91, "drop_lng": 78, "drop_location_source": "GPS"}, {"drop_lat": 17, "drop_lng": "NaN", "drop_location_source": "GPS"}, {"drop_lat": 17, "drop_lng": 78}, {"drop_location_source": "UNKNOWN"}])
def test_invalid_drop(api, drop):
    client, _ = api
    ride = create_ride(client)
    url = f"/api/rides/{ride['id']}"
    assert client.patch(url + "/end", json=drop).status_code == 422
    client.patch(url + "/end")
    assert client.post(url + "/fare-report", json={"fare_paid": 210, **drop}).status_code == 422


def test_snapshot_is_exact_quote_and_remains_immutable(api):
    client, repository = api
    quote = client.post("/api/fare-estimate", json=QUERY).json()
    for _ in range(5):
        repository.save(sample())
    # New reports between estimate and start must not change what the user saw.
    ride = create_ride(client, fare_estimate_id=quote["estimate_id"])
    assert ride["fare_estimate"] == quote
    current = client.post("/api/fare-estimate", json=QUERY).json()
    assert current["typical_reported"]["sample_count"] == 5
    second = create_ride(client, fare_estimate_id=current["estimate_id"])
    assert second["fare_estimate"] == current
    for _ in range(5):
        repository.save(sample(300))
    url = f"/api/rides/{second['id']}"
    assert client.get(url).json()["fare_estimate"] == current
    ended = client.patch(url + "/end", json={"drop_lat": 17.431, "drop_lng": 78.501, "drop_location_source": "GPS"}).json()
    assert ended["fare_estimate"] == current
    assert client.patch(url + "/end").json() == ended
    assert client.get(url).json()["fare_estimate"] == current
    assert client.get(f"/api/rides/{ride['id']}").json()["fare_estimate"] == quote
    assert "pickup_lat" not in str(current) and "drop_lat" not in str(current)


def test_snapshot_rejects_unknown_or_mismatched_quote(api):
    client, _ = api
    quote = client.post("/api/fare-estimate", json=QUERY).json()
    body = dict(start_lat=17.44, start_lng=78.49, destination="Station", destination_lat=17.43, destination_lng=78.5, expected_distance_km=9.2, expected_duration_minutes=31)
    assert client.post("/api/rides", json={**body, "fare_estimate_id": str(uuid4())}).status_code == 409
    assert client.post("/api/rides", json={**body, "fare_estimate_id": quote["estimate_id"], "expected_distance_km": 10}).status_code == 409


def test_legacy_ride_and_empty_factory(api):
    client, repository = api
    ride = client.post("/api/rides", json={"start_lat": 17, "start_lng": 78, "destination": "Station"}).json()
    assert ride["fare_estimate"] is None
    client.patch(f"/api/rides/{ride['id']}/end")
    assert client.post(f"/api/rides/{ride['id']}/fare-report", json={"fare_paid": 210}).status_code == 409
    assert repository.list_all() == []
    with TestClient(create_app()) as another:
        assert another.post("/api/fare-estimate", json=QUERY).json()["typical_reported"] is None


def test_atomic_duplicate_repository():
    repository = InMemoryFareReportRepository()
    report = sample()
    def save(_):
        try:
            repository.save(report)
            return True
        except DuplicateFareReport:
            return False
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(save, range(16))) == 1
    assert repository.list_all() == [report]


def test_completed_reports_feed_estimates_end_to_end(api):
    client, _ = api
    for fare in [180, 190, 200, 210, 220]:
        ride = create_ride(client)
        url = f"/api/rides/{ride['id']}"
        client.patch(url + "/end")
        assert client.post(url + "/fare-report", json={"fare_paid": fare}).status_code == 201
    estimate = client.post("/api/fare-estimate", json=QUERY).json()
    assert estimate["typical_reported"]["sample_count"] == 5
    assert estimate["typical_reported"]["median"] == 200
    ride = create_ride(client)
    assert ride["fare_estimate"]["official_meter"] is not None
    assert ride["fare_estimate"]["typical_reported"] == estimate["typical_reported"]
