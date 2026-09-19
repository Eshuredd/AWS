from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator


class Settings(BaseSettings):
    storage_backend: Literal["memory", "dynamodb"] = "memory"
    dynamodb_table_name: str | None = Field(default=None, min_length=3, max_length=255, pattern=r"^[a-zA-Z0-9_.-]+$")
    route_estimate_max_age_seconds: int = Field(default=300, gt=0)
    aws_profile: str | None = None
    aws_region: str | None = None
    aws_pager: str = ""
    location_provider: Literal["aws"] = "aws"
    cors_origins: list[str] = ["http://localhost:3000"]
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def require_table(self):
        if self.storage_backend == "dynamodb" and not self.dynamodb_table_name:
            raise ValueError("DYNAMODB_TABLE_NAME is required for DynamoDB storage")
        return self
