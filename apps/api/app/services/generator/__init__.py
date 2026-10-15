"""Procedural scenario generator (Phase 3a). Entry point: `generate`."""

from app.services.generator.core import (
    GENERATOR_VERSION,
    SCORING_TREE_ID,
    GenerationError,
    canonical_json,
    generate,
)

__all__ = ["GENERATOR_VERSION", "SCORING_TREE_ID", "GenerationError", "canonical_json", "generate"]
