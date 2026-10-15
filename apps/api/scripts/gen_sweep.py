"""Generator seed sweep (Phase 3a Step 7, decision 76).

Writes `N` generated scenarios per difficulty into DIR, cycling through the
terrain presets, with seeds from a fixed list, for the sim-core validator:

    uv run python scripts/gen_sweep.py --per-difficulty 20 --out <dir>
    pnpm --filter @vyuh/sim-core validate <dir> --max-fail-pct 2
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.generated import GenerateRequest
from app.services.generator import canonical_json, generate
from app.services.terrain import available_presets


def sweep_seeds(n: int, difficulty: int) -> list[int]:
    """A fixed, well-spread list of uint32 seeds per difficulty (Knuth multiplicative hash).

    Each difficulty gets its own seeds: a seed with unlucky effector rolls must not
    fail every difficulty at once.
    """
    return [((difficulty * 1000 + i) * 2654435761 + 12345) % 2**32 for i in range(1, n + 1)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--per-difficulty", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    presets = available_presets()
    count = 0
    for difficulty in range(1, 6):
        for i, seed in enumerate(sweep_seeds(args.per_difficulty, difficulty)):
            preset = presets[i % len(presets)]
            req = GenerateRequest(terrainPreset=preset, difficulty=difficulty, seed=seed)
            scenario = generate(req)
            name = f"{preset}-D{difficulty}-{seed:010d}.json"
            (args.out / name).write_text(canonical_json(scenario) + "\n", encoding="utf-8")
            count += 1
    print(f"Wrote {count} scenarios to {args.out}")


if __name__ == "__main__":
    main()
