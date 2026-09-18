from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from math import isfinite
from zoneinfo import ZoneInfo
from app.fares.base import FareProvider
from app.schemas.fare import OfficialFare


@dataclass(frozen=True)
class TelanganaAutoRule:
    base_distance_km: str = "1.6"
    base_fare: str = "20"
    per_km_after_base: str = "11"
    waiting_per_minute: str = "0.50"
    night_multiplier: str = "1.5"
    night_start_hour: int = 23
    night_end_hour: int = 5
    effective_from: str = "2014-02-14"
    status: str = "official"
    source: str = "Telangana G.O.Ms.No.20"
    source_url: str = "https://www.transport.telangana.gov.in/html/pdf/go-ms-no-20-dated-14-02-2014.PDF"


TELANGANA_AUTO_RULE = TelanganaAutoRule()


def rupees(value) -> int:
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


class TelanganaFareProvider(FareProvider):
    def __init__(self, rule: TelanganaAutoRule = TELANGANA_AUTO_RULE):
        self.rule = rule

    def estimate_official(self, distance_km: float, timestamp: datetime | None = None) -> OfficialFare:
        if not isfinite(distance_km) or distance_km <= 0:
            raise ValueError("Distance must be finite and positive")
        local = timestamp or datetime.now(ZoneInfo("Asia/Kolkata"))
        if local.tzinfo is None:
            raise ValueError("Timestamp must include a timezone")
        hour = local.astimezone(ZoneInfo("Asia/Kolkata")).hour
        rule = self.rule
        night = (hour >= rule.night_start_hour or hour < rule.night_end_hour) if rule.night_start_hour > rule.night_end_hour else rule.night_start_hour <= hour < rule.night_end_hour
        fare = Decimal(rule.base_fare) + max(Decimal(0), Decimal(str(distance_km)) - Decimal(rule.base_distance_km)) * Decimal(rule.per_km_after_base)
        if night:
            fare *= Decimal(rule.night_multiplier)
        amount = rupees(fare)
        return OfficialFare(minimum=amount, maximum=amount, source=rule.source, effective_from=rule.effective_from, night_applied=night)
