from pathlib import Path
import os
from urllib.parse import urlsplit
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator, field_validator


class Settings(BaseSettings):
    storage_backend: Literal["memory", "dynamodb"] = "memory"
    dynamodb_table_name: str | None = Field(default=None, min_length=3, max_length=255, pattern=r"^[a-zA-Z0-9_.-]+$")
    route_estimate_max_age_seconds: int = Field(default=300, gt=0)
    aws_profile: str | None = None
    aws_region: str | None = None
    aws_pager: str = ""
    location_provider: Literal["aws"] = "aws"
    cors_origins: list[str] = Field(default=["http://localhost:3000"], min_length=1)
    sms_provider: Literal["disabled", "aws"] = "disabled"
    sms_dry_run: bool = False
    public_app_url: str = "http://localhost:3000"
    sms_origination_identity: str | None = None
    sms_configuration_set: str | None = None
    sms_india_entity_id: str | None = None
    sms_india_template_id: str | None = None
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", env_file_encoding="utf-8", extra="ignore")

    def __init__(self, **values):
        if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
            # Lambda uses execution-role credentials, never a developer's dotenv/profile.
            values["_env_file"] = None
            values["aws_profile"] = None
        super().__init__(**values)

    @field_validator("cors_origins")
    @classmethod
    def exact_origins(cls, origins):
        result = []
        for origin in origins:
            parsed = urlsplit(origin)
            if "*" in origin or parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
                raise ValueError("CORS origins must be explicit HTTP(S) origins without paths or wildcards")
            result.append(origin.rstrip("/"))
        return result

    @field_validator("public_app_url")
    @classmethod
    def exact_public_origin(cls, origin):
        parsed = urlsplit(origin)
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or
                parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment):
            raise ValueError("PUBLIC_APP_URL must be an exact HTTP(S) origin without a path")
        return origin.rstrip("/")

    @model_validator(mode="after")
    def require_table(self):
        if os.environ.get("AWS_LAMBDA_FUNCTION_NAME") and self.storage_backend != "dynamodb":
            raise ValueError("Lambda requires STORAGE_BACKEND=dynamodb")
        if self.storage_backend == "dynamodb" and not self.dynamodb_table_name:
            raise ValueError("DYNAMODB_TABLE_NAME is required for DynamoDB storage")
        if bool(self.sms_india_entity_id) != bool(self.sms_india_template_id):
            raise ValueError("SMS_INDIA_ENTITY_ID and SMS_INDIA_TEMPLATE_ID must be configured together")
        if self.sms_provider == "aws" and urlsplit(self.public_app_url).scheme != "https":
            raise ValueError("PUBLIC_APP_URL must be HTTPS when SMS_PROVIDER=aws")
        return self
