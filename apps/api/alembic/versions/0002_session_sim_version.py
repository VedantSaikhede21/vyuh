"""sessions.sim_version

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-14 22:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable: sessions created before Part B have no recorded sim version.
    op.add_column("sessions", sa.Column("sim_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "sim_version")
