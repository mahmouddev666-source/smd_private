"""attendance processing and unknown punch resolution

Revision ID: d4a1c2e8f5b7
Revises: c3f9a1b7d2e4
Create Date: 2026-11-13 05:20:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4a1c2e8f5b7"
down_revision: Union[str, None] = "c3f9a1b7d2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "biometric_punches",
        sa.Column("resolved_employee_id", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "biometric_punches",
        sa.Column("ignored_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "zkteco_sync_logs",
        sa.Column("attendance_created", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "zkteco_sync_logs",
        sa.Column("attendance_updated", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("zkteco_sync_logs", "attendance_updated")
    op.drop_column("zkteco_sync_logs", "attendance_created")
    op.drop_column("biometric_punches", "ignored_at")
    op.drop_column("biometric_punches", "resolved_employee_id")
