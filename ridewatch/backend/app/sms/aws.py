from threading import Lock

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.sms.base import SmsDeliveryError, SmsProvider


class AwsSmsProvider(SmsProvider):
    def __init__(self, settings, client=None):
        self.settings = settings
        self._client = client
        self._lock = Lock()

    @property
    def client(self):
        with self._lock:
            if self._client is None:
                options = {"region_name": self.settings.aws_region}
                if self.settings.aws_profile:
                    options["profile_name"] = self.settings.aws_profile
                self._client = boto3.session.Session(**options).client(
                    "pinpoint-sms-voice-v2",
                    config=Config(connect_timeout=3, read_timeout=5,
                                  retries={"mode": "standard", "total_max_attempts": 2}),
                )
            return self._client

    def send(self, phone_number, message):
        request = {
            "DestinationPhoneNumber": phone_number,
            "MessageBody": message,
            "MessageType": "TRANSACTIONAL",
            "TimeToLive": 300,
            "DryRun": self.settings.sms_dry_run,
        }
        if self.settings.sms_origination_identity:
            request["OriginationIdentity"] = self.settings.sms_origination_identity
        if self.settings.sms_configuration_set:
            request["ConfigurationSetName"] = self.settings.sms_configuration_set
        if self.settings.sms_india_entity_id and self.settings.sms_india_template_id:
            request["DestinationCountryParameters"] = {
                "IN_ENTITY_ID": self.settings.sms_india_entity_id,
                "IN_TEMPLATE_ID": self.settings.sms_india_template_id,
            }
        try:
            self.client.send_text_message(**request)
        except (BotoCoreError, ClientError):
            raise SmsDeliveryError("SMS delivery failed") from None
