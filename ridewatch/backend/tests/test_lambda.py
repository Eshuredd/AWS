import importlib
import json
import sys
from unittest.mock import Mock
import boto3
import pytest
from fastapi.testclient import TestClient
from mangum import Mangum
from pydantic import ValidationError
from app.core.config import Settings
from app.main import create_app


def event(method="GET", path="/health", origin=None):
    headers = {"host": "example.execute-api.ap-south-1.amazonaws.com", "x-forwarded-proto": "https"}
    if origin:
        headers["origin"] = origin
    return {"version": "2.0", "routeKey": "$default", "rawPath": path, "rawQueryString": "",
            "headers": headers, "requestContext": {"stage": "$default", "requestId": "offline-test",
            "http": {"method": method, "path": path, "protocol": "HTTP/1.1", "sourceIp": "127.0.0.1", "userAgent": "offline"}},
            "body": "", "isBase64Encoded": False}


def test_handler_import_and_offline_http_api_health(monkeypatch):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "ridewatch-test")
    monkeypatch.setenv("STORAGE_BACKEND", "dynamodb")
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "ridewatch-test")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    factory = Mock(side_effect=AssertionError("Import/health must not initialize AWS clients"))
    monkeypatch.setattr(boto3.session, "Session", factory)
    # Fresh application import under Lambda environment; restore other tests' module.
    import app.main as main
    previous = main.app
    try:
        importlib.reload(main)
        sys.modules.pop("app.lambda_handler", None)
        module = importlib.import_module("app.lambda_handler")
        assert module.handler.app is main.app
        response = module.handler(event(), Mock())
        assert response["statusCode"] == 200
        assert json.loads(response["body"]) == {"status": "ok", "service": "ridewatch-api"}
        factory.assert_not_called()
        with TestClient(main.app) as client:
            assert client.get("/health").status_code == 200
    finally:
        main.app = previous
        sys.modules.pop("app.lambda_handler", None)


def test_lambda_ignores_dotenv_and_local_profile(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("AWS_PROFILE=local-only\nDYNAMODB_TABLE_NAME=wrong-table\n")
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "ridewatch-test")
    monkeypatch.setenv("STORAGE_BACKEND", "dynamodb")
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "runtime-table")
    monkeypatch.setenv("AWS_PROFILE", "must-not-use")
    settings = Settings(_env_file=env)
    assert settings.aws_profile is None
    assert settings.dynamodb_table_name == "runtime-table"
    monkeypatch.setenv("STORAGE_BACKEND", "memory")
    with pytest.raises(ValidationError, match="Lambda requires"):
        Settings(_env_file=env)


@pytest.mark.parametrize("origin", ["http://localhost:3000", "https://main.example.amplifyapp.com"])
def test_cors_through_http_api_and_uvicorn_app(origin):
    settings = Settings(_env_file=None, cors_origins=["http://localhost:3000", "https://main.example.amplifyapp.com"])
    application = create_app(settings=settings)
    handler = Mangum(application, lifespan="off")
    preflight = event("OPTIONS", "/api/rides", origin)
    preflight["headers"].update({"access-control-request-method":"POST", "access-control-request-headers":"content-type"})
    response = handler(preflight, Mock())
    assert response["statusCode"] == 200
    assert response["headers"]["access-control-allow-origin"] == origin
    assert "POST" in response["headers"]["access-control-allow-methods"]
    assert handler(event(origin=origin), Mock())["headers"]["access-control-allow-origin"] == origin
    assert "access-control-allow-origin" not in handler(event(origin="https://untrusted.example"), Mock())["headers"]
    with TestClient(application) as client:
        assert client.get('/health', headers={'Origin':origin}).headers['access-control-allow-origin'] == origin


@pytest.mark.parametrize("origin", ["*", "https://*.amplifyapp.com", "https://example.com/path", "https://example.com?secret=x", "null"])
def test_reject_unsafe_cors(origin):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cors_origins=[origin])


def test_unhandled_adapter_error_does_not_log_payload(monkeypatch, caplog):
    from app.lambda_handler import SafeAdapterErrors
    import logging
    log = logging.getLogger("mangum.http")
    log.addFilter(SafeAdapterErrors())
    application = create_app(settings=Settings(_env_file=None))
    @application.get('/fail')
    def fail():
        raise ValueError("private coordinates 17.123456 78.123456")
    response = Mangum(application, lifespan="off")(event(path='/fail'), Mock())
    assert response['statusCode'] == 500
    assert 'ValueError' in caplog.text
    assert '17.123456' not in caplog.text
    assert 'private coordinates' not in caplog.text
