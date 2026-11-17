"""Licence status endpoint.

This is a deliberately small, status-only placeholder: it reports whether a
licence key is configured and when it expires, but it never blocks requests.
A signed server-side licence (with signature verification and enforcement) is a
post-delivery item; until then `LICENSE_ENFORCE` stays `false` by default so the
on-premise demo and UAT environments keep working.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/license", tags=["license"])


class LicenseStatus(BaseModel):
    status: str
    mode: str
    license_key_present: bool
    expires_on: str | None
    days_remaining: int | None
    enforced: bool
    message: str
    checked_at: datetime


def _parse_expiry(raw: str) -> date | None:
    value = raw.strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def build_status() -> LicenseStatus:
    key_present = bool(settings.license_key.strip())
    expires_on = _parse_expiry(settings.license_expires_on)
    today = date.today()
    days_remaining = (expires_on - today).days if expires_on else None

    if not key_present:
        status = "unconfigured"
        message = "لم يتم إدخال مفتاح ترخيص بعد؛ النظام يعمل في وضع التجربة ولا يوجد أي قفل."
    elif expires_on is None:
        status = "active"
        message = "مفتاح الترخيص مُسجّل بدون تاريخ انتهاء محدّد."
    elif days_remaining is not None and days_remaining < 0:
        status = "expired"
        message = "انتهت صلاحية الترخيص المسجّل. النظام لا يزال يعمل لأن فرض الترخيص معطّل."
    elif days_remaining is not None and days_remaining <= 30:
        status = "expiring"
        message = f"الترخيص ينتهي بعد {days_remaining} يومًا؛ يرجى التجديد."
    else:
        status = "active"
        message = "الترخيص سارٍ ومفعّل."

    return LicenseStatus(
        status=status,
        mode="demo" if settings.demo_mode else "production",
        license_key_present=key_present,
        expires_on=expires_on.isoformat() if expires_on else None,
        days_remaining=days_remaining,
        enforced=bool(settings.license_enforce),
        message=message,
        checked_at=datetime.now(timezone.utc),
    )


@router.get("/status", response_model=LicenseStatus)
def get_license_status(_: User = Depends(get_current_user)) -> LicenseStatus:
    return build_status()
