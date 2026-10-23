"""scoring_trees: instructor-made weight versions of the built-in scoring trees

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-23 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Built-in trees stay JSON files in the repo; a weight edit saves a new immutable
    # version here (decision 121). `content` is the full tree JSON.
    op.create_table(
        "scoring_trees",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("base_id", sa.String(32), nullable=False),
        sa.Column("derived_from", sa.String(32), nullable=False),
        sa.Column("content", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("scoring_trees")
