"""T3-04: real Alembic round-trip on a temporary SQLite database."""

import importlib.util
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations

API_DIR = Path(__file__).resolve().parents[1]
MIGRATION_FILE = API_DIR / "alembic" / "versions" / "f3c1a9d2b7e4_office_versions.py"
PREVIOUS_REVISION = "e5b2d3f9a6c1"
OFFICE_REVISION = "f3c1a9d2b7e4"


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("t3_04_office_versions", MIGRATION_FILE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _alembic(env: dict[str, str], *args: str) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=API_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_office_migration_upgrade_downgrade_upgrade_and_backfill(tmp_path: Path) -> None:
    db_path = tmp_path / "migration.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    env["SECRET_KEY"] = "test-secret-key"

    _alembic(env, "upgrade", PREVIOUS_REVISION)

    # Seed one legacy file with a template and a submission.
    connection = sqlite3.connect(db_path)
    connection.execute(
        "INSERT INTO form_files "
        "(id,original_name,mime,kind,size_bytes,checksum,storage_path,converted_pdf_path,"
        "page_count,is_active,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (
            "f1",
            "عقد.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "word",
            100,
            "a" * 64,
            "forms/a.docx",
            "forms/a.pdf",
            1,
            1,
            0,
        ),
    )
    connection.execute(
        "INSERT INTO form_templates (id,name,category,description,file_id,fields,is_active,is_demo) "
        "VALUES (?,?,?,?,?,?,?,?)",
        ("t1", "عقد", "عام", "", "f1", "[]", 1, 0),
    )
    connection.execute(
        'INSERT INTO form_submissions (id,template_id,"values",status,is_demo) '
        "VALUES (?,?,?,?,?)",
        ("s1", "t1", "{}", "نهائي", 0),
    )
    connection.commit()
    connection.close()

    _alembic(env, "upgrade", OFFICE_REVISION)

    connection = sqlite3.connect(db_path)
    version = connection.execute(
        "SELECT id, version_no, pdf_path, pdf_status, is_original, extension "
        "FROM form_file_versions"
    ).fetchall()
    assert len(version) == 1
    version_id, version_no, pdf_path, pdf_status, is_original, extension = version[0]
    assert (version_no, pdf_path, pdf_status, is_original, extension) == (
        1,
        "forms/a.pdf",
        "ready",
        1,
        "docx",
    )
    assert connection.execute("SELECT current_version_id FROM form_files").fetchone()[0] == version_id
    assert connection.execute("SELECT document_version_id FROM form_templates").fetchone()[0] == version_id
    assert connection.execute("SELECT document_version_id FROM form_submissions").fetchone()[0] == version_id
    assert connection.execute(
        "SELECT snapshot_status, snapshot_attempts FROM form_submissions"
    ).fetchone() == ("none", 0)

    # Re-running the backfill must not create a second version.
    module = _load_migration_module()
    from sqlalchemy import create_engine, text

    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.connect() as sa_connection:
        context = MigrationContext.configure(sa_connection)
        with Operations.context(context):
            module._backfill()
        assert sa_connection.execute(text("SELECT COUNT(*) FROM form_file_versions")).scalar() == 1
    engine.dispose()
    connection.close()

    _alembic(env, "downgrade", PREVIOUS_REVISION)
    connection = sqlite3.connect(db_path)
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "form_file_versions" not in tables
    assert "office_sessions" not in tables
    assert "current_version_id" not in {
        row[1] for row in connection.execute("PRAGMA table_info(form_files)")
    }
    assert connection.execute("SELECT COUNT(*) FROM form_files").fetchone()[0] == 1
    connection.close()

    _alembic(env, "upgrade", "head")
    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT COUNT(*) FROM form_file_versions").fetchone()[0] == 1
    connection.close()
