"""Contact classes, control links, emissions and pre-baked AI suggestions (SPEC §7, §13.3)."""

import json
import random
from functools import lru_cache
from pathlib import Path

from app.services.generator.streams import uniform

PROFILES_FILE = Path(__file__).resolve().parents[2] / "seed" / "generated" / "class_profiles.json"

SILENT_LINKS = frozenset({"AUTONOMOUS_GNSS", "FIBRE_OPTIC", "NONE"})
RF_BANDS = ("2.4GHz", "5.8GHz")

#: Threat classes per single-threat behaviour, unlocked by difficulty.
ATTACK_CLASSES = {1: ("QUAD_SMALL",), 2: ("QUAD_SMALL", "QUAD_HEAVY"), 3: ("QUAD_SMALL", "FPV")}
ATTACK_CLASSES_HIGH = ("QUAD_SMALL", "QUAD_HEAVY", "FPV", "LOITERING_GENERIC")
RECON_CLASSES = {1: ("QUAD_SMALL",), 2: ("QUAD_SMALL", "QUAD_HEAVY")}
RECON_CLASSES_HIGH = ("QUAD_SMALL", "QUAD_HEAVY", "FIXED_WING_SMALL")
#: Which behaviours a requested class (threatMix) can fly.
CLASS_BEHAVIOURS = {
    "QUAD_SMALL": ("ATTACK_RUN", "RECON_LOITER"),
    "QUAD_HEAVY": ("SMUGGLING_DROP", "ATTACK_RUN", "RECON_LOITER"),
    "FPV": ("ATTACK_RUN",),
    "FIXED_WING_SMALL": ("RECON_LOITER", "ATTACK_RUN"),
    "LOITERING_GENERIC": ("ATTACK_RUN",),
}
#: Cruise speeds (m/s), within each class's max speed (SPEC §7).
SPEED_MPS = {
    "QUAD_SMALL": (14.0, 17.0),
    "QUAD_HEAVY": (11.0, 14.0),
    "FPV": (25.0, 33.0),
    "FIXED_WING_SMALL": (20.0, 26.0),
    "LOITERING_GENERIC": (30.0, 40.0),
    "BIRD_SMALL": (9.0, 13.0),
    "BIRD_LARGE": (9.0, 13.0),
    "FRIENDLY_QUAD": (8.0, 10.0),
    "CIVILIAN_HOBBY": (6.0, 10.0),
    "HELICOPTER_FRIENDLY": (45.0, 55.0),
}
#: A wrong AI suggestion picks a plausible confusion, never a random class.
CONFUSABLE = {
    "QUAD_SMALL": ("CIVILIAN_HOBBY", "BIRD_LARGE", "QUAD_HEAVY"),
    "QUAD_HEAVY": ("FRIENDLY_QUAD", "QUAD_SMALL"),
    "FPV": ("BIRD_SMALL", "QUAD_SMALL"),
    "FIXED_WING_SMALL": ("BIRD_LARGE", "LOITERING_GENERIC"),
    "LOITERING_GENERIC": ("FIXED_WING_SMALL",),
    "BIRD_SMALL": ("FPV", "QUAD_SMALL"),
    "BIRD_LARGE": ("QUAD_SMALL", "FIXED_WING_SMALL"),
    "FRIENDLY_QUAD": ("QUAD_HEAVY", "CIVILIAN_HOBBY"),
    "CIVILIAN_HOBBY": ("QUAD_SMALL", "FRIENDLY_QUAD"),
    "HELICOPTER_FRIENDLY": ("FIXED_WING_SMALL",),
}
#: Chance a friendly patrol broadcasts its friendly ID, by difficulty.
FRIENDLY_ID_P = {2: 0.8, 3: 0.6, 4: 0.4, 5: 0.3}


@lru_cache(maxsize=1)
def profiles() -> dict[str, dict]:
    """Generated from CLASS_PROFILES in packages/shared (decision 49)."""
    return json.loads(PROFILES_FILE.read_text("utf-8"))["classes"]


def speed_for(rng: random.Random, cls: str) -> float:
    lo, hi = SPEED_MPS[cls]
    return round(min(uniform(rng, lo, hi), profiles()[cls]["maxSpeedMps"]), 1)


def classes_for(behaviour: str, difficulty: int) -> tuple[str, ...]:
    if behaviour == "ATTACK_RUN":
        return ATTACK_CLASSES.get(difficulty, ATTACK_CLASSES_HIGH)
    if behaviour == "RECON_LOITER":
        return RECON_CLASSES.get(difficulty, RECON_CLASSES_HIGH)
    if behaviour == "SMUGGLING_DROP":
        return ("QUAD_HEAVY",)
    if behaviour == "SWARM_SATURATION":
        return ("QUAD_SMALL",) if difficulty <= 3 else ("QUAD_SMALL", "FPV")
    if behaviour == "DECOY":
        return ("FIXED_WING_SMALL", "QUAD_HEAVY")
    raise ValueError(behaviour)


def silent_options(cls: str) -> list[str]:
    return [link for link in profiles()[cls]["typicalLinks"] if link in SILENT_LINKS]


def has_rf_option(cls: str) -> bool:
    return "RF_MANUAL" in profiles()[cls]["typicalLinks"]


def emissions(rng: random.Random, link: str, friendly_id: str | None = None) -> dict:
    if link in SILENT_LINKS:
        return {"rfActive": False}
    out: dict = {"rfActive": True, "rfBand": rng.choice(RF_BANDS)}
    if friendly_id is not None:
        out["friendlyIdCode"] = friendly_id
    return out


def ai_suggestion(rng: random.Random, cls: str, accuracy: float) -> dict:
    """Correct with probability `accuracy`; a wrong one can still be confident (over-trust)."""
    if rng.random() < accuracy:
        return {"suggestedClass": cls, "confidence": round(uniform(rng, 0.6, 0.95), 2)}
    return {
        "suggestedClass": rng.choice(CONFUSABLE[cls]),
        "confidence": round(uniform(rng, 0.5, 0.85), 2),
    }


def ai_accuracy(base: float, is_night: bool, weather_preset: str) -> float:
    """SPEC §7.1 accuracy, minus 0.1 at night and 0.1 in fog (plan Step 5)."""
    acc = base - (0.1 if is_night else 0.0) - (0.1 if weather_preset == "FOG" else 0.0)
    return round(min(max(acc, 0.3), 1.0), 2)
