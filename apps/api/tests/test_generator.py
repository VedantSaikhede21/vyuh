"""Procedural generator (Phase 3a Step 5, decision 74): determinism, behaviours, scaling, checks."""

import itertools
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any

import pytest

from app.schemas.generated import GenerateRequest, Scenario
from app.services.generator import GENERATOR_VERSION, GenerationError, canonical_json, generate
from app.services.generator import core as gen_core
from app.services.generator.core import AGL_RAISE_MAX_M, FAST_CLASSES, FAST_MIN_AGL_M
from app.services.generator.difficulty import ENTITY_CAP, LEVELS
from app.services.generator.environment import (
    DAY_MIN_EL_DEG,
    DUSK_EL_DEG,
    NIGHT_MAX_EL_DEG,
    band_times,
    sun_elevation_deg,
)
from app.services.generator.static_checks import contact_problems
from app.services.scenarios import scenario_rule_violations
from app.services.terrain import load_terrain

PRESETS = ("PUNJAB_PLAINS", "JK_MOUNTAIN")
CROSSCHECK = Path(__file__).resolve().parent / "fixtures" / "crosscheck"


def req(**kw: Any) -> GenerateRequest:
    base = {"terrainPreset": "PUNJAB_PLAINS", "difficulty": 3, "seed": 7}
    return GenerateRequest.model_validate(base | kw)


def sweep(difficulties: tuple[int, ...] = (1, 2, 3, 4, 5), seeds: int = 6) -> list[dict]:
    return [
        generate(req(terrainPreset=p, difficulty=d, seed=1000 + s))
        for p in PRESETS
        for d in difficulties
        for s in range(seeds)
    ]


@pytest.fixture(scope="module")
def many() -> list[dict]:
    return sweep()


@pytest.fixture(scope="module")
def wide() -> list[dict]:
    """D3-D5 only, more seeds: enough to see every behaviour and some smugglers."""
    return sweep((3, 4, 5), seeds=12)


# ---- determinism -------------------------------------------------------------------------


@pytest.mark.parametrize("preset", PRESETS)
@pytest.mark.parametrize("difficulty", [1, 3, 5])
def test_same_request_is_byte_identical(preset: str, difficulty: int) -> None:
    r = req(terrainPreset=preset, difficulty=difficulty, seed=4242)
    a = canonical_json(generate(r))
    b = canonical_json(generate(req(terrainPreset=preset, difficulty=difficulty, seed=4242)))
    assert a == b


def test_seed_and_fields_change_the_output() -> None:
    a = generate(req(seed=1))
    assert canonical_json(a) != canonical_json(generate(req(seed=2)))
    assert a["id"] != generate(req(seed=1, timeBand="NIGHT"))["id"]


def test_output_is_valid_and_versioned(many: list[dict]) -> None:
    for s in many:
        model = Scenario.model_validate(s)
        assert scenario_rule_violations(model) == []
        assert s["generatorVersion"] == GENERATOR_VERSION
        assert s["scoringTreeId"] == "default_v3"
        assert s["request"]["seed"] == s["seed"]
        assert [c["id"] for c in s["contacts"]] == [
            f"c{i:02d}" for i in range(1, len(s["contacts"]) + 1)
        ]


def test_floats_are_rounded(many: list[dict]) -> None:
    def walk(v: Any) -> None:
        if isinstance(v, float):
            assert round(v, 2) == v, v
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    for s in many:
        walk(s)


# ---- behaviours --------------------------------------------------------------------------


def contacts_by(many: list[dict], behaviour: str) -> list[tuple[dict, dict]]:
    return [(s, c) for s in many for c in s["contacts"] if c["behaviour"] == behaviour]


def asset_xz(s: dict) -> tuple[float, float]:
    return s["assets"][0]["x"], s["assets"][0]["z"]


def test_every_behaviour_is_generated(many: list[dict], wide: list[dict]) -> None:
    seen = {c["behaviour"] for s in many + wide for c in s["contacts"]}
    assert seen == {
        "RECON_LOITER",
        "SMUGGLING_DROP",
        "ATTACK_RUN",
        "SWARM_SATURATION",
        "DECOY",
        "TRANSIT",
        "FRIENDLY_PATROL",
        "BIRD_FLOCK",
    }


def test_attack_runs_dive_on_the_asset(many: list[dict]) -> None:
    for s, c in contacts_by(many, "ATTACK_RUN") + contacts_by(many, "SWARM_SATURATION"):
        last = c["path"][-1]
        assert last["action"] == "DIVE"
        assert math.dist((last["x"], last["z"]), asset_xz(s)) <= s["assets"][0]["radiusM"]


def test_smuggling_drop_hovers_drops_and_returns(wide: list[dict]) -> None:
    found = [(s, c) for s in wide for c in s["contacts"] if c["behaviour"] == "SMUGGLING_DROP"]
    assert found
    for s, c in found:
        actions = [w.get("action") for w in c["path"]]
        assert actions == [None, "DROP", "RTH"]
        assert 10 <= c["path"][1]["holdS"] <= 20
        # 20-60 m (more at D5's lower floor), lifted up to +60 m to stay in view (decision 76).
        assert all(20 <= w["y"] <= 70 + AGL_RAISE_MAX_M for w in c["path"])
        assert any(z["kind"] == "BORDER_LINE" for z in s["zones"])
        assert c["class"] == "QUAD_HEAVY"


def test_recon_orbits_near_the_asset(many: list[dict]) -> None:
    for s, c in contacts_by(many, "RECON_LOITER"):
        ring = c["path"][1:-1]
        assert len(ring) == 9
        assert all(80 <= w["y"] <= 150 + AGL_RAISE_MAX_M for w in c["path"])
        assert all(math.dist((w["x"], w["z"]), asset_xz(s)) <= 950 for w in ring)


def test_swarms_share_a_group_and_stagger(many: list[dict]) -> None:
    groups: dict[tuple[str, str], list[dict]] = {}
    for s, c in contacts_by(many, "SWARM_SATURATION"):
        groups.setdefault((s["id"], c.get("groupId", c["id"])), []).append(c)
    assert groups
    for members in groups.values():
        spawns = [m["spawnTMs"] for m in members]
        assert spawns == sorted(spawns)
        if len(members) > 1:
            assert len(set(spawns)) == len(spawns)
            assert len({m["controlLink"] for m in members}) == 1


def test_fast_classes_stay_above_clutter(many: list[dict]) -> None:
    for _, c in contacts_by(many, "ATTACK_RUN") + contacts_by(many, "SWARM_SATURATION"):
        if c["class"] in FAST_CLASSES:
            assert min(w["y"] for w in c["path"][:-1]) >= FAST_MIN_AGL_M


def test_border_line_crosses_every_smuggling_route(wide: list[dict]) -> None:
    for s in wide:
        border = next((z for z in s["zones"] if z["kind"] == "BORDER_LINE"), None)
        for c in s["contacts"]:
            if c["behaviour"] != "SMUGGLING_DROP":
                continue
            assert border is not None
            (ax, az), (bx, bz) = (
                (c["path"][0]["x"], c["path"][0]["z"]),
                (
                    c["path"][1]["x"],
                    c["path"][1]["z"],
                ),
            )
            line = border["polyline"]
            assert any(
                _segments_cross((ax, az), (bx, bz), tuple(p), tuple(q))
                for p, q in itertools.pairwise(line)
            ), s["id"]


def _segments_cross(a: tuple, b: tuple, c: tuple, d: tuple) -> bool:
    def orient(p: tuple, q: tuple, r: tuple) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    return orient(a, b, c) * orient(a, b, d) < 0 and orient(c, d, a) * orient(c, d, b) < 0


def test_decoys_are_high_and_loud(many: list[dict]) -> None:
    for s, c in contacts_by(many, "DECOY"):
        assert c["emissions"]["rfActive"] and c["controlLink"] == "RF_MANUAL"
        assert all(w["y"] >= 150 for w in c["path"])
        assert all(math.dist((w["x"], w["z"]), asset_xz(s)) >= 1600 for w in c["path"])


def test_non_threats(many: list[dict]) -> None:
    for s, c in contacts_by(many, "TRANSIT"):
        if c["class"] == "CIVILIAN_HOBBY":
            assert all(math.dist((w["x"], w["z"]), asset_xz(s)) >= 1200 for w in c["path"])
            assert c["affiliation"] == "NEUTRAL" and c["emissions"]["rfActive"]
        else:
            assert c["class"] == "HELICOPTER_FRIENDLY" and c["affiliation"] == "FRIENDLY"
    for _, c in contacts_by(many, "FRIENDLY_PATROL"):
        assert c["class"] == "FRIENDLY_QUAD" and c["affiliation"] == "FRIENDLY"
    flocks = Counter(
        (s["id"], c["groupId"]) for s, c in contacts_by(many, "BIRD_FLOCK") if "groupId" in c
    )
    assert flocks and all(n >= 3 for n in flocks.values())
    for _, c in contacts_by(many, "BIRD_FLOCK"):
        assert c["controlLink"] == "NONE" and not c["emissions"]["rfActive"]


# ---- difficulty scaling ------------------------------------------------------------------


def test_difficulty_table(many: list[dict]) -> None:
    for s in many:
        level = LEVELS[s["difficulty"]]
        threats = [c for c in s["contacts"] if c["isThreat"]]
        assert level.threats[0] <= len(threats) <= level.threats[1]
        assert s["roe"] == level.roe
        assert len(s["contacts"]) <= ENTITY_CAP
        for c in threats:
            if c["behaviour"] in ("ATTACK_RUN", "RECON_LOITER", "SMUGGLING_DROP"):
                d = math.dist((c["path"][0]["x"], c["path"][0]["z"]), asset_xz(s))
                assert d == pytest.approx(level.spawn_m, abs=1)
                assert min(w["y"] for w in c["path"][:-1] or c["path"]) >= level.lowest_agl_m - 1


def test_difficulty_scales_monotonically() -> None:
    stats = {}
    for d in range(1, 6):
        runs = [generate(req(difficulty=d, seed=500 + s)) for s in range(10)]
        threats = [sum(c["isThreat"] for c in r["contacts"]) for r in runs]
        silent = [
            c["controlLink"] != "RF_MANUAL"
            for r in runs
            for c in r["contacts"]
            if c["isThreat"] and c["behaviour"] != "DECOY"
        ]
        stats[d] = (sum(threats) / len(threats), sum(silent) / len(silent))
    means = [stats[d][0] for d in range(1, 6)]
    shares = [stats[d][1] for d in range(1, 6)]
    assert means == sorted(means)
    assert shares[0] == shares[1] == 0
    assert shares == sorted(shares)
    assert shares[4] >= 0.5


def test_conditions_follow_the_table(many: list[dict]) -> None:
    for s in many:
        level = LEVELS[s["difficulty"]]
        assert s["environment"]["weather"]["visibilityM"] in (20000, 6000, 800, 5000)
        night = s["environment"]["isNight"]
        bands = {b for b, _ in level.conditions}
        if night:
            assert "NIGHT" in bands
        if s["difficulty"] == 5:
            assert night


def test_ai_accuracy_drops_at_night_and_in_fog() -> None:
    s = generate(req(difficulty=5, seed=11, weatherPreset="FOG"))
    assert s["request"]["aiAssistAccuracy"] == pytest.approx(0.45)
    day = generate(req(difficulty=2, seed=11))
    assert day["request"]["aiAssistAccuracy"] == pytest.approx(0.9)
    assert all("aiSuggestion" in c for c in s["contacts"])


# ---- requests ------------------------------------------------------------------------------


def test_request_overrides() -> None:
    s = generate(
        req(
            difficulty=4,
            timeBand="DAY",
            weatherPreset="HAZE",
            roe="WEAPONS_FREE",
            durationS=600,
            threatMix={"FPV": 2, "QUAD_HEAVY": 1},
            aiAssistAccuracy=0.5,
        )
    )
    assert not s["environment"]["isNight"]
    assert s["environment"]["weather"]["visibilityM"] == 6000
    assert (s["roe"], s["durationS"]) == ("WEAPONS_FREE", 600)
    threats = Counter(c["class"] for c in s["contacts"] if c["isThreat"])
    assert threats == {"FPV": 2, "QUAD_HEAVY": 1}
    assert s["request"]["threatMix"] == {"FPV": 2, "QUAD_HEAVY": 1}
    assert s["request"]["aiAssistAccuracy"] == 0.5


def test_swarm_size_and_entity_cap() -> None:
    s = generate(req(difficulty=4, seed=3, swarmSize=10))
    sizes = Counter(c["groupId"] for c in s["contacts"] if c["behaviour"] == "SWARM_SATURATION")
    assert max(sizes.values()) == 10
    big = generate(req(difficulty=5, seed=3, falseContactDensity="HIGH"))
    assert len(big["contacts"]) <= ENTITY_CAP
    # Oversized swarms are clamped to the SPEC §16 cap (false contacts and followers trimmed).
    huge = generate(req(difficulty=5, seed=3, swarmSize=50))
    assert len(huge["contacts"]) == ENTITY_CAP
    assert sum(c["isThreat"] for c in huge["contacts"]) >= LEVELS[5].threats[0]


def test_dust_is_refused_and_unknown_preset_is_a_validation_error() -> None:
    with pytest.raises(GenerationError):
        generate(req(weatherPreset="DUST"))
    with pytest.raises(Exception, match="Unknown terrain preset"):
        generate(req(terrainPreset="PROCEDURAL_HILLS"))


# ---- environment ----------------------------------------------------------------------------


def test_noaa_sun_matches_suncalc() -> None:
    fixture = json.loads((CROSSCHECK / "sun_elevations.json").read_text(encoding="utf-8"))
    for preset, rows in fixture.items():
        meta = load_terrain(preset).meta
        for date, time, expected in rows:
            h, m = map(int, time.split(":"))
            el = sun_elevation_deg(
                meta.origin.lat, meta.origin.lon, date, h * 60 + m, meta.utc_offset_min
            )
            assert el == pytest.approx(expected, abs=0.5), (preset, date, time)


@pytest.mark.parametrize("date", ["2026-01-10", "2026-06-21", "2026-11-20"])
def test_band_windows(date: str) -> None:
    meta = load_terrain("JK_MOUNTAIN").meta
    lat, lon, off = meta.origin.lat, meta.origin.lon, meta.utc_offset_min
    for band, ok in (
        ("DAY", lambda el: el >= DAY_MIN_EL_DEG),
        ("DUSK", lambda el: DUSK_EL_DEG[0] <= el <= DUSK_EL_DEG[1]),
        ("NIGHT", lambda el: el <= NIGHT_MAX_EL_DEG),
    ):
        times = band_times(lat, lon, date, off, band)
        assert times, band
        assert all(ok(sun_elevation_deg(lat, lon, date, t, off)) for t in times)
    for band in ("DAY", "DUSK", "NIGHT"):
        s = generate(req(terrainPreset="JK_MOUNTAIN", difficulty=3, seed=9, timeBand=band))
        assert s["environment"]["isNight"] is (band == "NIGHT")


# ---- static checks and retries ------------------------------------------------------------


def test_static_checks_catch_bad_contacts() -> None:
    base = generate(req(difficulty=2, seed=5))
    c = json.loads(json.dumps(base["contacts"][0]))
    assets = base["assets"]
    assert contact_problems(c, 7000, assets) == []
    c["path"][0] |= {"x": 6900}
    c["path"][1] |= {"speedMps": 99}
    probs = contact_problems(c, 7000, assets)
    assert any("outside the map" in p for p in probs)
    assert any("speed" in p for p in probs)
    c = json.loads(json.dumps(base["contacts"][0]))
    c["path"][0] |= {"x": assets[0]["x"] + 100, "z": assets[0]["z"]}
    assert any("spawns within" in p for p in contact_problems(c, 7000, assets))


def test_failing_group_is_regenerated_deterministically(monkeypatch: pytest.MonkeyPatch) -> None:
    real = gen_core._build_threat
    calls: list[str] = []

    def flaky(ctx: Any, slot: Any, rng: Any) -> Any:
        group = real(ctx, slot, rng)
        calls.append(slot.key)
        if calls.count(slot.key) <= 2:
            group.contacts[0]["path"][0]["x"] = 1e6  # outside the map
        return group

    monkeypatch.setattr(gen_core, "_build_threat", flaky)
    a = generate(req(difficulty=1, seed=77))
    calls.clear()
    b = generate(req(difficulty=1, seed=77))
    assert canonical_json(a) == canonical_json(b)
    assert calls == ["threat:0"] * 3

    monkeypatch.setattr(gen_core, "contact_problems", lambda *_: ["always bad"])
    with pytest.raises(GenerationError, match="after 8 attempts"):
        generate(req(difficulty=1, seed=78))
