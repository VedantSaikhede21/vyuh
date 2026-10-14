"""Recommended next difficulty after a scored session (decision 64).

RULE_V1 is a placeholder until Phase 5 Elo, which replaces it in the same place.
"""

from app.schemas.generated import RecommendationBasis

MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 5
STEP_UP_AT = 80.0
STEP_DOWN_BELOW = 50.0


def recommend_difficulty(total: float, difficulty: int) -> tuple[int, RecommendationBasis]:
    """Total ≥ 80 → one harder, < 50 → one easier, otherwise the same; clamped to 1-5."""
    if total >= STEP_UP_AT:
        nxt = difficulty + 1
    elif total < STEP_DOWN_BELOW:
        nxt = difficulty - 1
    else:
        nxt = difficulty
    return max(MIN_DIFFICULTY, min(MAX_DIFFICULTY, nxt)), RecommendationBasis.RULE_V1
