import numpy as np

from build_display import (
    cover_mask,
    curvature,
    detail_noise,
    imagery_credit,
    median_composite,
    month_windows,
    parse_scenes,
    place_vegetation,
    reflectance_to_srgb,
    sky_view,
)


def test_parse_scenes_reads_the_assets_it_needs():
    hrefs = {
        k: {"href": f"https://x/{k}.tif"} for k in ("red", "green", "blue", "nir", "swir16", "scl")
    }
    reply = {
        "features": [
            {
                "id": "S2A",
                "properties": {"datetime": "2024-10-13T05:49:37Z", "eo:cloud_cover": 1.5},
                "assets": hrefs,
            }
        ]
    }
    scene = parse_scenes(reply)[0]
    assert (scene.id, scene.date, scene.cloud) == ("S2A", "2024-10-13", 1.5)
    assert scene.assets["scl"].endswith("scl.tif")


def test_month_windows_wrap_the_year():
    assert month_windows("08-10", [2024])[0].startswith("2024-08-01")
    assert month_windows("11-02", [2024])[0].endswith("2025-02-28T23:59:59Z")


def test_median_ignores_masked_samples():
    stack = np.array([[[1.0]], [[9.0]], [[3.0]]])
    valid = np.array([[[True]], [[False]], [[True]]])
    assert median_composite(stack, valid)[0, 0] == 2.0


def test_median_of_fully_masked_pixel_is_zero():
    stack = np.array([[[5.0]], [[6.0]]])
    assert median_composite(stack, np.zeros_like(stack, dtype=bool))[0, 0] == 0.0


def test_median_falls_back_where_nothing_strict_is_left():
    stack = np.array([[[4.0]], [[8.0]]])
    none = np.zeros_like(stack, dtype=bool)
    fallback = np.array([[[True]], [[False]]])
    assert median_composite(stack, none, fallback)[0, 0] == 4.0
    assert median_composite(stack, none, none)[0, 0] == 6.0


def test_display_curve_fixed_points():
    out = reflectance_to_srgb(np.array([[[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]]]))
    assert out[0, 0].tolist() == [0, 0, 0]
    assert out[0, 1].tolist() == [255, 255, 255]


def test_cover_thresholds_on_synthetic_bands():
    # water, forest, rock, snow
    red = np.array([[0.02, 0.03, 0.2, 0.6]])
    green = np.array([[0.06, 0.05, 0.2, 0.6]])
    nir = np.array([[0.01, 0.4, 0.25, 0.6]])
    swir = np.array([[0.01, 0.15, 0.3, 0.1]])
    none = np.zeros_like(red, dtype=bool)
    out = cover_mask(red, green, nir, swir, none, none)[0]
    assert out[0, 0] == 255  # water
    assert out[1, 1] > 200  # dense vegetation
    assert out[2, 2] > 150  # bare
    assert out[3, 3] == 255  # snow


def test_sky_view_is_one_on_a_plane_and_lower_in_a_valley():
    assert np.allclose(sky_view(np.zeros((64, 64)), 30.0), 1.0)
    x = np.linspace(-1.0, 1.0, 64)
    valley = 800.0 * x[None, :] ** 2 * np.ones((64, 64))
    sv = sky_view(valley, 30.0)
    assert sv[32, 32] < 0.95


def test_curvature_sign():
    x, y = np.meshgrid(np.arange(-8, 9.0), np.arange(-8, 9.0))
    bowl = x**2 + y**2
    assert curvature(bowl, 1.0)[8, 8] > 0
    assert curvature(-bowl, 1.0)[8, 8] < 0


def test_detail_noise_is_reproducible_and_tiles():
    a = detail_noise(64, seed=3)
    assert np.array_equal(a, detail_noise(64, seed=3))
    seam = np.abs(a[0].astype(int) - a[-1].astype(int)).mean()
    inner = np.abs(a[20].astype(int) - a[21].astype(int)).mean()
    assert seam < inner * 2.5


def test_credit_wording():
    assert imagery_credit(["2024-09-01", "2025-10-01"]) == (
        "Contains modified Copernicus Sentinel data 2024-2025, processed by VYUH"
    )


def test_trees_are_reproducible_and_respect_elevation_and_slope():
    heights = np.zeros((64, 64))
    heights[:, 40:] = 2000.0  # the east side is above the tree line
    cover = np.full((64, 64), 255, dtype="uint8")
    a = place_vegetation(heights, 2500.0, 2000.0, cover, seed=2)
    b = place_vegetation(heights, 2500.0, 2000.0, cover, seed=2)
    assert a.size > 100
    assert np.array_equal(a, b)
    assert (a["x"] / 65535.0).max() < 0.65


def test_no_trees_where_the_cover_is_bare():
    cover = np.zeros((64, 64), dtype="uint8")
    assert place_vegetation(np.zeros((64, 64)), 2500.0, 2000.0, cover).size == 0
