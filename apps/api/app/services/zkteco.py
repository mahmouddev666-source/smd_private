"""Server-side ZKTeco connector (pyzk) and punch ingestion.

The browser never talks to a biometric terminal. The API opens the TCP session
on the LAN, pulls attendance records, de-duplicates them against
`biometric_punches` and records every run in `zkteco_sync_logs`.

`pyzk` is imported lazily so the API still boots (and demo mode keeps working)
on machines where the connector dependency is not installed yet.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.db.base import utcnow
from app.models.device import BiometricPunch, ZktecoDevice, ZktecoSyncLog
from app.models.employee import Employee
from app.models.user import User
from app.services.audit import record_audit
from app.utils.ids import new_id

logger = logging.getLogger("smd_hr.zkteco")

# Device punch status (pyzk) -> Arabic label used by the UI.
STATUS_LABELS: dict[int, str] = {
    0: "دخول",
    1: "خروج",
    2: "خروج مؤقت (إذن)",
    3: "عودة من إذن",
    4: "خروج مؤقت (إذن)",
    5: "عودة من إذن",
}
# Device verification mode (pyzk) -> Arabic label used by the UI.
VERIFY_LABELS: dict[int, str] = {
    0: "كلمة سر",
    1: "بصمة إصبع",
    2: "كارت RFID",
    15: "بصمة وجه",
}


class ConnectorError(Exception):
    """Any failure while talking to the terminal (network, auth, protocol)."""

    code = "CONNECTOR_ERROR"
    status_code = 502

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        if code:
            self.code = code


class ConnectorUnavailable(ConnectorError):
    """pyzk is not installed on the API host."""

    code = "CONNECTOR_UNAVAILABLE"
    status_code = 503


class ConnectorTimeout(ConnectorError):
    """The terminal did not answer within `ZKTECO_TIMEOUT_SECONDS`."""

    code = "CONNECTOR_TIMEOUT"
    status_code = 504


@dataclass(frozen=True)
class DeviceInfo:
    serial_number: str
    firmware_version: str
    device_name: str
    user_count: int
    log_count: int


@dataclass(frozen=True)
class PunchRecord:
    enroll_number: str
    punch_time: datetime  # Cairo local time, naive (same convention as attendance)
    punch_type: str
    verify_mode: str


class Connector(Protocol):
    def test_connection(self) -> DeviceInfo: ...

    def fetch_punches(self, since: datetime | None = None) -> list[PunchRecord]: ...


ConnectorFactory = Callable[[ZktecoDevice], Connector]


def _cairo_tz() -> ZoneInfo | None:
    try:
        return ZoneInfo(settings.tz)
    except (ZoneInfoNotFoundError, ValueError):  # Windows host without tzdata
        return None


def to_local_naive(value: datetime) -> datetime:
    """Normalise terminal timestamps to Africa/Cairo local time without tzinfo.

    Attendance rows store local date/time strings, so keeping punches in local
    time avoids off-by-two-hours errors when HR compares them to the device.
    """
    if value.tzinfo is None:
        return value.replace(microsecond=0)
    tz = _cairo_tz()
    local = value.astimezone(tz) if tz is not None else value
    return local.replace(tzinfo=None, microsecond=0)


class PyzkConnector:
    """Thin wrapper around pyzk with an explicit timeout and a clean session."""

    def __init__(
        self,
        ip_address: str,
        port: int = 4370,
        comm_key: str = "",
        timeout: float | None = None,
    ) -> None:
        self._ip_address = ip_address
        self._port = port
        self._comm_key = comm_key
        self._timeout = settings.zkteco_timeout_seconds if timeout is None else timeout

    def _open(self):
        try:
            from zk import ZK  # type: ignore[import-not-found]
        except ImportError as exc:  # pragma: no cover - depends on host packages
            raise ConnectorUnavailable(
                "خدمة الاتصال بأجهزة ZKTeco (pyzk) غير مثبتة على الخادم. "
                "ثبّت حزمة pyzk ثم أعد تشغيل خدمة الـ API."
            ) from exc

        try:
            key = int(self._comm_key or 0)
        except ValueError:
            key = 0
        return ZK(self._ip_address, port=self._port, timeout=self._timeout, password=key)

    def _session(self):
        return _Session(self._open)

    def test_connection(self) -> DeviceInfo:
        with self._session() as conn:
            serial = _safe_call(conn.get_serialnumber, "")
            firmware = _safe_call(conn.get_firmware_version, "")
            name = _safe_call(conn.get_device_name, "")
            users = _safe_call(conn.get_users, []) or []
            records = _safe_call(conn.get_attendance, []) or []
        return DeviceInfo(
            serial_number=str(serial or ""),
            firmware_version=str(firmware or ""),
            device_name=str(name or ""),
            user_count=len(users),
            log_count=len(records),
        )

    def fetch_punches(self, since: datetime | None = None) -> list[PunchRecord]:
        with self._session() as conn:
            records = _safe_call(conn.get_attendance, []) or []

        punches: list[PunchRecord] = []
        for record in records:
            stamp = getattr(record, "timestamp", None)
            if not isinstance(stamp, datetime):
                continue
            local = to_local_naive(stamp)
            if since is not None and local < since:
                continue
            punches.append(
                PunchRecord(
                    enroll_number=str(getattr(record, "user_id", "")).strip(),
                    punch_time=local,
                    punch_type=STATUS_LABELS.get(getattr(record, "status", 0), "دخول"),
                    verify_mode=VERIFY_LABELS.get(getattr(record, "punch", 1), "بصمة إصبع"),
                )
            )
        return [punch for punch in punches if punch.enroll_number]


class _Session:
    """Context manager that always disconnects and maps socket errors to Arabic."""

    def __init__(self, opener: Callable[[], object]) -> None:
        self._opener = opener
        self._conn = None

    def __enter__(self):
        operation = "connect"
        try:
            self._conn = self._opener()()
            return self._conn
        except ConnectorError:
            raise
        except TimeoutError as exc:
            raise ConnectorTimeout(
                "انتهت مهلة الاتصال بجهاز البصمة. تأكد من الشبكة والمنفذ 4370."
            ) from exc
        except Exception as exc:  # pyzk raises broad socket/protocol errors
            raise ConnectorError(
                f"تعذّر الاتصال بجهاز البصمة أثناء {operation}. تأكد من IP والمنفذ "
                "وأن الجهاز يعمل على نفس الشبكة."
            ) from exc

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._conn is not None:
            try:
                self._conn.disconnect()
            except Exception:  # pragma: no cover - best effort cleanup
                logger.debug("ZKTeco disconnect failed", exc_info=True)


def _safe_call(call: Callable[[], object], default: object) -> object:
    """Some terminals do not implement every getter; do not fail the whole sync."""
    try:
        return call()
    except Exception:
        return default


def build_connector(device: ZktecoDevice) -> Connector:
    return PyzkConnector(
        ip_address=device.ip_address,
        port=device.port,
        comm_key=device.comm_key,
    )


def get_connector_factory() -> ConnectorFactory:
    """FastAPI dependency so tests can inject a fake terminal."""
    return build_connector


def _with_retry(call: Callable[[], object]) -> object:
    attempts = max(1, settings.zkteco_max_attempts)
    last_error: ConnectorError | None = None
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except ConnectorError as exc:
            last_error = exc
            logger.warning("ZKTeco attempt %s/%s failed: %s", attempt, attempts, exc)
            if attempt < attempts and settings.zkteco_retry_delay_seconds > 0:
                time.sleep(settings.zkteco_retry_delay_seconds)
    assert last_error is not None
    raise last_error


@dataclass
class SyncStats:
    fetched: int = 0
    inserted: int = 0
    duplicates: int = 0
    unknown: int = 0


def insert_punches(
    db: Session, device: ZktecoDevice, punches: list[PunchRecord]
) -> SyncStats:
    """Insert new punches once; duplicates and unknown PINs are only counted."""
    stats = SyncStats(fetched=len(punches))
    existing = {
        (row.enroll_number, row.punch_time)
        for row in db.execute(
            select(BiometricPunch.enroll_number, BiometricPunch.punch_time).where(
                BiometricPunch.device_id == device.id
            )
        ).all()
    }
    known = set(db.scalars(select(Employee.employee_id)).all())
    seen: set[tuple[str, datetime]] = set()

    for punch in punches:
        key = (punch.enroll_number, punch.punch_time)
        if key in existing or key in seen:
            stats.duplicates += 1
            continue
        seen.add(key)
        if punch.enroll_number not in known:
            stats.unknown += 1

        row = BiometricPunch(
            id=new_id(),
            device_id=device.id,
            enroll_number=punch.enroll_number,
            punch_time=punch.punch_time,
            punch_type=punch.punch_type,
            verify_mode=punch.verify_mode,
            is_demo=device.is_demo,
        )
        try:
            with db.begin_nested():
                db.add(row)
        except IntegrityError:
            # Another worker inserted the same punch in the meantime.
            stats.duplicates += 1
            continue
        stats.inserted += 1

    return stats


def test_device(
    db: Session, device: ZktecoDevice, actor: User, factory: ConnectorFactory
) -> tuple[DeviceInfo, ZktecoDevice]:
    try:
        info = _with_retry(lambda: factory(device).test_connection())
    except ConnectorError as exc:
        device.status = "error"
        record_audit(
            db, actor=actor, action="test", entity="device", entity_id=device.id,
            after={"status": "error", "error": exc.code},
        )
        db.commit()
        raise AppError(exc.status_code, str(exc), exc.code) from exc

    assert isinstance(info, DeviceInfo)
    device.status = "connected"
    device.serial_number = info.serial_number
    device.firmware_version = info.firmware_version
    device.total_users = info.user_count
    device.total_logs = info.log_count
    record_audit(
        db, actor=actor, action="test", entity="device", entity_id=device.id,
        after={"status": "connected", "serial": info.serial_number},
    )
    db.commit()
    db.refresh(device)
    return info, device


def sync_device(
    db: Session, device: ZktecoDevice, actor: User, factory: ConnectorFactory
) -> ZktecoSyncLog:
    """Pull punches with retries and persist a sync log even when it fails."""
    log = ZktecoSyncLog(
        id=new_id(),
        device_id=device.id,
        status="running",
        started_at=utcnow(),
        triggered_by=actor.id,
        is_demo=device.is_demo,
    )
    db.add(log)
    db.commit()

    since = datetime.now().replace(microsecond=0) - timedelta(
        days=max(1, settings.zkteco_sync_lookback_days)
    )
    try:
        punches = _with_retry(lambda: factory(device).fetch_punches(since=since))
        assert isinstance(punches, list)
        stats = insert_punches(db, device, punches)
        log.status = "success"
        log.fetched_count = stats.fetched
        log.inserted_count = stats.inserted
        log.duplicate_count = stats.duplicates
        log.unknown_count = stats.unknown
        device.status = "connected"
        device.last_sync_at = utcnow()
        record_audit(
            db, actor=actor, action="sync", entity="device", entity_id=device.id,
            after={"inserted": stats.inserted, "duplicates": stats.duplicates},
        )
    except ConnectorError as exc:
        log.status = "failed"
        log.error_message = str(exc)[:500]
        device.status = "error"
        db.commit()
        raise AppError(exc.status_code, str(exc), exc.code) from exc
    except Exception as exc:  # keep the run visible in the log screen
        db.rollback()
        log.status = "failed"
        log.error_message = str(exc)[:500]
        device.status = "error"
        db.commit()
        logger.exception("ZKTeco sync failed for device %s", device.id)
        raise AppError(
            500, "تعذّرت مزامنة حركات البصمة. راجع سجل المزامنة.", "SYNC_FAILED"
        ) from exc
    finally:
        log.finished_at = utcnow()
        db.commit()
        db.refresh(log)

    return log
