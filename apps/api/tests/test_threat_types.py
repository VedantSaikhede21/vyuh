"""threat_types seed from the generated class profiles (SPEC §7, §10)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ThreatType
from app.schemas.generated import ContactClass, ThreatClass
from app.seed.threats import seed_threat_types

# SPEC §7 table (representative).
EXPECTED = {
    "QUAD_SMALL": (True, 0.01, ["RF_MANUAL", "AUTONOMOUS_GNSS"]),
    "QUAD_HEAVY": (True, 0.05, ["RF_MANUAL", "AUTONOMOUS_GNSS"]),
    "FPV": (True, 0.005, ["RF_MANUAL", "FIBRE_OPTIC"]),
    "FIXED_WING_SMALL": (True, 0.08, ["AUTONOMOUS_GNSS", "RF_MANUAL"]),
    "LOITERING_GENERIC": (True, 0.1, ["AUTONOMOUS_GNSS"]),
    "BIRD_SMALL": (False, 0.005, ["NONE"]),
    "BIRD_LARGE": (False, 0.02, ["NONE"]),
    "FRIENDLY_QUAD": (False, 0.02, ["RF_MANUAL"]),
    "CIVILIAN_HOBBY": (False, 0.01, ["RF_MANUAL"]),
    "HELICOPTER_FRIENDLY": (False, 5.0, ["NONE"]),
}


def test_every_contact_class_is_seeded(db: Session) -> None:
    assert seed_threat_types(db) == len(ContactClass)
    db.commit()
    rows = {r.code: r for r in db.scalars(select(ThreatType))}
    assert set(rows) == {c.value for c in ContactClass} == set(EXPECTED)
    threats = {c.value for c in ThreatClass}
    for code, (is_threat, rcs, links) in EXPECTED.items():
        row = rows[code]
        assert row.is_threat is is_threat == (code in threats)
        assert row.rcs_m2 == rcs
        assert row.control_links == links
        assert row.size_m > 0 and row.max_speed_mps > 0
        assert row.thermal_signature is not None
    assert rows["BIRD_LARGE"].category == "BIRD"
    assert rows["HELICOPTER_FRIENDLY"].category == "MANNED_AIRCRAFT"
    assert rows["FPV"].category == "DRONE"


def test_threat_seed_is_idempotent(db: Session) -> None:
    seed_threat_types(db)
    db.commit()
    seed_threat_types(db)
    db.commit()
    assert db.scalar(select(func.count()).select_from(ThreatType)) == len(ContactClass)
