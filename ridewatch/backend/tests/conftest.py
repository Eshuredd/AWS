import pytest
import botocore.httpsession


@pytest.fixture(autouse=True)
def block_real_aws_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Tests must never make real AWS requests")
    monkeypatch.setattr(botocore.httpsession.URLLib3Session, "send", forbidden)
