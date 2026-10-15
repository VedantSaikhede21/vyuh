"""SPEC §7.1 difficulty scaling as data (generator defaults; tune in playtests)."""

import math
from dataclasses import dataclass

#: (time band, weather preset) pairs each difficulty may draw (SPEC §7.1 "Conditions").
Conditions = tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class Level:
    threats: tuple[int, int]
    false_contacts: tuple[int, int]
    lowest_agl_m: float
    silent_share: float
    spawn_m: float
    conditions: Conditions
    #: 0 none, 1 small group (2-3), 2 one swarm + decoy, 3 multi-axis swarms + decoys.
    swarm_tier: int
    ai_accuracy: float
    ammo_per_threat: float
    roe: str
    #: Approach axes for single threats (1-3, SPEC §7.1 / requirements 3a.1).
    axes: tuple[int, int]


LEVELS: dict[int, Level] = {
    1: Level(
        threats=(1, 1),
        false_contacts=(0, 0),
        lowest_agl_m=100,
        silent_share=0.0,
        spawn_m=6000,
        conditions=(("DAY", "CLEAR"),),
        swarm_tier=0,
        ai_accuracy=0.95,
        ammo_per_threat=3,
        roe="WEAPONS_FREE",
        axes=(1, 1),
    ),
    2: Level(
        threats=(1, 2),
        false_contacts=(1, 2),
        lowest_agl_m=60,
        silent_share=0.0,
        spawn_m=5000,
        conditions=(("DAY", "CLEAR"), ("DAY", "HAZE")),
        swarm_tier=0,
        ai_accuracy=0.90,
        ammo_per_threat=2,
        roe="WEAPONS_FREE",
        axes=(1, 1),
    ),
    3: Level(
        threats=(2, 4),
        false_contacts=(2, 4),
        lowest_agl_m=30,
        silent_share=0.25,
        spawn_m=4000,
        conditions=(("DAY", "CLEAR"), ("DAY", "HAZE"), ("DUSK", "CLEAR"), ("DUSK", "HAZE")),
        swarm_tier=1,
        ai_accuracy=0.85,
        ammo_per_threat=1.5,
        roe="WEAPONS_TIGHT",
        axes=(1, 2),
    ),
    4: Level(
        threats=(4, 8),
        false_contacts=(4, 8),
        lowest_agl_m=15,
        silent_share=0.5,
        spawn_m=3000,
        conditions=(("DUSK", "CLEAR"), ("DUSK", "HAZE"), ("NIGHT", "CLEAR"), ("DAY", "FOG")),
        swarm_tier=2,
        ai_accuracy=0.75,
        ammo_per_threat=1.2,
        roe="WEAPONS_TIGHT",
        axes=(2, 3),
    ),
    5: Level(
        threats=(8, 20),
        false_contacts=(8, 12),
        lowest_agl_m=5,
        silent_share=0.7,
        spawn_m=2500,
        conditions=(("NIGHT", "FOG"), ("NIGHT", "RAIN")),
        swarm_tier=3,
        ai_accuracy=0.65,
        ammo_per_threat=1.0,
        roe="WEAPONS_TIGHT",
        axes=(2, 3),
    ),
}

#: SPEC §16: at most 60 active entities, birds included.
ENTITY_CAP = 60


def ammo_for(level: Level, threats: int) -> int:
    return max(1, math.ceil(threats * level.ammo_per_threat))
