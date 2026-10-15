"""Named, independent random sub-streams (decision 74).

Each part of the generator draws from its own `random.Random`, seeded from a
sha256 of (seed, name). Adding draws to one part never shifts another, and the
result never depends on Python's per-process `hash()` randomisation.
"""

import hashlib
import random


def stream(seed: int, name: str) -> random.Random:
    digest = hashlib.sha256(f"{seed}:{name}".encode()).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))  # noqa: S311 — not crypto


def uniform(rng: random.Random, lo: float, hi: float) -> float:
    return lo + (hi - lo) * rng.random()
