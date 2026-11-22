"""Standalone background worker: ZKTeco polling + scheduled PostgreSQL backups.

The API process keeps request handling fast; this worker owns all periodic
maintenance. It is started in Docker with ``python -m app.worker`` and shares the
same image, environment and volumes as the API.

Run exactly one worker replica: a device must not be polled by two processes.
``ZK_SYNC_ENABLED=false`` on the API service keeps a single poller, and the
worker reads its own value from the environment.
"""

from __future__ import annotations

import logging
import signal
import threading
import time
from datetime import datetime

from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.form import FormSubmission
from app.services import backup, forms as forms_service, scheduler

logger = logging.getLogger("smd_hr.worker")

# Never spin faster than this, even if WORKER_TICK_SECONDS is misconfigured.
MIN_TICK_SECONDS = 10
# Snapshot retries are cheap; they do not wait for the slower ZK/backup timers.
SNAPSHOT_INTERVAL_SECONDS = 30


def _seconds_until_next_sync() -> float:
    return max(60.0, settings.zk_sync_interval_minutes * 60.0)


def _seconds_until_next_backup() -> float:
    return max(3600.0, settings.backup_interval_hours * 3600.0)


def _sync_once() -> None:
    if not settings.zk_sync_enabled:
        logger.debug("ZKTeco sync disabled in the worker (ZK_SYNC_ENABLED=false)")
        return
    try:
        run = scheduler.run_scheduled_sync()
        logger.info(
            "Worker sync summary: %s device(s), %s ok, %s failed",
            run.devices,
            run.succeeded,
            run.failed,
        )
    except Exception:  # noqa: BLE001 - the loop must survive a broken device
        logger.exception("Unexpected error during scheduled ZKTeco sync")


def _backup_once() -> None:
    if not settings.backup_enabled:
        logger.debug("Scheduled backups disabled (BACKUP_ENABLED=false)")
        return
    try:
        target = backup.run_backup()
        if target is None:
            logger.info("Backup skipped (see warning above); the worker keeps running.")
        else:
            logger.info("Scheduled backup finished: %s", target)
    except Exception:  # noqa: BLE001 - backup failure must not stop the worker
        logger.exception("Scheduled backup failed")


def _snapshot_once() -> None:
    """Retry unfinished submission snapshots (max 3 attempts per submission).

    A single broken snapshot must never stop ZKTeco syncing or backups.
    """
    if not settings.submission_snapshot_enabled:
        logger.debug("Submission snapshots disabled (SUBMISSION_SNAPSHOT_ENABLED=false)")
        return

    db = SessionLocal()
    try:
        pending = db.scalars(
            select(FormSubmission)
            .where(
                FormSubmission.snapshot_status.in_(("pending", "failed")),
                FormSubmission.snapshot_attempts < forms_service.SNAPSHOT_MAX_ATTEMPTS,
            )
            .order_by(FormSubmission.created_at)
        ).all()
        for submission in pending:
            try:
                forms_service.process_snapshot(db, submission.id)
                logger.info(
                    "Snapshot %s -> %s (attempt %s)",
                    submission.id[:8],
                    submission.snapshot_status,
                    submission.snapshot_attempts,
                )
            except Exception:  # noqa: BLE001 - keep the loop alive
                logger.exception("Snapshot retry failed for %s", submission.id[:8])
                db.rollback()
    except Exception:  # noqa: BLE001 - a DB outage must not stop the worker
        logger.exception("Snapshot scan failed")
    finally:
        db.close()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logger.info(
        "Worker started (zk_sync=%s, backups=%s, snapshots=%s, tz=%s)",
        settings.zk_sync_enabled,
        settings.backup_enabled,
        settings.submission_snapshot_enabled,
        settings.tz,
    )

    stop = threading.Event()

    def _handle_signal(signum: int, _frame: object) -> None:
        logger.info("Worker received signal %s, shutting down ...", signum)
        stop.set()

    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        sig = getattr(signal, name, None)
        if sig is not None:
            try:
                signal.signal(sig, _handle_signal)
            except (ValueError, OSError):  # not in the main thread / unsupported
                pass

    tick = max(MIN_TICK_SECONDS, settings.worker_tick_seconds)
    next_sync = time.monotonic()
    next_backup = time.monotonic()
    next_snapshot = time.monotonic()

    while not stop.is_set():
        now = time.monotonic()
        if now >= next_sync:
            _sync_once()
            next_sync = time.monotonic() + _seconds_until_next_sync()
        if now >= next_backup:
            _backup_once()
            next_backup = time.monotonic() + _seconds_until_next_backup()
        if now >= next_snapshot:
            _snapshot_once()
            next_snapshot = time.monotonic() + SNAPSHOT_INTERVAL_SECONDS
        stop.wait(tick)

    logger.info("Worker stopped at %s", datetime.now().isoformat(timespec="seconds"))


if __name__ == "__main__":
    main()
