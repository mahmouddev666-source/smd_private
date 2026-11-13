"""Background ZKTeco auto-sync scheduler.

A single asyncio task wakes up every `ZK_SYNC_INTERVAL_MINUTES` and pulls
punches from every configured, non-demo terminal. The blocking `pyzk` socket
work runs in a worker thread (`asyncio.to_thread`) so the FastAPI event loop
never stalls while a device is unreachable.

The scheduler is intentionally lightweight: no APScheduler dependency, one
task per API process. Run uvicorn with a single worker (the documented default
in `docker-compose.yml`) so a device is not polled by several workers at once.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.device import ZktecoDevice
from app.services import zkteco

logger = logging.getLogger("smd_hr.scheduler")

# Guard rails: never poll faster than once a minute, even if misconfigured.
MIN_INTERVAL_SECONDS = 60.0
SHUTDOWN_TIMEOUT_SECONDS = 10.0

_task: asyncio.Task[None] | None = None
_stop_event: asyncio.Event | None = None


@dataclass
class SchedulerRun:
    """Summary of one automatic sweep (used by logs and tests)."""

    devices: int = 0
    succeeded: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)


def is_enabled() -> bool:
    """Scheduler is off in tests and can be disabled with `ZK_SYNC_ENABLED=false`."""
    return bool(settings.zk_sync_enabled) and not settings.is_test


def interval_seconds() -> float:
    return max(MIN_INTERVAL_SECONDS, settings.zk_sync_interval_minutes * 60.0)


def syncable_devices(db: Session) -> list[ZktecoDevice]:
    """Real terminals with an address; demo devices are never polled."""
    stmt = (
        select(ZktecoDevice)
        .where(ZktecoDevice.is_demo.is_(False))
        .where(ZktecoDevice.ip_address != "")
        .order_by(ZktecoDevice.name)
    )
    return list(db.scalars(stmt).all())


def run_scheduled_sync(
    db: Session | None = None,
    factory: zkteco.ConnectorFactory | None = None,
) -> SchedulerRun:
    """Sync every eligible device once. Never raises: failures stay in the log.

    `db` and `factory` are injectable so tests can use the in-memory session and
    a fake terminal without opening sockets.
    """
    connector_factory = factory or zkteco.build_connector
    owns_session = db is None
    session = db or SessionLocal()
    run = SchedulerRun()
    try:
        devices = syncable_devices(session)
        run.devices = len(devices)
        for device in devices:
            try:
                zkteco.sync_device(session, device, None, connector_factory)
                run.succeeded += 1
            except Exception as exc:  # one broken terminal must not stop the rest
                run.failed += 1
                run.errors.append(f"{device.name}: {exc}")
                logger.warning("Scheduled sync failed for device %s: %s", device.id, exc)
    finally:
        if owns_session:
            session.close()
    logger.info(
        "ZKTeco scheduled sync finished: %s device(s), %s ok, %s failed",
        run.devices,
        run.succeeded,
        run.failed,
    )
    return run


async def _loop(
    interval: float,
    stop_event: asyncio.Event,
    runner: Callable[[], object] | None = None,
) -> None:
    """Run immediately, then wait for `interval` or a stop signal."""
    execute = runner or run_scheduled_sync
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(execute)
        except asyncio.CancelledError:
            raise
        except Exception:  # defensive: the loop itself must survive
            logger.exception("Unexpected error in ZKTeco sync scheduler")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue


def start_scheduler() -> None:
    """Start the background task once per process (no-op in tests)."""
    global _task, _stop_event
    if not is_enabled():
        logger.info("ZKTeco auto-sync scheduler disabled (env=%s)", settings.app_env)
        return
    if _task is not None and not _task.done():
        return
    _stop_event = asyncio.Event()
    _task = asyncio.create_task(
        _loop(interval_seconds(), _stop_event), name="zkteco-auto-sync"
    )
    logger.info(
        "ZKTeco auto-sync scheduler started (every %s minute(s))",
        settings.zk_sync_interval_minutes,
    )


async def stop_scheduler() -> None:
    """Signal the loop to finish and wait briefly for an in-flight sweep."""
    global _task, _stop_event
    event, task = _stop_event, _task
    _task = None
    _stop_event = None
    if event is not None:
        event.set()
    if task is None or task.done():
        return
    try:
        await asyncio.wait_for(task, timeout=SHUTDOWN_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        task.cancel()
        logger.warning("ZKTeco scheduler did not stop in time and was cancelled")
    except asyncio.CancelledError:
        pass
    logger.info("ZKTeco auto-sync scheduler stopped")
