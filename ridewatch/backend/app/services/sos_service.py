from datetime import timedelta

from app.models.ride import RideStatus
from app.models.sos import SosDispatch
from app.schemas.sos import SendSosResponse
from app.services.ride_service import RideNotFound
from app.sms.base import SmsDeliveryError


class SmsNotConfigured(Exception):
    pass


class SosConflict(Exception):
    pass


class SosService:
    RETENTION = timedelta(minutes=5)

    def __init__(self, rides, dispatches, share_service, sms_provider, public_app_url, clock):
        self.rides = rides
        self.dispatches = dispatches
        self.share_service = share_service
        self.sms_provider = sms_provider
        self.public_app_url = public_app_url.rstrip("/")
        self.clock = clock

    def _share(self, ride_id):
        return self.share_service.create(ride_id)

    def send(self, ride_id, data):
        if self.sms_provider is None:
            raise SmsNotConfigured("Automatic SOS messaging is not configured.")
        ride = self.rides.get(ride_id)
        if ride is None:
            raise RideNotFound()
        if ride.status != RideStatus.ACTIVE:
            raise SosConflict("SOS messaging is available only for active rides")

        existing = self.dispatches.get(data.request_id)
        if existing is not None:
            if existing.ride_id != ride_id or existing.requested != len(data.phone_numbers):
                raise SosConflict("This SOS request ID was already used")
            if existing.sent + existing.failed != existing.requested:
                raise SosConflict("This SOS request is still being processed")
            share = self._share(ride_id)
            return SendSosResponse(token=share.token, expires_at=share.expires_at,
                                   requested=existing.requested, sent=existing.sent, failed=existing.failed)

        now = self.clock()
        claim = SosDispatch(ride_id=ride_id, requested=len(data.phone_numbers), sent=0, failed=0, created_at=now)
        if not self.dispatches.claim(data.request_id, claim):
            raise SosConflict("This SOS request is already being processed")

        share = self._share(ride_id)
        share_url = f"{self.public_app_url}/share/{share.token}"
        lines = ["RideWatch SOS: I may need help."]
        if ride.vehicle_number:
            lines.append(f"Vehicle: {ride.vehicle_number}")
        lines.extend((f"Destination: {ride.destination}", f"Live trip: {share_url}"))
        message = "\n".join(lines)
        sent = 0
        for phone_number in data.phone_numbers:
            try:
                self.sms_provider.send(phone_number, message)
                sent += 1
            except SmsDeliveryError:
                pass
        completed = claim.model_copy(update={"sent": sent, "failed": claim.requested - sent})
        self.dispatches.complete(data.request_id, completed)
        return SendSosResponse(token=share.token, expires_at=share.expires_at,
                               requested=completed.requested, sent=completed.sent, failed=completed.failed)
