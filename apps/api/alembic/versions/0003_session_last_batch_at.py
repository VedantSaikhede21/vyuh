"""sessions.last_batch_at

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-18 16:40:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Wall time of the last accepted batch (heartbeats included): an ACTIVE session
    # with no batch for 15 min is ABANDONED (SPEC §4.5). Null for older sessions.
    op.add_column(
        "sessions", sa.Column("last_batch_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("sessions", "last_batch_at")
