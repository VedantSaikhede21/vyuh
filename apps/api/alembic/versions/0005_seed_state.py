"""seed_state: fingerprint of the seed data last applied

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-21 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # One row per seed set ("demo"): the hash of the seed data files last applied, so
    # the dev API re-seeds at startup only when they changed (decision 119).
    op.create_table(
        "seed_state",
        sa.Column("key", sa.String(40), primary_key=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("seed_state")
