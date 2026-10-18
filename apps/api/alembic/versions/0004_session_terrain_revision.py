"""sessions.terrain_revision

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-18 17:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Terrain preset meta.revision when the session was created; replay needs it to
    # match the current preset (decision 106). Null for older sessions.
    op.add_column("sessions", sa.Column("terrain_revision", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "terrain_revision")
