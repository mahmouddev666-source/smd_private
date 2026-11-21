"""T3-01: ONLYOFFICE settings are complete and fail fast on a weak secret."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

LONG_SECRET = "x" * 32


def _settings(**overrides: object) -> Settings:
    # `_env_file=None` keeps a developer's local `.env` from leaking into tests;
    # explicit keyword arguments still win over process environment variables.
    return Settings(_env_file=None, **overrides)


def test_defaults_mirror_the_env_example() -> None:
    settings = _settings()

    assert settings.onlyoffice_enabled is False
    assert settings.onlyoffice_internal_url == "http://onlyoffice"
    assert settings.onlyoffice_internal_host == "onlyoffice"
    assert settings.onlyoffice_callback_base == "http://api:8000"
    assert settings.office_download_token_ttl_seconds == 600
    assert settings.office_callback_token_ttl_seconds == 43200
    assert settings.office_session_ttl_minutes == 60
    assert settings.office_max_file_mb == 20
    assert settings.office_max_callback_mb == 50
    assert settings.office_version_retention == 0
    assert settings.office_legacy_convert_on_upload is True
    assert settings.office_require_ds_download_token is True
    assert settings.office_allow_coediting is False
    assert settings.submission_snapshot_enabled is True


def test_enabled_with_weak_effective_secret_fails_at_startup() -> None:
    with pytest.raises(ValidationError) as excinfo:
        _settings(onlyoffice_enabled=True, secret_key="short", office_token_secret="")

    assert "32" in str(excinfo.value)


def test_explicit_short_office_secret_is_rejected_even_with_long_secret_key() -> None:
    with pytest.raises(ValidationError):
        _settings(
            onlyoffice_enabled=True,
            secret_key=LONG_SECRET,
            office_token_secret="too-short",
        )


def test_enabled_with_long_office_secret_passes() -> None:
    settings = _settings(onlyoffice_enabled=True, office_token_secret=LONG_SECRET)
    assert settings.office_token_key == LONG_SECRET


def test_enabled_falls_back_to_a_long_secret_key() -> None:
    settings = _settings(onlyoffice_enabled=True, secret_key=LONG_SECRET, office_token_secret="")
    assert settings.office_token_key == LONG_SECRET


def test_disabled_with_weak_secret_is_fine() -> None:
    settings = _settings(onlyoffice_enabled=False, secret_key="short", office_token_secret="")
    assert settings.office_token_key == "short"
