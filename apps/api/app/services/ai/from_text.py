"""Text-to-scenario (SPEC §13.2, decision 134): the LLM outputs parameters only.

The LLM's JSON is read field by field into a `GenerateRequest`: values outside the
schema bounds are clamped, unknown values are dropped, and each change is noted for the
instructor, who confirms the parameters before the deterministic generator runs. The
seed comes from the text, so the same text gives the same scenario.
"""

import hashlib
import json
from typing import Any

from app.core.errors import ApiError
from app.schemas.generated import ErrorCode, FromTextResponse, GenerateRequest, ThreatClass
from app.services.ai.llm import LlmClient, LlmError, prompt

PRESETS = ("PUNJAB_PLAINS", "JK_MOUNTAIN", "URBAN_GENERIC")
DEFAULT_PRESET = "PUNJAB_PLAINS"
DEFAULT_DIFFICULTY = 3
ENUMS: dict[str, tuple[str, ...]] = {
    "timeBand": ("DAY", "DUSK", "NIGHT"),
    "weatherPreset": ("CLEAR", "HAZE", "FOG", "RAIN"),
    "falseContactDensity": ("LOW", "MED", "HIGH"),
    "roe": ("WEAPONS_FREE", "WEAPONS_TIGHT", "WEAPONS_HOLD"),
}
#: (min, max) of each integer field (GenerateRequest bounds; swarm >= 2 to be a swarm).
INTS: dict[str, tuple[int, int]] = {
    "difficulty": (1, 5),
    "swarmSize": (2, 50),
    "decoys": (0, 6),
    "durationS": (60, 1800),
}
MAX_PER_CLASS = 20
LABEL = {
    "difficulty": "difficulty",
    "swarmSize": "swarm size",
    "decoys": "decoys",
    "durationS": "duration",
    "timeBand": "time of day",
    "weatherPreset": "weather",
    "falseContactDensity": "false-contact density",
    "roe": "ROE",
    "terrainPreset": "terrain",
    "approachBearingDeg": "approach bearing",
    "aiAssistAccuracy": "AI-assist accuracy",
    "threatMix": "threat mix",
}


def text_seed(text: str) -> int:
    """Same text (case and spacing ignored) → same seed → same scenario."""
    norm = " ".join(text.lower().split())
    return int.from_bytes(hashlib.sha256(norm.encode()).digest()[:4], "big")


def _number(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, int | float):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.strip())
        except ValueError:
            return None
    return None


def clamp_request(obj: dict[str, Any], text: str) -> tuple[GenerateRequest, list[str]]:
    """LLM JSON → a valid GenerateRequest and plain-word notes on what changed."""
    notes: list[str] = []
    out: dict[str, Any] = {"seed": text_seed(text)}

    preset = obj.get("terrainPreset")
    if preset in PRESETS:
        out["terrainPreset"] = preset
    else:
        out["terrainPreset"] = DEFAULT_PRESET
        if preset is not None:
            notes.append(f"Unknown terrain {preset!r}: using {DEFAULT_PRESET}.")
        else:
            notes.append(f"No terrain named: using {DEFAULT_PRESET}.")

    for key, (lo, hi) in INTS.items():
        if key not in obj or obj[key] is None:
            continue
        n = _number(obj[key])
        if n is None:
            notes.append(f"Ignored {LABEL[key]} {obj[key]!r}: not a number.")
            continue
        v = min(max(round(n), lo), hi)
        if v != n:
            notes.append(f"{LABEL[key].capitalize()} {obj[key]} set to {v} (allowed {lo}-{hi}).")
        out[key] = v
    if "difficulty" not in out:
        out["difficulty"] = DEFAULT_DIFFICULTY
        notes.append(f"No difficulty named: using {DEFAULT_DIFFICULTY}.")

    for key, allowed in ENUMS.items():
        v = obj.get(key)
        if v is None:
            continue
        if isinstance(v, str) and v.upper() in allowed:
            out[key] = v.upper()
        else:
            notes.append(f"Ignored {LABEL[key]} {v!r}.")

    if obj.get("approachBearingDeg") is not None:
        b = _number(obj["approachBearingDeg"])
        if b is None:
            notes.append(f"Ignored approach bearing {obj['approachBearingDeg']!r}.")
        else:
            out["approachBearingDeg"] = round(b % 360, 1) % 360

    if obj.get("aiAssistAccuracy") is not None:
        a = _number(obj["aiAssistAccuracy"])
        if a is None:
            notes.append(f"Ignored AI-assist accuracy {obj['aiAssistAccuracy']!r}.")
        else:
            if a > 1 and a <= 100:
                a /= 100  # "80 %"
            clamped = min(max(a, 0.0), 1.0)
            if clamped != a:
                notes.append(f"AI-assist accuracy set to {clamped:g} (allowed 0-1).")
            out["aiAssistAccuracy"] = round(clamped, 2)

    mix = obj.get("threatMix")
    if isinstance(mix, dict):
        valid = {c.value for c in ThreatClass}
        kept: dict[str, int] = {}
        for cls, count in mix.items():
            n = _number(count)
            if cls not in valid or n is None:
                notes.append(f"Ignored threat {cls!r}.")
                continue
            v = min(max(round(n), 0), MAX_PER_CLASS)
            if v != n:
                notes.append(f"{cls} count {count} set to {v}.")
            if v > 0:
                kept[cls] = v
        if kept:
            out["threatMix"] = kept
    elif mix is not None:
        notes.append("Ignored the threat mix: not a class → count object.")

    unknown = sorted(set(obj) - set(LABEL) - {"seed"})
    if unknown:
        notes.append(f"Ignored unknown fields: {', '.join(unknown)}.")
    return GenerateRequest.model_validate(out), notes


def parse_text(llm: LlmClient, user_key: str, text: str) -> FromTextResponse:
    """Text → confirmed-before-use parameters. 503 when the LLM is off or fails."""
    if not llm.enabled:
        raise ApiError(
            ErrorCode.LLM_UNAVAILABLE,
            "Text-to-scenario needs the LLM, which is off on this server (LLM_ENABLED=false). "
            "Use the scenario form instead.",
        )
    try:
        req, notes = llm.complete_json(
            user_key,
            prompt("from_text_system.txt"),
            json.dumps({"text": text}),
            lambda obj: clamp_request(obj, text),
            max_tokens=1000,
        )
    except LlmError as err:
        if err.reason == "RATE_LIMITED":
            raise ApiError(ErrorCode.RATE_LIMITED, str(err)) from err
        raise ApiError(
            ErrorCode.LLM_UNAVAILABLE,
            f"Could not read the text ({err}). Try again or use the scenario form.",
            {"reason": err.reason},
        ) from err
    return FromTextResponse(request=req, notes=notes, model=llm.model)
