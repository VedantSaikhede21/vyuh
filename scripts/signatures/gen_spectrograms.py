"""Micro-Doppler spectrogram templates (SPEC §6.4, decision 135). numpy only.

    cd scripts/signatures && uv run python gen_spectrograms.py [--out DIR]

Simulates the complex baseband return of one target at X-band and writes its
short-time Fourier transform as an 8-bit greyscale PNG per class family, plus
`signatures.json` with the axes. Representative textbook physics (V. C. Chen,
"The Micro-Doppler Effect in Radar", 2011): each rotating blade is a line of point
scatterers whose radial velocity is r·Ω·cos(Ωt + φ); summed coherently they give a
"blade flash" when the blade is broadside to the radar. Birds have no blades: the
wings flap at 2-10 Hz, a slow sinusoidal ripple around the body line.

- multirotor: 4 rotors x 2 blades, 0.12 m, ~60 rev/s → dense, slightly irregular flashes;
- fixed-wing: 1 propeller x 2 blades, 0.15 m, 100 rev/s, faint flashes, strong body line;
- bird: 4.5 Hz wingbeat, 0.35 m wings, no flashes;
- helicopter: main rotor 2 blades x 5 m at 5 rev/s → few strong flashes.

Output is deterministic (no randomness); the client adds SNR-scaled noise at render
time only (never in the simulation).
"""

from __future__ import annotations

import argparse
import json
import struct
import zlib
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "apps" / "web" / "public" / "signatures"
WAVELENGTH_M = 0.032  # X-band, 9.4 GHz (representative)
WIDTH, HEIGHT = 256, 128
DYNAMIC_RANGE_DB = 45.0
POINTS_PER_BLADE = 24
#: STFT (window, hop) in samples: shorter than the flash interval for small rotors.
WINDOW = {"MULTIROTOR": (16, 2), "FIXED_WING": (16, 2), "HELICOPTER": (64, 8), "BIRD": (128, 8)}


@dataclass(frozen=True)
class Template:
    family: str
    label: str
    time_span_s: float
    doppler_max_hz: float
    cue: str


def _blades(
    t: np.ndarray, rotors: int, blades: int, length_m: float, rev_s: float, amp: float
) -> np.ndarray:
    """Coherent return of rotating blades (point scatterers along each blade)."""
    out = np.zeros_like(t, dtype=complex)
    r = np.linspace(length_m / POINTS_PER_BLADE, length_m, POINTS_PER_BLADE)
    omega = 2 * np.pi * rev_s
    for k in range(rotors):
        # Rotors spin at slightly different rates and phases, as real ones do.
        w = omega * (1 + 0.03 * k)
        for b in range(blades):
            phi = 2 * np.pi * b / blades + 0.7 * k
            theta = w * t[:, None] + phi
            phase = 4 * np.pi / WAVELENGTH_M * r[None, :] * np.sin(theta)
            out += amp / POINTS_PER_BLADE * np.exp(1j * phase).sum(axis=1)
    return out


def _wings(t: np.ndarray, beat_hz: float, span_m: float, amp_deg: float) -> np.ndarray:
    """Flapping wings: tips swing ±amp about the body, radial motion r·sin(wing angle)."""
    out = np.zeros_like(t, dtype=complex)
    angle = np.radians(amp_deg) * np.sin(2 * np.pi * beat_hz * t)
    r = np.linspace(span_m / 8, span_m, 8)
    for side in (1, -1):
        z = side * r[None, :] * np.sin(angle[:, None])
        out += 0.35 / 8 * np.exp(1j * 4 * np.pi / WAVELENGTH_M * z).sum(axis=1)
    # The body heaves a little with each beat.
    heave = 0.02 * np.sin(2 * np.pi * beat_hz * t + np.pi / 2)
    out += np.exp(1j * 4 * np.pi / WAVELENGTH_M * heave)
    return out


def _signal(family: str, t: np.ndarray) -> np.ndarray:
    body = np.ones_like(t, dtype=complex)
    if family == "MULTIROTOR":
        return 0.6 * body + _blades(t, rotors=4, blades=2, length_m=0.12, rev_s=60, amp=0.5)
    if family == "FIXED_WING":
        return 1.0 * body + _blades(t, rotors=1, blades=2, length_m=0.15, rev_s=100, amp=0.25)
    if family == "HELICOPTER":
        return 1.0 * body + _blades(t, rotors=1, blades=2, length_m=5.0, rev_s=5.0, amp=1.6)
    if family == "BIRD":
        return _wings(t, beat_hz=4.5, span_m=0.35, amp_deg=40)
    raise ValueError(family)


TEMPLATES = [
    Template(
        "MULTIROTOR",
        "Multirotor",
        0.08,
        5000,
        "Dense, regular vertical flashes from several rotors around a body line.",
    ),
    Template(
        "FIXED_WING",
        "Fixed-wing / propeller",
        0.08,
        6000,
        "A strong steady body line with fainter periodic propeller flashes.",
    ),
    Template(
        "BIRD",
        "Bird",
        1.0,
        800,
        "A slow ripple (2-10 Hz wingbeat) close to the body line; no blade flashes.",
    ),
    Template(
        "HELICOPTER",
        "Helicopter",
        0.6,
        10000,
        "Few, very wide flashes from long main-rotor blades.",
    ),
]


def stft(x: np.ndarray, nper: int, hop: int) -> np.ndarray:
    """Two-sided short-time Fourier transform, Hann window: (frequency, frame)."""
    window = np.hanning(nper)
    padded = np.concatenate([np.zeros(nper // 2), x, np.zeros(nper // 2)])
    starts = range(0, len(padded) - nper + 1, hop)
    frames = np.stack([padded[i : i + nper] * window for i in starts], axis=1)
    return np.fft.fft(frames, axis=0)


def spectrogram(tpl: Template) -> np.ndarray:
    """|STFT| in dB, 0 Doppler centred, resampled to HEIGHT x WIDTH, scaled to 0..255."""
    fs = 2.0 * tpl.doppler_max_hz
    n = int(fs * tpl.time_span_s)
    t = np.arange(n) / fs
    x = _signal(tpl.family, t)
    nper, hop = WINDOW[tpl.family]
    power = np.fft.fftshift(np.abs(stft(x, nper, hop)) ** 2, axes=0)
    db = 10 * np.log10(power + 1e-12)
    db = np.clip(db - db.max() + DYNAMIC_RANGE_DB, 0, DYNAMIC_RANGE_DB) / DYNAMIC_RANGE_DB
    # Resample to the output grid (linear), high Doppler at the top.
    rows = np.linspace(0, db.shape[0] - 1, HEIGHT)
    cols = np.linspace(0, db.shape[1] - 1, WIDTH)
    tmp = np.array([np.interp(cols, np.arange(db.shape[1]), row) for row in db])
    img = np.array([np.interp(rows, np.arange(db.shape[0]), col) for col in tmp.T]).T
    return np.flipud(np.round(img * 255)).astype(np.uint8)


def write_png(path: Path, img: np.ndarray) -> None:
    """8-bit greyscale PNG with the standard library only."""
    h, w = img.shape
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    meta = {}
    for tpl in TEMPLATES:
        name = tpl.family.lower().replace("_", "-")
        write_png(args.out / f"{name}.png", spectrogram(tpl))
        meta[tpl.family] = {
            **{k: v for k, v in asdict(tpl).items() if k != "family"},
            "file": f"{name}.png",
        }
        print(f"Wrote {name}.png")
    (args.out / "signatures.json").write_text(
        json.dumps(
            {
                "_generated": "GENERATED by scripts/signatures/gen_spectrograms.py",
                "width": WIDTH,
                "height": HEIGHT,
                "wavelengthM": WAVELENGTH_M,
                "families": meta,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print("Wrote signatures.json")


if __name__ == "__main__":
    main()
