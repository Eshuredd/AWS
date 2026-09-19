import pytest
import botocore.httpsession
import os

# Test defaults must not change when a developer switches their local .env to DynamoDB.
os.environ["STORAGE_BACKEND"] = "memory"


@pytest.fixture(autouse=True)
def block_real_aws_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Tests must never make real AWS requests")
    monkeypatch.setattr(botocore.httpsession.URLLib3Session, "send", forbidden)
