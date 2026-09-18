from unittest.mock import Mock
import boto3
import pytest
from app.core.config import Settings
from app.location.amazon_location import AmazonLocationProvider


def test_dotenv_settings(tmp_path, monkeypatch):
    for name in ("AWS_PROFILE", "AWS_REGION", "AWS_PAGER"):
        monkeypatch.delenv(name, raising=False)
    env = tmp_path / ".env"
    env.write_text("AWS_PROFILE=ridewatch\nAWS_REGION=ap-south-1\nAWS_PAGER=\n")
    settings = Settings(_env_file=env)
    assert (settings.aws_profile, settings.aws_region, settings.aws_pager) == ("ridewatch", "ap-south-1", "")
    monkeypatch.setenv("AWS_REGION", "eu-west-1")
    assert Settings(_env_file=env).aws_region == "eu-west-1"


@pytest.mark.parametrize("profile", ["ridewatch", None, ""])
def test_session_configuration_and_reuse(monkeypatch, profile):
    factory = Mock()
    monkeypatch.setattr(boto3.session, "Session", factory)
    provider = AmazonLocationProvider("ap-south-1", profile=profile)
    factory.assert_not_called()
    provider._client("geo-places")
    provider._client("geo-routes")
    provider._client("geo-places")
    expected = {"region_name": "ap-south-1"}
    if profile:
        expected["profile_name"] = profile
    factory.assert_called_once_with(**expected)
    assert factory.return_value.client.call_count == 2


def test_no_profile_default(monkeypatch):
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    assert Settings(_env_file=None).aws_profile is None
