"""sessions.resume_count, sessions.resumed_at (Part 6R S2 session resume)

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-30 22:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # A reload must not be a free pause in Assessment: the server keeps the count,
    # and the AAR and unit views show it.
    op.add_column(
        "sessions", sa.Column("resume_count", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column(
        "sessions",
        sa.Column(
            "resumed_at",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("sessions", "resumed_at")
    op.drop_column("sessions", "resume_count")
