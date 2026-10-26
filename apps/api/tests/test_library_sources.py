"""Scripted library scenarios match their sources (plan Step 8, decision 95).

Each `seed/scenarios/src/<ID>.json` is rebuilt with `scripts/scenarios/build_scripted.py`
and compared with the committed `seed/scenarios/<ID>.json`. While the committed file's
generator version is the current one, any difference is drift: re-run the build. After a
generator change the library is frozen (sessions may exist) until rebuilt on purpose.
"""

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

from app.schemas.generated import Scenario
from app.seed.scenarios import DEMO_CODES, SCENARIO_DIR, SOURCE_DIR, scenario_tags
from app.services.generator import GENERATOR_VERSION
from app.services.generator.briefing import REPORT_LINE
from app.services.scoring.engine import score_session

BUILDER = Path(__file__).resolve().parents[3] / "scripts" / "scenarios" / "build_scripted.py"
SOURCES = sorted(SOURCE_DIR.glob("*.json"))


def _builder() -> ModuleType:
    spec = importlib.util.spec_from_file_location("build_scripted", BUILDER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["build_scripted"] = module
    spec.loader.exec_module(module)
    return module


def test_library_ids() -> None:
    assert [p.stem for p in SOURCES] == ["S04", "S05", "S06", "S07", "S08", "S09", "S10", "S15"]


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: p.stem)
def test_committed_scenario_matches_its_source(path: Path) -> None:
    source = json.loads(path.read_text(encoding="utf-8"))
    committed_text = (SCENARIO_DIR / f"{source['id']}.json").read_text(encoding="utf-8")
    committed = json.loads(committed_text)
    if committed.get("generatorVersion") != GENERATOR_VERSION:
        pytest.skip(f"built with generator {committed.get('generatorVersion')}: frozen")
    builder = _builder()
    assert builder.render(builder.build(source)) == committed_text, (
        "stale: cd apps/api && uv run python ../../scripts/scenarios/build_scripted.py"
    )
    assert source["request"]["seed"] == committed["seed"]
    # The judge-path scenarios are also playable by guests (Phase 6E).
    extra = ["demo"] if source["id"] in DEMO_CODES else []
    assert scenario_tags(source["id"]) == ["library", *extra]


# ---- Phase 4a Step 13: the contact report exercise (decision 115) -----------------------

FIXTURES = Path(__file__).resolve().parent / "fixtures"
E2E_LOGS = Path(__file__).resolve().parents[1] / "app" / "seed" / "e2e"
#: The scripted reporting trainee reports at the mark, before the heading and height
#: estimates settle; it scores 8 / 10 today. Below this floor the exercise is broken.
S04_REPORT_FLOOR = 6.0


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: p.stem)
def test_library_scenarios_score_reports_and_ask_for_them(path: Path) -> None:
    committed = json.loads((SCENARIO_DIR / f"{path.stem}.json").read_text(encoding="utf-8"))
    assert committed["scoringTreeId"] == "default_v4"
    assert REPORT_LINE in committed["briefing"].split("## Mission")[1].split("## ")[0]


def _s04() -> Scenario:
    return Scenario.model_validate(
        json.loads((SCENARIO_DIR / "S04.json").read_text(encoding="utf-8"))
    )


def test_s04_reporting_trainee_scores_the_report_component() -> None:
    events = json.loads((FIXTURES / "s04_reports.json").read_text(encoding="utf-8"))
    score = score_session(_s04(), events)
    assert score.components.report >= S04_REPORT_FLOOR


def test_s04_trainee_who_never_reports_scores_zero_for_report() -> None:
    log = json.loads((E2E_LOGS / "s04_assessment.json").read_text(encoding="utf-8"))
    events = log["events"] if isinstance(log, dict) else log
    assert not any(e["type"] == "REPORT_SUBMITTED" for e in events)
    score = score_session(_s04(), events)
    assert score.components.report == 0
    courier = next(p for p in score.per_contact if p.contact_id == "c01")
    assert "REPORT_NONE" in [leaf.root for leaf in courier.leaves]
