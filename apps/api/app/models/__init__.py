"""SQLAlchemy ORM models for every table in SPEC §10. Import from here so Alembic sees them all."""

from app.models.base import Base
from app.models.content import Assignment, Scenario, TerrainPreset, ThreatType
from app.models.org import Unit, User
from app.models.training import Debrief, RatingHistory, ScoreRow, SessionEvent, TrainingSession

__all__ = [
    "Assignment",
    "Base",
    "Debrief",
    "RatingHistory",
    "Scenario",
    "ScoreRow",
    "SessionEvent",
    "TerrainPreset",
    "ThreatType",
    "TrainingSession",
    "Unit",
    "User",
]
