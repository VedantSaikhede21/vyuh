"""Date, time band, sun and weather (SPEC §7.1, §14).

The sun uses the NOAA solar-position equations (stdlib `math`). It is
cross-checked against sim-core's suncalc in CI (fixture `crosscheck/sun.json`),
and sim-core recomputes `isNight` from the preset anyway (decision 33), so this
only has to pick times that sit clearly inside a band.
"""

import datetime as dt
import json
import math
import random
from pathlib import Path

from app.services.generator.streams import uniform

#: Written by `pnpm gen:schemas` from packages/shared/src/time-band.ts.
TIME_BANDS_FILE = Path(__file__).resolve().parents[2] / "seed" / "generated" / "time_bands.json"
_BANDS = json.loads(TIME_BANDS_FILE.read_text("utf-8"))
#: Sim rule (shared): night when the sun is below -6 deg.
NIGHT_SUN_EL_DEG: float = _BANDS["nightSunElDeg"]
#: Label bands (shared): DAY at or above this, DUSK between it and the night rule.
DAY_LABEL_MIN_EL_DEG: float = _BANDS["dayMinElDeg"]
#: Generator windows keep ≥ 2° away from the night threshold, so a small model
#: difference between NOAA and suncalc can never flip `isNight`.
_WINDOWS = _BANDS["generatorWindowsDeg"]
DAY_MIN_EL_DEG: float = _WINDOWS["DAY"][0]
DUSK_EL_DEG: tuple[float, float] = (_WINDOWS["DUSK"][0], _WINDOWS["DUSK"][1])
NIGHT_MAX_EL_DEG: float = _WINDOWS["NIGHT"][1]
#: Candidate times are on a 10-minute grid, local time.
STEP_MIN = 10
#: Fixed scenario year (dates only vary the season).
YEAR = 2026

#: Months each weather preset is plausible in on the northern Indian plains
#: (representative: winter fog Dec-Jan, monsoon rain Jul-Aug, haze Oct-Mar).
SEASON_MONTHS: dict[str, tuple[int, ...]] = {
    "CLEAR": (2, 3, 4, 10, 11),
    "HAZE": (10, 11, 12, 1, 2, 3),
    "FOG": (12, 1),
    "RAIN": (7, 8),
    "DUST": (4, 5, 6),
}


def sun_elevation_deg(
    lat: float, lon: float, date: str, minutes: int, utc_offset_min: int
) -> float:
    """Solar elevation (no refraction) at local `date` + `minutes` after midnight."""
    d = dt.date.fromisoformat(date)
    utc_min = minutes - utc_offset_min
    # Julian day at 00:00 UTC of `date`, plus the UTC time of day.
    jd = d.toordinal() + 1721424.5 + utc_min / 1440
    jc = (jd - 2451545) / 36525
    l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    mr = math.radians(m)
    c = (
        math.sin(mr) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
        + math.sin(2 * mr) * (0.019993 - 0.000101 * jc)
        + math.sin(3 * mr) * 0.000289
    )
    true_long = l0 + c
    omega = 125.04 - 1934.136 * jc
    app_long = true_long - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    mean_obliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    obliq = mean_obliq + 0.00256 * math.cos(math.radians(omega))
    decl = math.asin(math.sin(math.radians(obliq)) * math.sin(math.radians(app_long)))
    y = math.tan(math.radians(obliq / 2)) ** 2
    l0r = math.radians(l0)
    eq_time = 4 * math.degrees(
        y * math.sin(2 * l0r)
        - 2 * e * math.sin(mr)
        + 4 * e * y * math.sin(mr) * math.cos(2 * l0r)
        - 0.5 * y * y * math.sin(4 * l0r)
        - 1.25 * e * e * math.sin(2 * mr)
    )
    true_solar = (utc_min + eq_time + 4 * lon) % 1440
    hour_angle = true_solar / 4 - 180
    latr = math.radians(lat)
    cos_zenith = math.sin(latr) * math.sin(decl) + math.cos(latr) * math.cos(decl) * math.cos(
        math.radians(hour_angle)
    )
    return 90 - math.degrees(math.acos(max(-1.0, min(1.0, cos_zenith))))


def time_band_for_elevation(el_deg: float) -> str:
    """Shared label band (packages/shared timeBandForElevation): NIGHT / DUSK / DAY."""
    if el_deg < NIGHT_SUN_EL_DEG:
        return "NIGHT"
    if el_deg < DAY_LABEL_MIN_EL_DEG:
        return "DUSK"
    return "DAY"


def hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def band_times(lat: float, lon: float, date: str, utc_offset_min: int, band: str) -> list[int]:
    """Candidate local times (minutes) for a band; DUSK and NIGHT are evening only."""
    els = [
        (t, sun_elevation_deg(lat, lon, date, t, utc_offset_min))
        for t in range(0, 24 * 60, STEP_MIN)
    ]
    noon = max(els, key=lambda p: p[1])[0]
    if band == "DAY":
        return [t for t, el in els if el >= DAY_MIN_EL_DEG]
    if band == "DUSK":
        return [t for t, el in els if t > noon and DUSK_EL_DEG[0] <= el <= DUSK_EL_DEG[1]]
    if band == "NIGHT":
        return [t for t, el in els if t > noon and el <= NIGHT_MAX_EL_DEG]
    raise ValueError(f"Unknown time band {band!r}")


def pick_date(rng: random.Random, weather_preset: str) -> str:
    month = rng.choice(SEASON_MONTHS[weather_preset])
    days = (dt.date(YEAR + month // 12, month % 12 + 1, 1) - dt.date(YEAR, month, 1)).days
    return dt.date(YEAR, month, rng.randint(1, days)).isoformat()


def pick_time(
    rng: random.Random, lat: float, lon: float, date: str, utc_offset_min: int, band: str
) -> tuple[str, float]:
    """(HH:mm, sun elevation) for a time inside the band on that date."""
    times = band_times(lat, lon, date, utc_offset_min, band)
    if not times:
        raise ValueError(f"No {band} time on {date}")
    t = rng.choice(times)
    return hhmm(t), sun_elevation_deg(lat, lon, date, t, utc_offset_min)


def weather_for(rng: random.Random, preset: str) -> dict[str, float]:
    """Weather object (SPEC §4) for a preset; representative values."""
    wind = round(uniform(rng, 0, 8), 1)
    wind_dir = rng.randrange(0, 360)
    base = {"rainMmph": 0.0, "windMps": wind, "windDirDeg": wind_dir}
    if preset == "CLEAR":
        return base | {"visibilityM": 20000, "cloudPct": rng.randrange(0, 25)}
    if preset == "HAZE":
        return base | {"visibilityM": 6000, "cloudPct": rng.randrange(10, 40)}
    if preset == "FOG":
        return base | {
            "visibilityM": 800,
            "cloudPct": rng.randrange(80, 101),
            "windMps": min(wind, 3),
        }
    if preset == "RAIN":
        return base | {
            "visibilityM": 5000,
            "cloudPct": rng.randrange(85, 101),
            "rainMmph": round(uniform(rng, 4, 12), 1),
        }
    if preset == "DUST":
        return base | {"visibilityM": 2000, "cloudPct": rng.randrange(0, 20)}
    raise ValueError(f"Unknown weather preset {preset!r}")
