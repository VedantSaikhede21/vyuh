"""sessions.ended_early: a run the trainee ended is never a final score (decision 173)

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-31 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sessions", sa.Column("ended_early", sa.Boolean(), server_default="false", nullable=False)
    )
    op.execute(
        """
        UPDATE sessions SET ended_early = true
        WHERE id IN (
            SELECT session_id FROM session_events
            WHERE type = 'SESSION_ENDED' AND payload ->> 'reason' = 'ABORTED'
        )
        """
    )
    # Their score rows stay, but only COMPLETED sessions are ever read as scored.
    op.execute(
        """
        UPDATE sessions SET status = 'ABANDONED'
        WHERE ended_early AND mode = 'ASSESSMENT' AND status = 'COMPLETED'
        """
    )


def downgrade() -> None:
    op.drop_column("sessions", "ended_early")
