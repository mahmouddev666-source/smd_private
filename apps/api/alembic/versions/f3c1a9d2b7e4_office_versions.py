"""versions and editor sessions

Revision ID: f3c1a9d2b7e4
Revises: e5b2d3f9a6c1
Create Date: 2026-11-21 20:00:00.000000

Phase 3 T3-04: immutable document versions, office sessions and snapshot
columns. Existing files are backfilled with a single original ``v1`` row; the
legacy storage/paths are preserved untouched.
"""

from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "f3c1a9d2b7e4"
down_revision: Union[str, None] = "e5b2d3f9a6c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


EXTENSION_BY_MIME = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
}


def _extension(original_name: str, mime: str) -> str:
    suffix = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if suffix.isalnum() and len(suffix) <= 8:
        return suffix
    return EXTENSION_BY_MIME.get(mime, "bin")


def upgrade() -> None:
    op.create_table(
        "form_file_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("file_id", sa.String(length=36), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("parent_version_id", sa.String(length=36), nullable=True),
        sa.Column("storage_path", sa.String(length=512), nullable=False),
        sa.Column("pdf_path", sa.String(length=512), nullable=True),
        sa.Column("pdf_status", sa.String(length=16), nullable=False, server_default="none"),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("mime", sa.String(length=120), nullable=False),
        sa.Column("extension", sa.String(length=16), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=False, server_default="upload"),
        sa.Column("is_original", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["file_id"], ["form_files.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["parent_version_id"], ["form_file_versions.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_id", "version_no", name="uq_form_file_versions_file_version"),
        sa.UniqueConstraint("storage_path", name="uq_form_file_versions_storage_path"),
        sa.CheckConstraint("version_no >= 1", name="ck_form_file_versions_version_no"),
        sa.CheckConstraint("size_bytes >= 0", name="ck_form_file_versions_size_bytes"),
        sa.CheckConstraint(
            "pdf_status IN ('none', 'pending', 'ready', 'failed')",
            name="ck_form_file_versions_pdf_status",
        ),
        sa.CheckConstraint(
            "kind IN ('word', 'excel', 'pdf', 'image')",
            name="ck_form_file_versions_kind",
        ),
        sa.CheckConstraint(
            "source IN ('upload', 'conversion', 'onlyoffice', 'restore')",
            name="ck_form_file_versions_source",
        ),
    )
    op.create_index("ix_form_file_versions_file_version", "form_file_versions", ["file_id", "version_no"])
    op.create_index("ix_form_file_versions_checksum", "form_file_versions", ["checksum"], unique=False)
    op.create_index(
        "ux_form_file_versions_one_original",
        "form_file_versions",
        ["file_id"],
        unique=True,
        sqlite_where=sa.text("is_original = 1"),
        postgresql_where=sa.text("is_original"),
    )

    op.create_table(
        "office_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("file_id", sa.String(length=36), nullable=False),
        sa.Column("version_id", sa.String(length=36), nullable=False),
        sa.Column("document_key", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("user_name", sa.String(length=160), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("close_reason", sa.String(length=24), nullable=True),
        sa.ForeignKeyConstraint(["file_id"], ["form_files.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["form_file_versions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "close_reason IN ('saved', 'saved_with_error', 'no_changes', 'expired', 'forced')",
            name="ck_office_sessions_close_reason",
        ),
    )
    op.create_index("ix_office_sessions_document_key", "office_sessions", ["document_key"])
    op.create_index("ix_office_sessions_file_id", "office_sessions", ["file_id"])
    op.create_index("ix_office_sessions_version_id", "office_sessions", ["version_id"])
    op.create_index(
        "ux_office_sessions_open_file",
        "office_sessions",
        ["file_id"],
        unique=True,
        sqlite_where=sa.text("closed_at IS NULL"),
        postgresql_where=sa.text("closed_at IS NULL"),
    )

    op.add_column("form_files", sa.Column("current_version_id", sa.String(length=36), nullable=True))
    op.create_index("ix_form_files_current_version_id", "form_files", ["current_version_id"])

    with op.batch_alter_table("form_templates") as batch_op:
        batch_op.add_column(sa.Column("document_version_id", sa.String(length=36), nullable=True))
        batch_op.create_index(
            "ix_form_templates_document_version_id", ["document_version_id"], unique=False
        )

    with op.batch_alter_table("form_submissions") as batch_op:
        batch_op.add_column(sa.Column("document_version_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("rendered_pdf_path", sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column("rendered_checksum", sa.String(length=64), nullable=True))
        batch_op.add_column(
            sa.Column(
                "snapshot_status",
                sa.String(length=16),
                nullable=False,
                server_default="none",
            )
        )
        batch_op.add_column(sa.Column("snapshot_error", sa.String(length=500), nullable=True))
        batch_op.add_column(
            sa.Column(
                "snapshot_attempts",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.create_index(
            "ix_form_submissions_document_version_id", ["document_version_id"], unique=False
        )
        batch_op.create_check_constraint(
            "ck_form_submissions_snapshot_attempts", "snapshot_attempts >= 0"
        )
        batch_op.create_check_constraint(
            "ck_form_submissions_snapshot_status",
            "snapshot_status IN ('none', 'pending', 'ready', 'failed')",
        )

    _backfill()


def _backfill() -> None:
    """Give every legacy file exactly one immutable original v1 version.

    Guarded by ``NOT EXISTS`` so re-running the statement is a no-op.
    """
    bind = op.get_bind()
    files = bind.execute(
        sa.text(
            "SELECT id, original_name, mime, kind, size_bytes, checksum, storage_path, "
            "converted_pdf_path, is_demo FROM form_files ORDER BY created_at, id"
        )
    ).mappings()

    for file in files:
        existing = bind.execute(
            sa.text(
                "SELECT id FROM form_file_versions WHERE file_id = :file_id AND version_no = 1"
            ),
            {"file_id": file["id"]},
        ).first()
        if existing is not None:
            version_id = existing[0]
        else:
            version_id = str(uuid4())
            converted = file["converted_pdf_path"]
            if not converted and file["kind"] in {"word", "excel"}:
                # No converted PDF for an office document: let T3-06 retry.
                converted_pdf_status = "failed"
            elif converted or file["kind"] == "pdf":
                converted_pdf_status = "ready"
            else:
                converted_pdf_status = "none"
            if not converted and file["kind"] == "pdf":
                converted = file["storage_path"]
            bind.execute(
                sa.text(
                    "INSERT INTO form_file_versions "
                    "(id, file_id, version_no, parent_version_id, storage_path, pdf_path, "
                    " pdf_status, checksum, size_bytes, mime, extension, kind, source, "
                    " is_original, created_by, is_demo, created_at) "
                    "VALUES (:id, :file_id, 1, NULL, :storage_path, :pdf_path, :pdf_status, "
                    ":checksum, :size_bytes, :mime, :extension, :kind, 'upload', 1, "
                    "'system', :is_demo, CURRENT_TIMESTAMP)"
                ),
                {
                    "id": version_id,
                    "file_id": file["id"],
                    "storage_path": file["storage_path"],
                    "pdf_path": converted,
                    "pdf_status": converted_pdf_status,
                    "checksum": file["checksum"],
                    "size_bytes": file["size_bytes"],
                    "mime": file["mime"],
                    "extension": _extension(file["original_name"], file["mime"]),
                    "kind": file["kind"],
                    "is_demo": 1 if file["is_demo"] else 0,
                },
            )

        bind.execute(
            sa.text("UPDATE form_files SET current_version_id = :v WHERE id = :f"),
            {"v": version_id, "f": file["id"]},
        )
        bind.execute(
            sa.text(
                "UPDATE form_templates SET document_version_id = :v "
                "WHERE file_id = :f AND document_version_id IS NULL"
            ),
            {"v": version_id, "f": file["id"]},
        )
        bind.execute(
            sa.text(
                "UPDATE form_submissions SET document_version_id = :v "
                "WHERE document_version_id IS NULL AND template_id IN "
                "(SELECT id FROM form_templates WHERE file_id = :f)"
            ),
            {"v": version_id, "f": file["id"]},
        )


def downgrade() -> None:
    with op.batch_alter_table("form_submissions") as batch_op:
        batch_op.drop_constraint("ck_form_submissions_snapshot_status", type_="check")
        batch_op.drop_constraint("ck_form_submissions_snapshot_attempts", type_="check")
        batch_op.drop_index("ix_form_submissions_document_version_id")
        for column in (
            "snapshot_attempts",
            "snapshot_error",
            "snapshot_status",
            "rendered_checksum",
            "rendered_pdf_path",
            "document_version_id",
        ):
            batch_op.drop_column(column)

    with op.batch_alter_table("form_templates") as batch_op:
        batch_op.drop_index("ix_form_templates_document_version_id")
        batch_op.drop_column("document_version_id")

    op.drop_index("ix_form_files_current_version_id", table_name="form_files")
    op.drop_column("form_files", "current_version_id")

    op.drop_index("ux_office_sessions_open_file", table_name="office_sessions")
    op.drop_index("ix_office_sessions_version_id", table_name="office_sessions")
    op.drop_index("ix_office_sessions_file_id", table_name="office_sessions")
    op.drop_index("ix_office_sessions_document_key", table_name="office_sessions")
    op.drop_table("office_sessions")

    op.drop_index("ux_form_file_versions_one_original", table_name="form_file_versions")
    op.drop_index("ix_form_file_versions_checksum", table_name="form_file_versions")
    op.drop_index("ix_form_file_versions_file_version", table_name="form_file_versions")
    op.drop_table("form_file_versions")
