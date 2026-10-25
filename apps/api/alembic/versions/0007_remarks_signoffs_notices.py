"""session_remarks, level_signoffs, users.notices_seen_at (Phase 6C, SPEC §9.7)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-25 16:17:54.449612
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Representative training-level sign-offs (one per user and level), instructor
    # remarks on sessions, and the notices read marker.
    op.create_table(
        "level_signoffs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "level",
            sa.Enum(
                "BASIC_OPERATOR",
                "SENSOR_OPERATOR",
                "ENGAGEMENT_CONTROLLER",
                "INSTRUCTOR",
                name="training_level",
                native_enum=False,
                create_constraint=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("ruleset", sa.String(length=32), nullable=False),
        sa.Column("signed_by", sa.Uuid(), nullable=True),
        sa.Column("criteria", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "level IN ('BASIC_OPERATOR', 'SENSOR_OPERATOR', 'ENGAGEMENT_CONTROLLER', 'INSTRUCTOR')",
            name=op.f("ck_level_signoffs_training_level"),
        ),
        sa.ForeignKeyConstraint(
            ["signed_by"],
            ["users.id"],
            name=op.f("fk_level_signoffs_signed_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_level_signoffs_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_level_signoffs")),
        sa.UniqueConstraint("user_id", "level", name="uq_level_signoffs_user_id_level"),
    )
    op.create_index(op.f("ix_level_signoffs_user_id"), "level_signoffs", ["user_id"], unique=False)
    op.create_table(
        "session_remarks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.String(length=500), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name=op.f("fk_session_remarks_author_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["sessions.id"],
            name=op.f("fk_session_remarks_session_id_sessions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_session_remarks")),
    )
    op.create_index(
        op.f("ix_session_remarks_session_id"), "session_remarks", ["session_id"], unique=False
    )
    op.add_column("users", sa.Column("notices_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "notices_seen_at")
    op.drop_index(op.f("ix_session_remarks_session_id"), table_name="session_remarks")
    op.drop_table("session_remarks")
    op.drop_index(op.f("ix_level_signoffs_user_id"), table_name="level_signoffs")
    op.drop_table("level_signoffs")
