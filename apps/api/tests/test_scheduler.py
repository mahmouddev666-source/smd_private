"""Scheduler tests: config guard, device filtering and loop triggering."""

import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.device import ZktecoDevice, ZktecoSyncLog
from app.services import scheduler, zkteco
from app.utils.ids import new_id


class FakeConnector:
    def __init__(self, punches: list[zkteco.PunchRecord] | None = None) -> None:
        self.punches = punches or []

    def test_connection(self) -> zkteco.DeviceInfo:
        return zkteco.DeviceInfo(
            serial_number="SN-SCHED",
            firmware_version="6.60.1",
            device_name="K40",
            user_count=1,
            log_count=len(self.punches),
        )

    def fetch_punches(self, since: datetime | None = None) -> list[zkteco.PunchRecord]:
        return self.punches


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "zkteco_retry_delay_seconds", 0.0)


def _device(db: Session, name: str, *, is_demo: bool, ip: str = "192.168.1.60") -> ZktecoDevice:
    device = ZktecoDevice(
        id=new_id(),
        name=name,
        ip_address=ip,
        port=4370,
        comm_key="",
        location="البوابة",
        model="K40",
        is_demo=is_demo,
    )
    db.add(device)
    db.commit()
    return device


def test_scheduler_is_disabled_in_test_environment() -> None:
    assert settings.app_env == "test"
    assert scheduler.is_enabled() is False
    # Calling start in a test must not spawn a background task.
    scheduler.start_scheduler()
    assert scheduler._task is None


def test_interval_has_a_safe_floor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "zk_sync_interval_minutes", 1)
    assert scheduler.interval_seconds() == 60.0
    monkeypatch.setattr(settings, "zk_sync_interval_minutes", 10)
    assert scheduler.interval_seconds() == 600.0


def test_scheduled_sync_skips_demo_devices_and_uses_system_actor(db: Session) -> None:
    now = datetime.now().replace(microsecond=0)
    real = _device(db, "جهاز حقيقي", is_demo=False)
    demo = _device(db, "جهاز تجريبي", is_demo=True, ip="192.168.1.61")
    connector = FakeConnector(
        punches=[
            zkteco.PunchRecord(
                enroll_number="7777",
                punch_time=now - timedelta(minutes=30),
                punch_type="دخول",
                verify_mode="بصمة إصبع",
            )
        ]
    )

    run = scheduler.run_scheduled_sync(db, factory=lambda device: connector)

    assert run.devices == 1
    assert run.succeeded == 1
    assert run.failed == 0

    logs = db.scalars(select(ZktecoSyncLog)).all()
    assert len(logs) == 1
    assert logs[0].device_id == real.id
    assert logs[0].triggered_by is None  # scheduled runs have no user
    assert logs[0].status == "success"
    assert demo.last_sync_at is None


def test_scheduled_sync_continues_after_one_device_fails(db: Session) -> None:
    now = datetime.now().replace(microsecond=0)
    good = _device(db, "سليم", is_demo=False, ip="192.168.1.70")
    _device(db, "معطل", is_demo=False, ip="192.168.1.71")

    def factory(device: ZktecoDevice):
        if device.id == good.id:
            return FakeConnector(
                punches=[
                    zkteco.PunchRecord(
                        enroll_number="7777",
                        punch_time=now - timedelta(minutes=10),
                        punch_type="دخول",
                        verify_mode="بصمة إصبع",
                    )
                ]
            )
        raise zkteco.ConnectorTimeout("انتهت مهلة الاتصال.")

    run = scheduler.run_scheduled_sync(db, factory=factory)

    assert run.devices == 2
    assert run.succeeded == 1
    assert run.failed == 1
    assert len(run.errors) == 1


def test_loop_triggers_runner_and_stops() -> None:
    calls: list[int] = []

    async def scenario() -> None:
        stop = asyncio.Event()
        task = asyncio.create_task(
            scheduler._loop(0.01, stop, runner=lambda: calls.append(1))
        )
        await asyncio.sleep(0.08)
        stop.set()
        await asyncio.wait_for(task, timeout=3)

    asyncio.run(scenario())

    assert calls, "the scheduler loop must run the sync runner at least once"
