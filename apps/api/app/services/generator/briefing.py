"""Generated briefing markdown (requirements 3a.1): Situation, Mission, ROE, Assets, Intel.

The web briefing page splits on `## ` headings and shows the ROE section as a
callout. Intel names the expected axis at D1-D2, a broad sector at D3 and stays
vague at D4-D5.
"""

COMPASS = ("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
SECTOR = ("northern", "eastern", "southern", "western")

TIME_WORDS = {"DAY": "Daylight", "DUSK": "Dusk, sun low in the west", "NIGHT": "Night"}
WEATHER_WORDS = {
    "CLEAR": "clear, good visibility",
    "HAZE": "haze, visibility about 6 km",
    "FOG": "fog, visibility under 1 km",
    "RAIN": "rain, visibility about 5 km",
    "DUST": "dust, visibility about 2 km",
}
#: default_v4 scores contact reports, so the briefing says they are expected (decision 115).
REPORT_LINE = "Contact reports are expected: send one for every threat track (R)."
ROE_TEXT = {
    "WEAPONS_FREE": "WEAPONS FREE — engage any track you assess as a threat.",
    "WEAPONS_TIGHT": (
        "WEAPONS TIGHT — intercept only tracks you have classified as a threat type "
        "and declared HOSTILE."
    ),
    "WEAPONS_HOLD": "WEAPONS HOLD — no intercepts. Electronic warfare is permitted.",
}


def effector_line(e: dict) -> str:
    """One Assets line per effector (range, rounds or cycle)."""
    km = f"{e['rangeM'] / 1000:.1f} km"
    if e["kind"] == "INTERCEPT":
        return f"Interceptor, {km}, {e.get('ammo', 0)} rounds, {e['cooldownS']} s reload"
    name = "RF jammer" if e["kind"] == "EW_JAM" else "GNSS spoofer"
    return f"{name}, {km}, ±10° sector, {e['cooldownS']} s cycle"


def compass(bearing: float) -> str:
    return COMPASS[round(bearing / 45) % 8]


def sector(bearing: float) -> str:
    return SECTOR[round(bearing / 90) % 4]


def briefing(
    *,
    difficulty: int,
    band: str,
    weather_preset: str,
    roe: str,
    asset_name: str,
    effector_lines: list[str],
    axes: list[float],
    has_border: bool,
    has_no_kinetic: bool,
    has_friendly: bool,
) -> str:
    situation = f"{TIME_WORDS[band]}; {WEATHER_WORDS[weather_preset]}. "
    situation += f"Hostile drone activity is reported near {asset_name}."
    if has_border:
        situation += " A border line crosses the area; expect low crossings and payload drops."
    if has_friendly:
        situation += " Own patrol drones are airborne and may not broadcast a friendly ID."

    mission = (
        f"Detect, identify and defeat hostile drones before they reach {asset_name} "
        "or drop a payload. Leave birds, civilians and friendlies alone. " + REPORT_LINE
    )
    roe_text = ROE_TEXT[roe]
    if has_no_kinetic:
        roe_text += " No intercepts inside the marked no-kinetic zones (settlements)."

    if difficulty <= 2:
        intel = f"Expected approach from the {compass(axes[0])}."
    elif difficulty == 3:
        intel = f"Activity reported in the {sector(axes[0])} sector."
    else:
        intel = "Multiple contacts possible from several directions; no reliable axis."

    assets = "\n".join(f"- {line}" for line in effector_lines)
    return (
        f"## Situation\n{situation}\n"
        f"## Mission\n{mission}\n"
        f"## ROE\n{roe_text}\n"
        f"## Assets\n{assets}\n"
        f"## Intel\n{intel}"
    )
