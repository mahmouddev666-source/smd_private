"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "SMD-HR"
    app_env: str = "development"
    api_base_url: str = "/api"
    tz: str = "Africa/Cairo"

    # Security
    secret_key: str = "insecure-development-key-change-me"
    access_token_expire_minutes: int = 480
    refresh_token_expire_days: int = 7
    jwt_algorithm: str = "HS256"

    # Database
    database_url: str = "sqlite+pysqlite:///./smd_hr_dev.db"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost"

    # Demo data
    demo_mode: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
