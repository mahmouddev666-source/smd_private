"""work settings singleton

Revision ID: b7e9c2d4f6a8
Revises: f3c1a9d2b7e4
Create Date: 2026-11-21 21:00:00.000000

Phase 3 T3-19: shift windows, overtime cutoff/multipliers and late grace move
from hardcoded constants into one `work_settings` row. The seed values are the
exact values used by the backend and `src/utils/overtimeCalculator.ts`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e9c2d4f6a8"
down_revision: Union[str, None] = "f3c1a9d2b7e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "work_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Africa/Cairo"),
        sa.Column("normal_start", sa.Time(), nullable=False, server_default="08:00"),
        sa.Column("normal_end", sa.Time(), nullable=False, server_default="16:00"),
        sa.Column("day_start", sa.Time(), nullable=False, server_default="08:00"),
        sa.Column("day_end", sa.Time(), nullable=False, server_default="20:00"),
        sa.Column("night_start", sa.Time(), nullable=False, server_default="20:00"),
        sa.Column("night_end", sa.Time(), nullable=False, server_default="08:00"),
        sa.Column("overtime_day_start", sa.Time(), nullable=False, server_default="06:00"),
        sa.Column("overtime_cutoff", sa.Time(), nullable=False, server_default="18:00"),
        sa.Column(
            "overtime_day_multiplier",
            sa.Numeric(precision=4, scale=2),
            nullable=False,
            server_default="1.35",
        ),
        sa.Column(
            "overtime_night_multiplier",
            sa.Numeric(precision=4, scale=2),
            nullable=False,
            server_default="1.70",
        ),
        sa.Column("late_grace_minutes", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by", sa.String(length=36), nullable=True),
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
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 1", name="ck_work_settings_singleton"),
        sa.CheckConstraint("normal_start <> normal_end", name="ck_work_settings_normal_window"),
        sa.CheckConstraint("day_start <> day_end", name="ck_work_settings_day_window"),
        sa.CheckConstraint("night_start <> night_end", name="ck_work_settings_night_window"),
        sa.CheckConstraint(
            "overtime_day_multiplier > 0 AND overtime_day_multiplier <= 5",
            name="ck_work_settings_day_multiplier",
        ),
        sa.CheckConstraint(
            "overtime_night_multiplier > 0 AND overtime_night_multiplier <= 5",
            name="ck_work_settings_night_multiplier",
        ),
        sa.CheckConstraint(
            "late_grace_minutes >= 0 AND late_grace_minutes <= 120",
            name="ck_work_settings_grace",
        ),
    )
    # Explicit seed keeps the migration deterministic on PostgreSQL and SQLite.
    op.execute(
        "INSERT INTO work_settings "
        "(id, timezone, normal_start, normal_end, day_start, day_end, night_start, night_end, "
        " overtime_day_start, overtime_cutoff, overtime_day_multiplier, "
        " overtime_night_multiplier, late_grace_minutes, version) "
        "VALUES (1, 'Africa/Cairo', '08:00', '16:00', '08:00', '20:00', '20:00', '08:00', "
        " '06:00', '18:00', 1.35, 1.70, 15, 1)"
    )


def downgrade() -> None:
    op.drop_table("work_settings")
