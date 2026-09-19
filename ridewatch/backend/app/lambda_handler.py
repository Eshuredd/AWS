"""API Gateway HTTP API (payload v2) entrypoint; shares the Uvicorn application."""
from mangum import Mangum
import logging
from app.main import app


class SafeAdapterErrors(logging.Filter):
    """Mangum's default traceback can contain validation inputs; log only the type."""
    def filter(self, record):
        if record.exc_info:
            record.msg = "ASGI request failed (%s)"
            record.args = (record.exc_info[0].__name__,)
            record.exc_info = None
            record.exc_text = None
        return True


adapter_log = logging.getLogger("mangum.http")
adapter_log.setLevel(logging.WARNING)  # Do not log arbitrary request paths/payloads.
adapter_log.addFilter(SafeAdapterErrors())

# No startup/shutdown resources are needed; clients initialize lazily on first use.
handler = Mangum(app, lifespan="off")
