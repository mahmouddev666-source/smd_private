"""leave approval workflow decision notes

Revision ID: e5b2d3f9a6c1
Revises: d4a1c2e8f5b7
Create Date: 2026-11-17 09:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5b2d3f9a6c1"
down_revision: Union[str, None] = "d4a1c2e8f5b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Approval/rejection reason shown in the leave history. Existing rows keep
    # an empty note, so no data migration is required.
    op.add_column(
        "leaves",
        sa.Column("decision_notes", sa.String(length=500), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("leaves", "decision_notes")
