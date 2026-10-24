"""Spectrogram templates: deterministic, valid PNG, distinct signatures."""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import gen_spectrograms as g


def _tpl(family: str) -> g.Template:
    return next(t for t in g.TEMPLATES if t.family == family)


def test_deterministic_and_sized() -> None:
    for t in g.TEMPLATES:
        a, b = g.spectrogram(t), g.spectrogram(t)
        assert a.shape == (g.HEIGHT, g.WIDTH)
        assert a.dtype == np.uint8
        assert np.array_equal(a, b)


def _band_energy(img: np.ndarray, frac: float) -> float:
    """Mean brightness more than `frac` of the Doppler range away from the body line."""
    h = img.shape[0]
    rows = np.abs(np.arange(h) - h / 2) > frac * h / 2
    return float(img[rows].mean())


def test_blades_spread_wide_birds_stay_close() -> None:
    multirotor = g.spectrogram(_tpl("MULTIROTOR"))
    bird = g.spectrogram(_tpl("BIRD"))
    # Blade flashes fill the outer Doppler band; a bird's wingbeat does not.
    assert _band_energy(multirotor, 0.6) > 2 * _band_energy(bird, 0.6)


def test_png_writer(tmp_path: Path) -> None:
    img = (np.arange(12, dtype=np.uint8) * 20).reshape(3, 4)
    p = tmp_path / "x.png"
    g.write_png(p, img)
    data = p.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert data[12:16] == b"IHDR"
