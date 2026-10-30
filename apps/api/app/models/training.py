"""sessions, session_events, scores, debriefs, rating_history, session_remarks,
level_signoffs (SPEC §10)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, str_enum, uuid_pk
from app.schemas.generated import SessionMode, SessionStatus, TrainingLevel


class TrainingSession(Base):
    """A trainee's run of a scenario. Named to avoid clashing with SQLAlchemy's Session."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scenarios.id", ondelete="RESTRICT"), index=True
    )
    mode: Mapped[SessionMode] = mapped_column(str_enum(SessionMode, "session_mode"))
    status: Mapped[SessionStatus] = mapped_column(
        str_enum(SessionStatus, "session_status"), server_default=SessionStatus.CREATED.value
    )
    last_batch_seq: Mapped[int | None]
    #: Wall time of the last accepted batch, heartbeats included (abandonment, SPEC §4.5).
    last_batch_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(server_default=text("false"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    #: sim-core SIM_VERSION of the client that ran it (null for pre-Part-B sessions).
    sim_version: Mapped[int | None]
    resume_count: Mapped[int] = mapped_column(server_default="0")
    resumed_at: Mapped[list[str]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    #: Terrain preset meta.revision at creation (null before Phase 4a; decision 106).
    terrain_revision: Mapped[int | None]


class SessionEvent(Base):
    __tablename__ = "session_events"
    __table_args__ = (
        UniqueConstraint("session_id", "seq", name="uq_session_events_session_id_seq"),
        Index("ix_session_events_session_id_t_ms", "session_id", "t_ms"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    seq: Mapped[int]
    t_ms: Mapped[int]
    type: Mapped[str] = mapped_column(String(32))
    contact_id: Mapped[str | None] = mapped_column(String(64))
    track_id: Mapped[str | None] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)


class ScoreRow(Base):
    __tablename__ = "scores"
    __table_args__ = (
        UniqueConstraint("session_id", "tree_version", name="uq_scores_session_id_tree_version"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    total: Mapped[float]
    detection: Mapped[float]
    classification: Mapped[float]
    decision: Mapped[float]
    report: Mapped[float]
    efficiency: Mapped[float]
    penalties: Mapped[list[Any]] = mapped_column(JSONB)
    per_contact: Mapped[list[Any]] = mapped_column(JSONB)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONB)
    tree_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = created_at()


class Debrief(Base):
    __tablename__ = "debriefs"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    model: Mapped[str] = mapped_column(String(120))
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = created_at()


class RatingHistory(Base):
    __tablename__ = "rating_history"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    before: Mapped[int]
    after: Mapped[int]
    created_at: Mapped[datetime] = created_at()


class SessionRemark(Base):
    """An instructor's remark on a completed session (Phase 6C): AAR tab and a notice."""

    __tablename__ = "session_remarks"

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(String(500))
    is_demo: Mapped[bool] = mapped_column(server_default=text("false"))
    created_at: Mapped[datetime] = created_at()


class LevelSignoff(Base):
    """A staff sign-off of a representative training level (SPEC §9.7). One per user and level."""

    __tablename__ = "level_signoffs"
    __table_args__ = (UniqueConstraint("user_id", "level", name="uq_level_signoffs_user_id_level"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[TrainingLevel] = mapped_column(str_enum(TrainingLevel, "training_level"))
    #: The rules the criteria were met under (`record_v1`).
    ruleset: Mapped[str] = mapped_column(String(32))
    signed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    #: The criteria figures at sign-off.
    criteria: Mapped[list[Any]] = mapped_column(JSONB)
    is_demo: Mapped[bool] = mapped_column(server_default=text("false"))
    created_at: Mapped[datetime] = created_at()
