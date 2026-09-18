from abc import ABC, abstractmethod
from threading import Lock
from uuid import UUID
from app.models.fare_report import FareReport


class DuplicateFareReport(Exception):
    pass


class FareReportRepository(ABC):
    @abstractmethod
    def save(self, report: FareReport) -> FareReport:
        """Atomically insert, raising DuplicateFareReport if this ride already has a report."""
        ...

    @abstractmethod
    def list_all(self) -> list[FareReport]: ...

    @abstractmethod
    def get_for_ride(self, ride_id: UUID) -> FareReport | None: ...


class InMemoryFareReportRepository(FareReportRepository):
    def __init__(self):
        self._reports: dict[UUID, FareReport] = {}
        self._lock = Lock()

    def save(self, report: FareReport) -> FareReport:
        with self._lock:
            if report.ride_id in self._reports:
                raise DuplicateFareReport()
            self._reports[report.ride_id] = report
        return report

    def list_all(self) -> list[FareReport]:
        with self._lock:
            return list(self._reports.values())

    def get_for_ride(self, ride_id: UUID) -> FareReport | None:
        with self._lock:
            return self._reports.get(ride_id)
