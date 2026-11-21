"""Licence status endpoint (T3-18).

Reads the signed ``license.json`` through the licence service and exposes an
additive, backward-compatible response. It never returns the signing key, the
full hardware fingerprint or any storage path, and it never fails with 500 for
a malformed licence file.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import User
from app.services import license as license_service

router = APIRouter(prefix="/license", tags=["license"])


class LicenseStatus(BaseModel):
    status: str
    mode: str
    source: str
    license_key_present: bool
    client_name: str | None
    issued_on: str | None
    expires_on: str | None
    days_remaining: int | None
    hardware_matches: bool | None
    enforced: bool
    message: str
    checked_at: datetime


def build_status() -> LicenseStatus:
    state = license_service.get_license_status()
    return LicenseStatus(
        status=state.status,
        mode="demo" if settings.demo_mode else "production",
        source=state.source,
        license_key_present=state.license_key_present,
        client_name=state.client_name,
        issued_on=state.issued_on,
        expires_on=state.expires_on,
        days_remaining=state.days_remaining,
        hardware_matches=state.hardware_matches,
        enforced=bool(settings.license_enforce),
        message=state.message,
        checked_at=state.checked_at or datetime.now(),
    )


@router.get("/status", response_model=LicenseStatus)
def get_license_status(_: User = Depends(get_current_user)) -> LicenseStatus:
    return build_status()
