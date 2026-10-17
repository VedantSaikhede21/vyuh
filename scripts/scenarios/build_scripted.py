"""Build the scripted library scenarios from their sources (Phase 3b Step 8, decision 94).

    cd apps/api && uv run python ../../scripts/scenarios/build_scripted.py [--check] [ID ...]

Source `apps/api/app/seed/scenarios/src/<ID>.json`:

    {
      "id": "S04", "name": "Night Drop", "tags": ["library"], "citation": "short key",
      "request": {GenerateRequest},          # fixed seed: the generator output is the base
      "briefing": "## Situation ...",        # replaces the generated briefing; {assets}
                                             # and {roe} insert the generated sections
      "patch": {RFC 7386 merge patch},       # on the scenario, contacts excluded
      "contacts": {"c03": {merge patch} | null, "x01": {full contact}}
    }

`contacts` patches a generated contact by id (null removes it; an unknown id adds a full
contact). The result is validated (Pydantic + cross-field rules) and written to
`apps/api/app/seed/scenarios/<ID>.json`. `--check` writes nothing and exits 1 if a
committed file differs from its build.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

API = Path(__file__).resolve().parents[2] / "apps" / "api"
sys.path.insert(0, str(API))

from app.schemas.generated import GenerateRequest, Scenario  # noqa: E402
from app.services.generator import generate  # noqa: E402
from app.services.generator.briefing import effector_line  # noqa: E402
from app.services.scenarios import scenario_rule_violations  # noqa: E402

SCENARIOS = API / "app" / "seed" / "scenarios"
SOURCES = SCENARIOS / "src"


def merge_patch(target: Any, patch: Any) -> Any:
    """RFC 7386 JSON merge patch."""
    if not isinstance(patch, dict):
        return patch
    out = dict(target) if isinstance(target, dict) else {}
    for key, value in patch.items():
        if value is None:
            out.pop(key, None)
        else:
            out[key] = merge_patch(out.get(key), value)
    return out


def briefing_sections(markdown: str) -> dict[str, str]:
    """Body text per "## Heading" of a generated briefing."""
    out: dict[str, str] = {}
    for block in markdown.split("## ")[1:]:
        head, _, body = block.partition("\n")
        out[head.strip().lower()] = body.strip()
    return out


def build(source: dict[str, Any]) -> dict[str, Any]:
    scenario = generate(GenerateRequest.model_validate(source["request"]))
    scenario = merge_patch(scenario, source.get("patch", {}))
    scenario["id"] = source["id"]
    scenario["name"] = source["name"]
    generated = briefing_sections(scenario["briefing"])
    # Assets from the final effectors (a patch may change ammo); the sensor line as generated.
    sensors = generated["assets"].splitlines()[0]
    assets = "\n".join([sensors, *(f"- {effector_line(e)}" for e in scenario["effectors"])])
    scenario["briefing"] = (
        source["briefing"].replace("{assets}", assets).replace("{roe}", generated["roe"])
    )
    contacts = {c["id"]: c for c in scenario["contacts"]}
    for cid, patch in source.get("contacts", {}).items():
        if patch is None:
            contacts.pop(cid, None)
        elif cid in contacts:
            contacts[cid] = merge_patch(contacts[cid], patch)
        else:
            contacts[cid] = {"id": cid, **patch}
    scenario["contacts"] = sorted(contacts.values(), key=lambda c: c["id"])
    model = Scenario.model_validate(scenario)
    problems = scenario_rule_violations(model)
    if problems:
        raise ValueError(f"{source['id']}: {'; '.join(problems)}")
    return scenario


def render(scenario: dict[str, Any]) -> str:
    return json.dumps(scenario, indent=2, ensure_ascii=False) + "\n"


def sources(ids: list[str]) -> list[dict[str, Any]]:
    paths = sorted(SOURCES.glob("*.json"))
    loaded = [json.loads(p.read_text(encoding="utf-8")) for p in paths]
    return [s for s in loaded if not ids or s["id"] in ids]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if a committed file differs")
    parser.add_argument("ids", nargs="*", help="only these ids")
    args = parser.parse_args(argv)
    stale = []
    for source in sources(args.ids):
        text = render(build(source))
        out = SCENARIOS / f"{source['id']}.json"
        if args.check:
            if not out.is_file() or out.read_text(encoding="utf-8") != text:
                stale.append(source["id"])
            continue
        out.write_text(text, encoding="utf-8", newline="\n")
        print(f"Wrote {out.relative_to(API)}")
    if stale:
        print(f"Stale (re-run the build): {', '.join(stale)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
