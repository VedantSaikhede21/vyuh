"""Subset the IBM Plex woff2 files in source/ into apps/web/app/fonts/.

Keeps Basic Latin, Latin-1 and every other character the repo's UI text and
seed data use, so no glyph falls back to the system font. Keeps the OpenType
features the design uses (tabular and slashed-zero numerals, kerning).

    cd scripts/fonts && uv run python subset.py
"""

from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).parent / "source"
OUT = ROOT / "apps" / "web" / "app" / "fonts"

SCAN_DIRS = [
    "apps/web/app",
    "apps/web/components",
    "apps/web/lib",
    "apps/web/public/landing",
    "apps/api/app/seed",
    "apps/api/app/services",
    "packages/shared/src",
]
SCAN_SUFFIXES = {".ts", ".tsx", ".css", ".json", ".py"}
BASE_RANGES = [(0x20, 0x7E), (0xA0, 0xFF)]
FEATURES = ["kern", "liga", "tnum", "lnum", "zero", "ccmp", "locl", "mark", "mkmk"]


def used_codepoints() -> set[int]:
    points = {cp for lo, hi in BASE_RANGES for cp in range(lo, hi + 1)}
    for rel in SCAN_DIRS:
        for path in (ROOT / rel).rglob("*"):
            if path.suffix in SCAN_SUFFIXES and path.is_file():
                text = path.read_text(encoding="utf-8", errors="ignore")
                points.update(ord(ch) for ch in text if ord(ch) > 0x7E)
    return points


def main() -> None:
    points = used_codepoints()
    print(f"{len(points)} codepoints")
    for src in sorted(SOURCE.glob("*.woff2")):
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = FEATURES
        options.name_IDs = [1, 2, 3, 4, 6, 13, 14]
        options.notdef_outline = True
        options.hinting = False
        font = subset.load_font(str(src), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=sorted(points))
        subsetter.subset(font)
        out = OUT / src.name
        subset.save_font(font, str(out), options)
        print(f"{src.name}: {src.stat().st_size} -> {out.stat().st_size}")


if __name__ == "__main__":
    main()
