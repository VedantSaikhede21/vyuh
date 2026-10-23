"""threat_types, terrain_presets, scenarios, assignments, seed_state, scoring_trees (SPEC §10)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, str_enum, uuid_pk
from app.schemas.generated import ScenarioKind


class ThreatType(Base):
    __tablename__ = "threat_types"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(32))
    is_threat: Mapped[bool]
    size_m: Mapped[float]
    rcs_m2: Mapped[float]
    max_speed_mps: Mapped[float]
    thermal_signature: Mapped[float | None]
    control_links: Mapped[list[str]] = mapped_column(ARRAY(String(32)), server_default="{}")
    model_path: Mapped[str | None] = mapped_column(String(255))
    source_ref: Mapped[str | None] = mapped_column(Text)


class TerrainPreset(Base):
    __tablename__ = "terrain_presets"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB)
    attribution: Mapped[str] = mapped_column(Text, server_default="")


class Scenario(Base):
    __tablename__ = "scenarios"
    __table_args__ = (CheckConstraint("difficulty BETWEEN 1 AND 5", name="difficulty_range"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str | None] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[ScenarioKind] = mapped_column(str_enum(ScenarioKind, "scenario_kind"))
    seed: Mapped[int] = mapped_column(BigInteger)  # uint32 does not fit in int4
    difficulty: Mapped[int] = mapped_column(SmallInteger)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(32)), server_default="{}")
    request: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    schema_version: Mapped[int]
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = created_at()


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint("unit_id IS NOT NULL OR user_id IS NOT NULL", name="has_target"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scenarios.id", ondelete="CASCADE"), index=True
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("units.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()


class SeedState(Base):
    """Fingerprint of the seed data files last applied (decision 119)."""

    __tablename__ = "seed_state"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScoringTreeRow(Base):
    """An instructor-made weight version of a built-in tree (decision 121). Immutable."""

    __tablename__ = "scoring_trees"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    base_id: Mapped[str] = mapped_column(String(32))
    derived_from: Mapped[str] = mapped_column(String(32))
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = created_at()
