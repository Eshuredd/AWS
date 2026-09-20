from abc import ABC, abstractmethod


class SmsDeliveryError(Exception):
    pass


class SmsProvider(ABC):
    @abstractmethod
    def send(self, phone_number: str, message: str) -> None: ...


class FakeSmsProvider(SmsProvider):
    def __init__(self, failing_numbers=None):
        self.failing_numbers = set(failing_numbers or [])
        self.messages: list[tuple[str, str]] = []

    def send(self, phone_number, message):
        self.messages.append((phone_number, message))
        if phone_number in self.failing_numbers:
            raise SmsDeliveryError("SMS delivery failed")
