"""The generated class-profile file (decision 49) matches the shared enums."""

import json
from pathlib import Path

from app.schemas.generated import ContactCategory, ContactClass, ControlLink, ThreatClass

PROFILES = (
    Path(__file__).resolve().parent.parent / "app" / "seed" / "generated" / "class_profiles.json"
)


def test_generated_class_profiles_match_enums() -> None:
    data = json.loads(PROFILES.read_text(encoding="utf-8"))
    assert data["_generated"].startswith("GENERATED FILE")
    classes = data["classes"]
    assert set(classes) == {c.value for c in ContactClass}
    threats = {c.value for c in ThreatClass}
    links = {c.value for c in ControlLink}
    categories = {c.value for c in ContactCategory}
    for code, p in classes.items():
        assert p["isThreat"] == (code in threats)
        assert p["typicalLinks"] and set(p["typicalLinks"]) <= links
        assert p["category"] in categories
        assert p["sizeM"] > 0 and p["rcsM2"] > 0 and p["maxSpeedMps"] > 0
    assert classes["FPV"]["typicalLinks"] == ["RF_MANUAL", "FIBRE_OPTIC"]
    assert classes["HELICOPTER_FRIENDLY"]["typicalLinks"] == ["NONE"]
