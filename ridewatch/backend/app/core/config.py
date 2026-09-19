from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    route_estimate_max_age_seconds: int = Field(default=300, gt=0)
    aws_profile: str | None = None
    aws_region: str | None = None
    aws_pager: str = ""
    location_provider: Literal["aws"] = "aws"
    cors_origins: list[str] = ["http://localhost:3000"]
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", env_file_encoding="utf-8", extra="ignore")
