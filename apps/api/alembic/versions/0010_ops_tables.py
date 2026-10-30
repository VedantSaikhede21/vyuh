"""rate_hits, llm_usage, client_errors (Part 6G: S4 durable limits, S9 error reports)

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-31 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rate_hits",
        sa.Column("key", sa.String(length=200), nullable=False),
        sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("key", "bucket_start", name=op.f("pk_rate_hits")),
    )
    op.create_table(
        "llm_usage",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("requests", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("day", name=op.f("pk_llm_usage")),
    )
    op.create_table(
        "client_errors",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("route", sa.String(length=200), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("stack", sa.Text(), server_default="", nullable=False),
        sa.Column("user_agent", sa.String(length=200), server_default="", nullable=False),
        sa.Column("web_build", sa.String(length=64), server_default="", nullable=False),
        sa.Column("sim_version", sa.String(length=16), server_default="", nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_client_errors")),
    )


def downgrade() -> None:
    op.drop_table("client_errors")
    op.drop_table("llm_usage")
    op.drop_table("rate_hits")
