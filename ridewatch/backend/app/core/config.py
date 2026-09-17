from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    aws_region: str = "ap-south-1"
    location_provider: Literal["aws"] = "aws"
    cors_origins: list[str] = ["http://localhost:3000"]
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
