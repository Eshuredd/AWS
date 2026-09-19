from abc import ABC, abstractmethod
from threading import Lock
from uuid import UUID
from app.models.quotes import RouteQuote, FareQuote


class RouteQuoteRepository(ABC):
    @abstractmethod
    def save(self, quote: RouteQuote) -> RouteQuote: ...

    @abstractmethod
    def get(self, quote_id: UUID) -> RouteQuote | None: ...


class FareQuoteRepository(ABC):
    @abstractmethod
    def save(self, quote: FareQuote) -> FareQuote: ...

    @abstractmethod
    def get(self, quote_id: UUID) -> FareQuote | None: ...


class InMemoryRouteQuoteRepository(RouteQuoteRepository):
    def __init__(self):
        self._quotes: dict[UUID, RouteQuote] = {}
        self._lock = Lock()

    def save(self, quote):
        with self._lock:
            self._quotes = {key: value for key, value in self._quotes.items()
                            if value.estimate.expires_at > quote.estimate.calculated_at}
            self._quotes[quote.estimate.route_estimate_id] = quote.model_copy(deep=True)
        return quote

    def get(self, quote_id):
        with self._lock:
            quote = self._quotes.get(quote_id)
            return quote.model_copy(deep=True) if quote else None


class InMemoryFareQuoteRepository(FareQuoteRepository):
    def __init__(self):
        self._quotes: dict[UUID, FareQuote] = {}
        self._lock = Lock()

    def save(self, quote):
        with self._lock:
            self._quotes[quote.estimate.estimate_id] = quote.model_copy(deep=True)
        return quote

    def get(self, quote_id):
        with self._lock:
            quote = self._quotes.get(quote_id)
            return quote.model_copy(deep=True) if quote else None
