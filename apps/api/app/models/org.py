"""units, users (SPEC §10)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at, str_enum, uuid_pk
from app.schemas.generated import UserRole


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), unique=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("units.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_at()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Token subject: Supabase user UUID, or `local:<email>` in AUTH_MODE=local.
    auth_id: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(254), index=True)
    role: Mapped[UserRole] = mapped_column(
        str_enum(UserRole, "user_role"), server_default=UserRole.TRAINEE.value
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("units.id", ondelete="SET NULL"), index=True
    )
    rating: Mapped[int] = mapped_column(server_default=text("1000"))
    is_guest: Mapped[bool] = mapped_column(server_default=text("false"))
    #: Notices created after this are unread (null: all unread).
    notices_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()

    unit: Mapped[Unit | None] = relationship(lazy="joined")
