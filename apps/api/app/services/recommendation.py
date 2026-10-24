"""Elo rating and recommended next difficulty (SPEC §9.3, decision 129).

R starts at 1000. Scenario rating D = 800 + 150 * difficulty. Expected
E = 1 / (1 + 10^((D - R) / 400)); actual A = total / 100; R' = R + 32 * (A - E),
rounded to an integer. The recommended next difficulty is the level whose D is
closest to R + 50 (ties: the easier level).
"""

from dataclasses import dataclass

from app.schemas.generated import RecommendationBasis

MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 5
START_RATING = 1000
K_FACTOR = 32
#: Train slightly above the current rating.
STRETCH = 50


def scenario_rating(difficulty: int) -> int:
    return 800 + 150 * difficulty


def expected_result(rating: float, difficulty: int) -> float:
    return 1 / (1 + 10 ** ((scenario_rating(difficulty) - rating) / 400))


@dataclass(frozen=True)
class EloUpdate:
    before: int
    after: int
    scenario_rating: int
    expected: float


def elo_update(rating: int, difficulty: int, total: float) -> EloUpdate:
    expected = expected_result(rating, difficulty)
    after = round(rating + K_FACTOR * (total / 100 - expected))
    return EloUpdate(rating, after, scenario_rating(difficulty), round(expected, 4))


def recommend_difficulty(rating: float) -> tuple[int, RecommendationBasis]:
    target = rating + STRETCH
    best = min(
        range(MIN_DIFFICULTY, MAX_DIFFICULTY + 1),
        key=lambda d: (abs(scenario_rating(d) - target), d),
    )
    return best, RecommendationBasis.ELO_V1
