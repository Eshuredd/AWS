from dataclasses import dataclass
from decimal import Decimal
from math import asin, cos, radians, sin, sqrt
from app.models.fare_report import FareReport
from app.schemas.fare import FareQuery, TypicalFare
from app.fares.telangana import rupees


def distance_between_points_m(lat1, lng1, lat2, lng2) -> float:
    a = sin(radians(lat2 - lat1) / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ** 2
    return 6371008.8 * 2 * asin(sqrt(min(1, max(0, a))))


@dataclass(frozen=True)
class MatchingRules:
    radii_m: tuple[int, ...] = (200, 500)
    route_distance_tolerance: float = 0.15
    min_samples: int = 5
    iqr_min_samples: int = 8
    iqr_multiplier: float = 1.5


def percentile(values: list[float], fraction: float) -> float:
    """Linear interpolation at (n - 1) * fraction (inclusive percentiles)."""
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def typical_fare(query: FareQuery, reports: list[FareReport], rules: MatchingRules = MatchingRules()) -> TypicalFare | None:
    distance = Decimal(str(query.distance_km))
    tolerance = Decimal(str(rules.route_distance_tolerance))
    lower, upper = distance * (1 - tolerance), distance * (1 + tolerance)
    candidates = [r for r in reports if lower <= Decimal(str(r.route_distance_km)) <= upper]
    distances = [(r, distance_between_points_m(query.start_lat, query.start_lng, r.pickup_lat, r.pickup_lng), distance_between_points_m(query.destination_lat, query.destination_lng, r.drop_lat, r.drop_lng)) for r in candidates]
    for radius in rules.radii_m:
        fares = [r.fare_paid for r, pickup, drop in distances if pickup <= radius and drop <= radius]
        if len(fares) >= rules.iqr_min_samples:
            q1, q3 = percentile(fares, .25), percentile(fares, .75)
            spread = q3 - q1
            # A zero IQR still identifies values outside the identical central range.
            fares = [f for f in fares if q1 - rules.iqr_multiplier * spread <= f <= q3 + rules.iqr_multiplier * spread]
        if len(fares) >= rules.min_samples:
            return TypicalFare(minimum=rupees(percentile(fares, .25)), maximum=rupees(percentile(fares, .75)), median=rupees(percentile(fares, .5)), sample_count=len(fares), pickup_radius_m=radius, destination_radius_m=radius, confidence=("HIGH" if len(fares) >= 10 else "MEDIUM") if radius <= 200 else "LOW")
    return None
