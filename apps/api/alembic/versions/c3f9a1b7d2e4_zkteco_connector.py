"""zkteco connector and sync logs

Revision ID: c3f9a1b7d2e4
Revises: a6095e343c3b
Create Date: 2026-11-13 03:10:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f9a1b7d2e4"
down_revision: Union[str, None] = "a6095e343c3b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "zkteco_devices",
        sa.Column("comm_key", sa.String(length=32), nullable=False, server_default=""),
    )
    op.add_column(
        "zkteco_devices",
        sa.Column("serial_number", sa.String(length=80), nullable=False, server_default=""),
    )
    op.add_column(
        "zkteco_devices",
        sa.Column("firmware_version", sa.String(length=80), nullable=False, server_default=""),
    )
    op.add_column(
        "zkteco_devices",
        sa.Column("total_users", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "zkteco_devices",
        sa.Column("total_logs", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "zkteco_sync_logs",
        sa.Column("device_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_count", sa.Integer(), nullable=False),
        sa.Column("inserted_count", sa.Integer(), nullable=False),
        sa.Column("duplicate_count", sa.Integer(), nullable=False),
        sa.Column("unknown_count", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.String(length=500), nullable=False),
        sa.Column("triggered_by", sa.String(length=36), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["device_id"], ["zkteco_devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_zkteco_sync_logs_device_id"), "zkteco_sync_logs", ["device_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_zkteco_sync_logs_device_id"), table_name="zkteco_sync_logs")
    op.drop_table("zkteco_sync_logs")
    op.drop_column("zkteco_devices", "total_logs")
    op.drop_column("zkteco_devices", "total_users")
    op.drop_column("zkteco_devices", "firmware_version")
    op.drop_column("zkteco_devices", "serial_number")
    op.drop_column("zkteco_devices", "comm_key")
