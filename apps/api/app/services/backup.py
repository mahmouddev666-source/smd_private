"""Scheduled PostgreSQL logical backups using ``pg_dump``.

The worker calls :func:`run_backup` once a day (configurable). Dumps are written
to ``BACKUP_DIR`` (a Compose volume) and old files are pruned by age. If the
``pg_dump`` binary is unavailable or the configured database is not PostgreSQL,
the worker logs a clear warning and keeps running: a missing backup tool must
never stop attendance processing or leave approvals.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger("smd_hr.backup")

BACKUP_PREFIX = "smd_hr_"
BACKUP_SUFFIX = ".sql"


class BackupError(RuntimeError):
    """Raised when pg_dump exits with a non-zero status."""


def _dsn(database_url: str | None = None) -> str:
    url = (database_url or settings.database_url).strip()
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def _binary() -> str | None:
    configured = (settings.pg_dump_bin or "pg_dump").strip() or "pg_dump"
    found = shutil.which(configured)
    if found:
        return found
    # A path that exists but is not on PATH (e.g. a mounted Windows binary).
    candidate = Path(configured)
    if candidate.is_file():
        return str(candidate)
    return None


def backup_dir() -> Path:
    directory = Path(settings.backup_dir).expanduser()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def prune_backups(keep_days: int | None = None) -> list[Path]:
    """Delete dumps older than the retention window and return the survivors."""
    keep = settings.backup_retention_days if keep_days is None else keep_days
    cutoff = datetime.now().timestamp() - keep * 86_400
    removed: list[Path] = []
    for path in sorted(backup_dir().glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}")):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                removed.append(path)
        except OSError as exc:  # pragma: no cover - disk/permission edge case
            logger.warning("Could not prune backup %s: %s", path, exc)
    if removed:
        logger.info("Pruned %s expired backup(s) from %s", len(removed), settings.backup_dir)
    return removed


def list_backups() -> list[Path]:
    return sorted(backup_dir().glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}"))


def run_backup(
    database_url: str | None = None,
    *,
    now: datetime | None = None,
) -> Path | None:
    """Create one dump. Returns the path, or ``None`` when skipped gracefully."""
    dsn = _dsn(database_url)
    if not dsn.startswith("postgresql://"):
        logger.warning(
            "Skipping backup: DATABASE_URL is not PostgreSQL (logical dumps require pg_dump)."
        )
        return None

    binary = _binary()
    if binary is None:
        logger.warning(
            "Skipping backup: pg_dump was not found (set PG_DUMP_BIN or install postgresql-client)."
        )
        return None

    stamp = (now or datetime.now()).strftime("%Y%m%d_%H%M%S")
    target = backup_dir() / f"{BACKUP_PREFIX}{stamp}{BACKUP_SUFFIX}"
    command = [
        binary,
        "--dbname",
        dsn,
        "--no-owner",
        "--no-privileges",
        "--file",
        str(target),
    ]
    env = os.environ.copy()
    env.setdefault("PGCONNECT_TIMEOUT", "10")
    try:
        result = subprocess.run(  # noqa: S603 - fixed binary + configured DSN
            command,
            capture_output=True,
            text=True,
            timeout=settings.backup_timeout_seconds,
            env=env,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        if target.exists():
            target.unlink(missing_ok=True)
        raise BackupError(f"pg_dump could not run: {exc}") from exc

    if result.returncode != 0:
        target.unlink(missing_ok=True)
        detail = (result.stderr or result.stdout or "").strip()
        raise BackupError(f"pg_dump failed ({result.returncode}): {detail[:500]}")

    logger.info("Database backup written to %s (%s bytes)", target, target.stat().st_size)
    prune_backups()
    return target


def next_backup_due(last_run: datetime | None, *, now: datetime | None = None) -> bool:
    """True when the interval has elapsed (or no backup has run yet)."""
    if last_run is None:
        return True
    moment = now or datetime.now()
    return moment - last_run >= timedelta(hours=settings.backup_interval_hours)
