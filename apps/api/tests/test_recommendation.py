"""RULE_V1 recommended next difficulty (decision 64)."""

import pytest

from app.schemas.generated import RecommendationBasis
from app.services.recommendation import recommend_difficulty


@pytest.mark.parametrize(
    ("total", "difficulty", "expected"),
    [
        (49.9, 3, 2),
        (50.0, 3, 3),
        (79.9, 3, 3),
        (80.0, 3, 4),
        (100.0, 5, 5),  # clamped at the top
        (0.0, 1, 1),  # clamped at the bottom
        (80.0, 1, 2),
        (10.0, 5, 4),
    ],
)
def test_rule_v1(total: float, difficulty: int, expected: int) -> None:
    assert recommend_difficulty(total, difficulty) == (expected, RecommendationBasis.RULE_V1)
