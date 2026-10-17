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

from app.seed.scenarios import SCENARIO_DIR, SOURCE_DIR, scenario_tags
from app.services.generator import GENERATOR_VERSION

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
    assert scenario_tags(source["id"]) == ["library"]
