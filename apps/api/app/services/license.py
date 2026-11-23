"""Licence file reading, verification and status (T3-18).

The signed ``license.json`` file is the only source of truth. No database table
is involved and no secret is ever returned to an API caller or written to logs.
The legacy ``LICENSE_KEY`` / ``LICENSE_EXPIRES_ON`` pair is kept as a fallback
so existing on-premise installations keep working unchanged.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import platform
import uuid
from dataclasses import dataclass, replace
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import Settings, settings

logger = logging.getLogger("smd_hr.license")

BLOCKING_STATUSES = frozenset({"expired", "invalid", "hardware_mismatch"})
EXPIRING_DAYS = 30

MESSAGES = {
    "unconfigured": "لم يتم تثبيت ملف ترخيص بعد؛ النظام يعمل بدون قفل.",
    "invalid": "ملف الترخيص غير صالح أو موقّع بتوقيع غير مطابق.",
    "hardware_mismatch": "الترخيص مرتبط بجهاز آخر؛ يرجى إصدار ترخيص لهذا الخادم.",
    "not_yet_valid": "تاريخ بدء الترخيص لم يبدأ بعد.",
    "expired": "انتهت صلاحية الترخيص.",
    "expiring": "الترخيص ينتهي قريبًا؛ يرجى التجديد.",
    "active": "الترخيص سارٍ ومفعّل.",
}

_CACHE: tuple[tuple[object, ...], "LicenseState"] | None = None


@dataclass(frozen=True)
class LicenseState:
    status: str
    source: str  # file | env | none
    license_key_present: bool
    client_name: str | None = None
    issued_on: str | None = None
    expires_on: str | None = None
    days_remaining: int | None = None
    hardware_matches: bool | None = None
    message: str = ""
    checked_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.message:
            object.__setattr__(self, "message", MESSAGES.get(self.status, ""))
        if self.checked_at is None:
            object.__setattr__(self, "checked_at", datetime.now(timezone.utc))


@dataclass(frozen=True)
class LicensePayload:
    client_name: str
    hardware_id: str
    issued_at: date
    expires_at: date
    schema_version: int = 1
    license_id: str | None = None
    features: tuple[str, ...] = ("core",)
    signature: str | None = None

    def canonical_bytes(self) -> bytes:
        body = {
            "client_name": self.client_name,
            "hardware_id": self.hardware_id,
            "issued_at": self.issued_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "schema_version": self.schema_version,
            "license_id": self.license_id,
            "features": list(self.features),
        }
        return json.dumps(
            body, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")

    def to_file_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "license_id": self.license_id,
            "client_name": self.client_name,
            "hardware_id": self.hardware_id,
            "issued_at": self.issued_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "features": list(self.features),
            "signature": self.signature,
        }


def sign_payload(payload: LicensePayload, signing_key: str) -> str:
    digest = hmac.new(
        signing_key.encode("utf-8"), payload.canonical_bytes(), hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def current_hardware_id(override: str | None = None) -> str:
    """Stable machine fingerprint; ``override`` exists for tests/containers only."""
    configured = (override if override is not None else settings.license_hardware_id).strip()
    if configured:
        return configured.lower()

    machine_id = ""
    machine_id_file = Path("/etc/machine-id")
    try:
        if machine_id_file.is_file():
            machine_id = machine_id_file.read_text(encoding="utf-8").strip()
    except OSError:
        machine_id = ""
    if not machine_id:
        machine_id = f"{uuid.getnode()}|{platform.node()}"

    raw = f"smd-hr|{machine_id}|{platform.machine()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _parse_date(value: Any) -> date:
    if not isinstance(value, str):
        raise ValueError("issued_at/expires_at must be ISO dates")
    return date.fromisoformat(value)


def parse_payload(raw: str, signing_key: str | None, current_id: str) -> LicensePayload:
    """Parse + validate a licence file. Raises ``ValueError`` on any bad input."""
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("license.json must contain an object")

    if data.get("schema_version", 1) != 1:
        raise ValueError("unsupported schema_version")

    client_name = str(data.get("client_name", "")).strip()
    hardware_id = str(data.get("hardware_id", "")).strip().lower()
    if not (1 <= len(client_name) <= 160):
        raise ValueError("client_name is required (1..160)")
    if len(hardware_id) != 64 or any(ch not in "0123456789abcdef" for ch in hardware_id):
        raise ValueError("hardware_id must be 64 lowercase hex characters")

    issued_at = _parse_date(data.get("issued_at"))
    expires_at = _parse_date(data.get("expires_at"))
    if expires_at <= issued_at:
        raise ValueError("expires_at must be later than issued_at")

    features_raw = data.get("features", ["core"])
    if not isinstance(features_raw, list) or not all(isinstance(f, str) for f in features_raw):
        raise ValueError("features must be a list of strings")

    license_id = data.get("license_id")
    if license_id is not None:
        license_id = str(license_id)

    signature = data.get("signature")
    if signature is not None:
        signature = str(signature)

    key = signing_key if signing_key is not None else settings.license_signing_key
    payload = LicensePayload(
        client_name=client_name,
        hardware_id=hardware_id,
        issued_at=issued_at,
        expires_at=expires_at,
        schema_version=1,
        license_id=license_id,
        features=tuple(features_raw),
        signature=signature,
    )
    if key:
        if not signature:
            raise ValueError("LICENSE_SIGNING_KEY is set but the licence has no signature")
        if not hmac.compare_digest(signature, sign_payload(payload, key)):
            raise ValueError("licence signature mismatch")
    elif signature:
        # A signature that cannot be verified is not an enforcement signal.
        logger.warning("Licence file carries a signature but LICENSE_SIGNING_KEY is not set")
    del current_id
    return payload


def _env_status(today: date) -> LicenseState:
    key_present = bool(settings.license_key.strip())
    raw_expiry = settings.license_expires_on.strip()
    expires_on: date | None = None
    if raw_expiry:
        try:
            expires_on = date.fromisoformat(raw_expiry)
        except ValueError:
            expires_on = None

    days_remaining = (expires_on - today).days if expires_on else None
    if not key_present:
        status, message = "unconfigured", MESSAGES["unconfigured"]
    elif expires_on is None:
        status = "active"
        message = "مفتاح الترخيص مُسجّل بدون تاريخ انتهاء محدّد."
    elif days_remaining is not None and days_remaining < 0:
        status = "expired"
        message = "انتهت صلاحية الترخيص المسجّل. النظام لا يزال يعمل لأن فرض الترخيص معطّل."
    elif days_remaining is not None and days_remaining <= EXPIRING_DAYS:
        status = "expiring"
        message = f"الترخيص ينتهي بعد {days_remaining} يومًا؛ يرجى التجديد."
    else:
        status = "active"
        message = MESSAGES["active"]

    return LicenseState(
        status=status,
        source="env" if key_present else "none",
        license_key_present=key_present,
        expires_on=expires_on.isoformat() if expires_on else None,
        days_remaining=days_remaining,
        message=message,
    )


def check_license(
    config: Settings | None = None,
    *,
    path: str | Path | None = None,
    signing_key: str | None = None,
) -> LicenseState:
    """Read and verify a licence file; never raises for malformed input.

    ``path`` / ``signing_key`` let the CLI verify an arbitrary file without
    mutating global settings.
    """
    cfg = config or settings
    today = date.today()
    license_path = Path(path).expanduser() if path is not None else Path(cfg.license_file).expanduser()
    key = cfg.license_signing_key if signing_key is None else signing_key

    if not license_path.is_file():
        return _env_status(today)

    try:
        payload = parse_payload(license_path.read_text(encoding="utf-8"), key, "")
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        logger.warning("Licence file could not be verified: %s", type(exc).__name__)
        return LicenseState(
            status="invalid",
            source="file",
            license_key_present=True,
            message=MESSAGES["invalid"],
        )

    matches = hmac.compare_digest(payload.hardware_id, current_hardware_id(cfg.license_hardware_id))
    days_remaining = (payload.expires_at - today).days
    if not matches:
        status = "hardware_mismatch"
    elif today < payload.issued_at:
        status = "not_yet_valid"
    elif days_remaining < 0:
        status = "expired"
    elif days_remaining <= EXPIRING_DAYS:
        status = "expiring"
    else:
        status = "active"

    message = MESSAGES[status]
    if status == "expired" and not cfg.license_enforce:
        message += " النظام لا يزال يعمل لأن فرض الترخيص معطّل."
    return LicenseState(
        status=status,
        source="file",
        license_key_present=True,
        client_name=payload.client_name,
        issued_on=payload.issued_at.isoformat(),
        expires_on=payload.expires_at.isoformat(),
        days_remaining=days_remaining,
        hardware_matches=matches,
        message=message,
    )


def get_license_status(config: Settings | None = None) -> LicenseState:
    """Cached status; cache key includes every setting that can affect it."""
    global _CACHE
    cfg = config or settings
    path = Path(cfg.license_file).expanduser()
    try:
        mtime = path.stat().st_mtime_ns if path.is_file() else -1
    except OSError:
        mtime = -2
    key = (
        str(path),
        mtime,
        cfg.license_signing_key,
        cfg.license_hardware_id,
        cfg.license_key,
        cfg.license_expires_on,
        cfg.license_enforce,
        date.today().toordinal(),
    )
    if _CACHE is not None and _CACHE[0] == key:
        return _CACHE[1]
    state = check_license(cfg)
    _CACHE = (key, state)
    return state


def invalidate_cache() -> None:
    global _CACHE
    _CACHE = None


def enforce_startup(config: Settings | None = None) -> LicenseState:
    """Log one safe line and fail fast only when enforcement is enabled."""
    cfg = config or settings
    state = check_license(cfg)
    logger.info(
        "Licence status=%s source=%s client=%s expires_on=%s days_remaining=%s enforced=%s",
        state.status,
        state.source,
        state.client_name or "-",
        state.expires_on or "-",
        state.days_remaining if state.days_remaining is not None else "-",
        cfg.license_enforce,
    )
    if state.status in BLOCKING_STATUSES:
        if cfg.license_enforce:
            raise RuntimeError(f"ترخيص SMD-HR غير صالح: {state.message}")
        # Phase C: the API still starts, but the operator gets a clear Arabic
        # warning. The message is generic and never includes keys or files.
        logger.warning("تنبيه ترخيص SMD-HR (الفرض معطّل): %s", state.message)
    elif state.status in {"expiring", "not_yet_valid"}:
        logger.warning("تنبيه ترخيص SMD-HR: %s", state.message)
    return state


def build_file(
    payload: LicensePayload, signing_key: str = "", path: str | Path = "license.json"
) -> Path:
    """Write a licence file (CLI helper). Never logs the signing key."""
    if signing_key:
        payload = replace(payload, signature=sign_payload(payload, signing_key))
    else:
        payload = replace(payload, signature=None)
    target = Path(path).expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(payload.to_file_dict(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return target
