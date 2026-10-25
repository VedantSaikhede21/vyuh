"""SQLAlchemy ORM models for every table in SPEC §10. Import from here so Alembic sees them all."""

from app.models.base import Base
from app.models.content import (
    Assignment,
    Scenario,
    ScoringTreeRow,
    SeedState,
    TerrainPreset,
    ThreatType,
)
from app.models.org import Unit, User
from app.models.training import (
    Debrief,
    LevelSignoff,
    RatingHistory,
    ScoreRow,
    SessionEvent,
    SessionRemark,
    TrainingSession,
)

__all__ = [
    "Assignment",
    "Base",
    "Debrief",
    "LevelSignoff",
    "RatingHistory",
    "Scenario",
    "ScoreRow",
    "ScoringTreeRow",
    "SeedState",
    "SessionEvent",
    "SessionRemark",
    "TerrainPreset",
    "ThreatType",
    "TrainingSession",
    "Unit",
    "User",
]
