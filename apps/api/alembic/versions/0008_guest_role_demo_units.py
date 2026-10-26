"""users.role GUEST, units.is_demo (Phase 6E guest demo)

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-26 22:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Guests are a role of their own (RBAC lists roles explicitly); demo units are
    # the ones a guest may view read-only. The seeder marks them.
    op.drop_constraint(op.f("ck_users_user_role"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_user_role"), "users", "role IN ('TRAINEE', 'INSTRUCTOR', 'ADMIN', 'GUEST')"
    )
    op.add_column(
        "units", sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )


def downgrade() -> None:
    op.drop_column("units", "is_demo")
    op.execute("DELETE FROM users WHERE role = 'GUEST'")
    op.drop_constraint(op.f("ck_users_user_role"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_user_role"), "users", "role IN ('TRAINEE', 'INSTRUCTOR', 'ADMIN')"
    )
