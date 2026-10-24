"""Elo rating and recommended next difficulty (SPEC §9.3, decision 129)."""

import pytest

from app.schemas.generated import RecommendationBasis
from app.services.recommendation import (
    elo_update,
    expected_result,
    recommend_difficulty,
    scenario_rating,
)


def test_scenario_rating_and_expected() -> None:
    assert [scenario_rating(d) for d in range(1, 6)] == [950, 1100, 1250, 1400, 1550]
    assert expected_result(1100, 2) == pytest.approx(0.5)
    assert expected_result(1000, 1) == pytest.approx(1 / (1 + 10 ** (-50 / 400)))


@pytest.mark.parametrize(
    ("rating", "difficulty", "total", "after"),
    [
        (1000, 1, 100.0, 1014),  # E ≈ 0.571: +32 * 0.429 = 13.7
        (1100, 2, 50.0, 1100),  # as expected: no change
        (1100, 2, 100.0, 1116),
        (1100, 2, 0.0, 1084),
        (1000, 5, 100.0, 1031),  # far harder: almost the full K
    ],
)
def test_elo_update(rating: int, difficulty: int, total: float, after: int) -> None:
    assert elo_update(rating, difficulty, total).after == after


@pytest.mark.parametrize(
    ("rating", "expected"),
    [
        (1000, 2),  # target 1050: D2 (1100) is 50 away, D1 (950) 100
        (975, 1),  # target 1025: a tie between D1 and D2 goes to the easier level
        (900, 1),
        (1050, 2),
        (1200, 3),
        (1300, 4),  # target 1350: D4 (1400) is 50 away, D3 (1250) 100
        (1500, 5),
        (2000, 5),
    ],
)
def test_recommend_closest_to_rating_plus_50(rating: int, expected: int) -> None:
    assert recommend_difficulty(rating) == (expected, RecommendationBasis.ELO_V1)
