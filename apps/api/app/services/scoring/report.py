"""Contact report scoring (SPEC §9.5, default_v4; Phase 4a decision 115).

Each threat is scored on the best report that names one of its tracks. A report
is compared with the hidden REPORT_TRUTH the sim logged right after it (decision
104), so the server never re-runs the sim. Reports that cover only non-threats
are neither penalised nor credited.

Sub-scores (10 points):
- timeliness 3: full within 60 s of the first MARKED_DETECTED on the reported
  tracks (or of firstDetectableTMs if none was marked), linear to 0 at 180 s;
- count 2: exact; 1 within ±1, or ±20 % for a swarm (true count = swarm group size);
- class 2: exact; 1 for the right category (threat vs non-threat type);
- location 1: the reported bearing and range from the named sensor within 300 m
  of the true position (range taken as horizontal; the slant error is metres);
- heading 1: within 30° of the true heading (any heading while it hovers);
- altitude band 0.5 and activity 0.5.
"""

import math
from typing import Any

from app.schemas.generated import Scenario

TIMELY_FULL_S = 60.0
TIMELY_ZERO_S = 180.0
SWARM_COUNT_TOLERANCE = 0.2
LOCATION_TOLERANCE_M = 300.0
HEADING_TOLERANCE_DEG = 30.0
#: SPEC §4.3 bands; the same rule as `altitudeBandOf` in packages/shared/src/report.ts.
ALTITUDE_BAND_LOW_MAX_M = 50.0
ALTITUDE_BAND_MEDIUM_MAX_M = 150.0

POINTS = {"timeliness": 3, "count": 2, "class": 2, "location": 1, "heading": 1, "heightActivity": 1}


def altitude_band(agl_m: float) -> str:
    if agl_m < ALTITUDE_BAND_LOW_MAX_M:
        return "LOW"
    if agl_m <= ALTITUDE_BAND_MEDIUM_MAX_M:
        return "MEDIUM"
    return "HIGH"


def _angle_diff(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def _timeliness(delay_s: float) -> float:
    if delay_s <= TIMELY_FULL_S:
        return 3.0
    if delay_s >= TIMELY_ZERO_S:
        return 0.0
    return 3.0 * (TIMELY_ZERO_S - delay_s) / (TIMELY_ZERO_S - TIMELY_FULL_S)


def _count(reported: int, true_count: int) -> float:
    if reported == true_count:
        return 2.0
    tolerance = max(1, SWARM_COUNT_TOLERANCE * true_count) if true_count > 1 else 1
    return 1.0 if abs(reported - true_count) <= tolerance else 0.0


def _class(reported: str, truth: str, threat_classes: frozenset[str]) -> float:
    if reported == truth:
        return 2.0
    if reported != "UNKNOWN" and (reported in threat_classes) == (truth in threat_classes):
        return 1.0
    return 0.0


def score_report(
    report: dict[str, Any],
    truth: dict[str, Any],
    *,
    start_t_ms: int,
    true_count: int,
    true_class: str,
    sensor_xz: tuple[float, float] | None,
    threat_classes: frozenset[str],
) -> dict[str, float]:
    """Sub-scores of one report against one contact's truth at the report time."""
    delay_s = max(report["tMs"] - start_t_ms, 0) / 1000
    loc = report["location"]
    location = 0.0
    if sensor_xz is not None:
        b = math.radians(loc["bearingDeg"])
        x = sensor_xz[0] + loc["rangeM"] * math.sin(b)
        z = sensor_xz[1] + loc["rangeM"] * math.cos(b)
        if math.hypot(x - truth["x"], z - truth["z"]) <= LOCATION_TOLERANCE_M:
            location = 1.0
    heading = (
        1.0
        if truth["activity"] == "HOVERING"
        or _angle_diff(report["headingDeg"], truth["headingDeg"]) <= HEADING_TOLERANCE_DEG
        else 0.0
    )
    height_activity = 0.5 * (report["altitudeBand"] == altitude_band(truth["aglM"])) + 0.5 * (
        report["activity"] == truth["activity"]
    )
    parts = {
        "timeliness": round(_timeliness(delay_s), 2),
        "count": _count(report["count"], true_count),
        "class": _class(report["class"], true_class, threat_classes),
        "location": location,
        "heading": heading,
        "heightActivity": height_activity,
    }
    parts["total"] = round(sum(parts.values()), 2)
    parts["delayS"] = round(delay_s, 1)
    return parts


def report_metrics(
    scenario: Scenario,
    events: list[dict[str, Any]],
    *,
    contact_id: str,
    track_ids: list[str],
    first_detectable_t_ms: int | None,
    true_class: str,
    threat_classes: frozenset[str],
) -> dict[str, Any]:
    """Best-report metrics for one contact (all None when no report names its tracks)."""
    spec = next(c for c in scenario.contacts if c.id == contact_id)
    group = spec.group_id
    true_count = (
        sum(1 for c in scenario.contacts if c.group_id == group) if group is not None else 1
    )
    sensors = {s.id: (s.x, s.z) for s in scenario.sensors}
    truth_by_seq = {
        e["payload"]["reportSeq"]: e["payload"]["contacts"]
        for e in events
        if e["type"] == "REPORT_TRUTH"
    }
    marked: dict[str, int] = {}
    for e in events:
        if e["type"] == "MARKED_DETECTED" and e.get("trackId") not in marked:
            marked[e["trackId"]] = e["tMs"]
    mine = set(track_ids)
    best: dict[str, float] | None = None
    best_t: int | None = None
    count = 0
    for e in events:
        if e["type"] != "REPORT_SUBMITTED":
            continue
        report = e["payload"]
        if not mine.intersection(report["trackIds"]):
            continue
        truth = next(
            (t for t in truth_by_seq.get(e["seq"], []) if t["contactId"] == contact_id), None
        )
        if truth is None:
            continue  # rejected by plausibility before scoring; defensive only
        count += 1
        marks = [marked[t] for t in report["trackIds"] if t in marked and marked[t] <= e["tMs"]]
        start = min(marks) if marks else first_detectable_t_ms
        if start is None:
            start = e["tMs"]
        parts = score_report(
            {**report, "tMs": e["tMs"]},
            truth,
            start_t_ms=start,
            true_count=true_count,
            true_class=true_class,
            sensor_xz=sensors.get(report["location"]["fromSensorId"]),
            threat_classes=threat_classes,
        )
        if best is None or parts["total"] > best["total"]:
            best, best_t = parts, e["tMs"]
    if best is None:
        return {"reportsSent": 0, "reportPoints": None, "reportTMs": None}
    return {
        "reportsSent": count,
        "reportPoints": best["total"],
        "reportTMs": best_t,
        "reportDelayS": best["delayS"],
        "reportTimeliness": best["timeliness"],
        "reportCount": best["count"],
        "reportClass": best["class"],
        "reportLocation": best["location"],
        "reportHeading": best["heading"],
        "reportHeightActivity": best["heightActivity"],
        "reportTrueCount": true_count,
    }
