"""Runtime static checks (decision 74): cheap geometry rules only, no sensors.

Sensor checks (detectable, warning time, defender wins) run in the sim-core
validator in the CI seed sweep, not at request time (no Node in the API image).
"""

import math

from app.services.generator.contacts import profiles

#: Waypoints stay this far inside the map edge (routes use 250 m).
EDGE_MARGIN_M = 200.0
MIN_AGL_M = 5.0
#: Threats spawn at least this far from every asset; other non-friendlies 800 m.
THREAT_SPAWN_MIN_M = 1500.0
OTHER_SPAWN_MIN_M = 800.0


def contact_problems(c: dict, half: float, assets: list[dict]) -> list[str]:
    out: list[str] = []
    cid = c["id"]
    max_speed = profiles()[c["class"]]["maxSpeedMps"]
    for i, w in enumerate(c["path"]):
        if abs(w["x"]) > half - EDGE_MARGIN_M or abs(w["z"]) > half - EDGE_MARGIN_M:
            out.append(f"{cid}: waypoint {i} outside the map margin")
        if w["y"] < MIN_AGL_M and w.get("action") != "DIVE":
            out.append(f"{cid}: waypoint {i} below {MIN_AGL_M} m AGL")
        if not 0 < w["speedMps"] <= max_speed:
            out.append(f"{cid}: waypoint {i} speed {w['speedMps']} outside (0, {max_speed}]")
    first = c["path"][0]
    min_range = (
        THREAT_SPAWN_MIN_M
        if c["isThreat"]
        else 0.0
        if c["affiliation"] == "FRIENDLY"
        else OTHER_SPAWN_MIN_M
    )
    for a in assets:
        if math.dist((first["x"], first["z"]), (a["x"], a["z"])) < min_range:
            out.append(f"{cid}: spawns within {min_range:.0f} m of {a['id']}")
    return out
