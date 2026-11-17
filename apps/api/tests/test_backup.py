import os
import time
from datetime import datetime, timedelta

from app.core.config import settings
from app.services import backup


def test_backup_skips_non_postgres_database(monkeypatch) -> None:
    monkeypatch.setattr(settings, "database_url", "sqlite+pysqlite:///./test.db")
    # Graceful skip: the worker must keep running without pg_dump/PostgreSQL.
    assert backup.run_backup() is None


def test_prune_backups_removes_only_expired_files(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path))
    old = tmp_path / "smd_hr_20200101_000000.sql"
    fresh = tmp_path / "smd_hr_20990101_000000.sql"
    old.write_text("old", encoding="utf-8")
    fresh.write_text("fresh", encoding="utf-8")

    stale = time.time() - 40 * 86_400
    os.utime(old, (stale, stale))

    removed = backup.prune_backups(30)
    assert removed == [old]
    assert not old.exists()
    assert fresh.exists()


def test_next_backup_due_uses_the_configured_interval(monkeypatch) -> None:
    monkeypatch.setattr(settings, "backup_interval_hours", 24)
    now = datetime(2026, 11, 17, 12, 0, 0)
    assert backup.next_backup_due(None, now=now) is True
    assert backup.next_backup_due(now - timedelta(hours=1), now=now) is False
    assert backup.next_backup_due(now - timedelta(hours=25), now=now) is True


def test_backup_listing_is_sorted(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path))
    (tmp_path / "smd_hr_20260101_000000.sql").write_text("a", encoding="utf-8")
    (tmp_path / "smd_hr_20260201_000000.sql").write_text("b", encoding="utf-8")
    names = [path.name for path in backup.list_backups()]
    assert names == ["smd_hr_20260101_000000.sql", "smd_hr_20260201_000000.sql"]
