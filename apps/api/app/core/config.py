"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import AliasChoices, Field
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

    # CORS (same-origin in production via nginx; set explicit origins only for
    # a separate development front-end).
    cors_origins: str = ""

    # Demo data
    demo_mode: bool = True

    # Document engine (company forms)
    storage_dir: str = "./storage"
    max_upload_mb: int = 20
    libreoffice_bin: str = "soffice"
    libreoffice_timeout_seconds: int = 120

    # Business rules: permits (approved values, change only with HR sign-off)
    permit_personal_max_hours: float = Field(default=2.0, gt=0, le=24)
    permit_work_max_hours: float = Field(default=4.0, gt=0, le=24)
    permit_daily_max_hours: float = Field(default=4.0, gt=0, le=24)

    # Business rules: missions and daily allowances
    mission_max_days: int = Field(default=60, ge=1, le=366)
    mission_default_allowance_per_day: float = Field(default=450.0, ge=0)
    mission_max_allowance_per_day: float = Field(default=2000.0, ge=0)

    # ZKTeco connector (server-side only, never from the browser)
    # Names match `.env.example` (ZK_*); the older ZKTECO_* names still work.
    zk_sync_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("ZK_SYNC_ENABLED", "ZKTECO_SYNC_ENABLED"),
    )
    zk_sync_interval_minutes: int = Field(
        default=10,
        ge=1,
        validation_alias=AliasChoices(
            "ZK_SYNC_INTERVAL_MINUTES", "ZKTECO_SYNC_INTERVAL_MINUTES"
        ),
    )
    zk_timeout_seconds: float = Field(
        default=8.0,
        validation_alias=AliasChoices("ZK_TIMEOUT_SECONDS", "ZKTECO_TIMEOUT_SECONDS"),
    )
    zkteco_max_attempts: int = 2
    zkteco_retry_delay_seconds: float = 1.0
    zkteco_sync_lookback_days: int = 7

    # Background worker (ZKTeco polling + scheduled database backups)
    worker_tick_seconds: int = Field(default=60, ge=10, le=3600)

    # Backups (logical PostgreSQL dumps via pg_dump)
    backup_enabled: bool = True
    backup_interval_hours: int = Field(default=24, ge=1, le=720)
    backup_retention_days: int = Field(default=30, ge=1, le=3650)
    backup_dir: str = "./backups"
    pg_dump_bin: str = "pg_dump"
    backup_timeout_seconds: int = Field(default=600, ge=30, le=7200)

    # Licence: status-only placeholder. It never blocks the application; a
    # signed server-side licence can replace this in a later phase.
    license_key: str = ""
    license_expires_on: str = ""
    license_enforce: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def is_test(self) -> bool:
        """Tests must never start the background scheduler or hit real devices."""
        return self.app_env.lower() in {"test", "testing"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
