import { CLASS_PROFILES, type ContactClass, type EoIrSensor, type EoLevel } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  CONTRAST_REF,
  CTF_RISE,
  EO_CONTRAST_THRESHOLD,
  INHERENT_CONTRAST,
  apparentContrast,
  eoLevel,
  ttp,
  ttpRatio,
  worstCaseDetectRangeM,
  type EoConditions,
  type EoTarget,
} from '../src/index.ts';

// The day camera's haze model (SIM_VERSION 8, eo-haze plan §2). Every range in the
// plan's §2.5 table is pinned here, so the plan, the docs and the code agree.

/** The scripted and generated camera (decision 176). */
const eo: EoIrSensor = {
  id: 'eo1',
  kind: 'EO_IR',
  x: 0,
  y: 8,
  z: 0,
  fovDegMin: 1.5,
  fovDegMax: 30,
  resolution: [1280, 720],
  irResolution: [640, 512],
};
const FULL = { zoom: 20, mode: 'DAY' as const };
const LEVELS: readonly EoLevel[] = ['DETECT', 'RECOGNISE', 'IDENTIFY'];
const RANK: Record<EoLevel, number> = { DETECT: 1, RECOGNISE: 2, IDENTIFY: 3 };

const cond = (visibilityM: number, pathHaze = 1, skyGroundRatio = 2.5): EoConditions => ({
  isNight: false,
  visibilityM,
  pathHaze,
  skyGroundRatio,
});

const target = (
  cls: ContactClass,
  rangeM: number,
  backgroundGapM: number | null,
  inherentContrast = INHERENT_CONTRAST[CLASS_PROFILES[cls].category],
): EoTarget => ({
  sizeM: CLASS_PROFILES[cls].sizeM,
  thermalContrast: CLASS_PROFILES[cls].thermalContrast,
  rangeM,
  inherentContrast,
  backgroundGapM,
});

/** Farthest range (m) at which `make(range)` reaches `level` (levels fall with range). */
function rangeFor(
  level: EoLevel,
  make: (rangeM: number) => EoTarget,
  c: EoConditions,
  camera: { zoom: number; mode: 'DAY' | 'IR' } = FULL,
): number {
  const ok = (r: number) => {
    const l = eoLevel(eo, camera, make(r), c);
    return l !== null && RANK[l] >= RANK[level];
  };
  let lo = 1;
  let hi = 100_000;
  if (!ok(lo)) return 0;
  while (hi - lo > 0.05) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Today's model (SIM_VERSION 7): Johnson cycles, capped at the visibility. */
const before = (cls: ContactClass, level: EoLevel, v: number) =>
  rangeFor(
    level,
    (r) => target(cls, r, null, { sky: CONTRAST_REF, ground: CONTRAST_REF }),
    cond(v, 0),
  );

// Plan §2.5, in metres: [DETECT, RECOGNISE, IDENTIFY] against the sky, then
// against Punjab farmland right behind the contact (S = 2.5), inside the layer.
const GOLDEN: Record<number, Record<string, { sky: number[]; ground: number[] }>> = {
  20_000: {
    QUAD_SMALL: { sky: [5100, 1790, 1190], ground: [3050, 1240, 860] },
    FIXED_WING_SMALL: { sky: [10_700, 6190, 4770], ground: [6370, 3680, 2870] },
    BIRD_LARGE: { sky: [11_400, 6280, 4610], ground: [4740, 2560, 1940] },
  },
  10_000: {
    QUAD_SMALL: { sky: [3640, 1570, 1080], ground: [2160, 1010, 730] },
    FIXED_WING_SMALL: { sky: [6350, 4230, 3450], ground: [3760, 2510, 2050] },
    BIRD_LARGE: { sky: [6890, 4440, 3580], ground: [2880, 1810, 1440] },
  },
  5000: {
    QUAD_SMALL: { sky: [2400, 1270, 930], ground: [1420, 760, 580] },
    FIXED_WING_SMALL: { sky: [3550, 2680, 2300], ground: [2100, 1590, 1370] },
    BIRD_LARGE: { sky: [3920, 2860, 2430], ground: [1640, 1180, 990] },
  },
  1000: {
    QUAD_SMALL: { sky: [700, 520, 440], ground: [410, 310, 260] },
    FIXED_WING_SMALL: { sky: [800, 730, 690], ground: [470, 430, 410] },
    BIRD_LARGE: { sky: [900, 810, 750], ground: [370, 340, 320] },
  },
};
/** The table rounds to 10 m, and to 100 m at 10 km and beyond. */
const tolerance = (m: number) => (m >= 9950 ? 50 : 6);

describe('golden ranges (plan §2.5)', () => {
  for (const [v, rows] of Object.entries(GOLDEN)) {
    for (const [cls, want] of Object.entries(rows)) {
      it(`${cls} at ${Number(v) / 1000} km visibility`, () => {
        LEVELS.forEach((level, i) => {
          const c = cls as ContactClass;
          const sky = rangeFor(level, (r) => target(c, r, null), cond(Number(v)));
          const ground = rangeFor(level, (r) => target(c, r, 0), cond(Number(v)));
          const s = want.sky[i] ?? 0;
          const g = want.ground[i] ?? 0;
          expect(Math.abs(sky - s), `${level} sky ${sky}`).toBeLessThanOrEqual(tolerance(s));
          expect(Math.abs(ground - g), `${level} ground ${ground}`).toBeLessThanOrEqual(
            tolerance(g),
          );
          // [C2] Nothing gets easier than today.
          const old = before(c, level, Number(v));
          expect(sky).toBeLessThanOrEqual(old + 0.1);
          expect(ground).toBeLessThanOrEqual(old + 0.1);
          expect(ground).toBeLessThanOrEqual(sky);
        });
      });
    }
  }

  it('reproduces the old Johnson ranges with no haze (the "before" column)', () => {
    expect(before('QUAD_SMALL', 'IDENTIFY', 20_000)).toBeCloseTo(1337, -1);
    expect(before('QUAD_SMALL', 'DETECT', 20_000)).toBeCloseTo(8556, -1);
    expect(before('FIXED_WING_SMALL', 'DETECT', 20_000)).toBeCloseTo(20_000, -1);
  });
});

describe('distant backgrounds (plan [C3]; S05: 6 km, m 0.5, S 4, small quad, IDENTIFY)', () => {
  const s05 = cond(6000, 0.5, 4);
  const id = (gap: number | null, inherent?: EoTarget['inherentContrast']) =>
    rangeFor('IDENTIFY', (r) => target('QUAD_SMALL', r, gap, inherent), s05);
  const groundOnly = { sky: 0.3, ground: 0.3 };

  it('hazes the background by the gap (C₀ held at the ground value)', () => {
    expect(id(0, groundOnly)).toBeCloseTo(681, -1);
    expect(id(1000, groundOnly)).toBeCloseTo(791, -1);
    expect(id(3000, groundOnly)).toBeCloseTo(860, -1);
    expect(id(10_000, groundOnly)).toBeCloseTo(892, -1);
  });

  it('also blends C₀ towards the sky value, and stays below today', () => {
    const ranges = [0, 1000, 3000, 10_000].map((gap) => id(gap));
    expect(ranges.map((r) => Math.round(r / 10) * 10)).toEqual([680, 860, 1000, 1100]);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]).toBeGreaterThan(ranges[i - 1] ?? 0);
    }
    for (const r of ranges) expect(r).toBeLessThanOrEqual(before('QUAD_SMALL', 'IDENTIFY', 6000));
    // An infinitely far background is the sky.
    expect(id(1e9)).toBeCloseTo(id(null), 0);
  });
});

describe('fog (S08: heavy quad, 800 m)', () => {
  it('gives no level at 0.8 V, where the old model said IDENTIFY', () => {
    const fog = cond(800);
    expect(eoLevel(eo, FULL, target('QUAD_HEAVY', 642, null), fog)).toBeNull();
    expect(rangeFor('DETECT', (r) => target('QUAD_HEAVY', r, null), fog)).toBeCloseTo(620, -1);
    expect(rangeFor('RECOGNISE', (r) => target('QUAD_HEAVY', r, null), fog)).toBeCloseTo(550, -1);
    expect(rangeFor('IDENTIFY', (r) => target('QUAD_HEAVY', r, null), fog)).toBeCloseTo(510, -1);
  });
});

describe('contrast and TTP', () => {
  const c = cond(10_000);

  it('fades a sky-backed contrast exactly as Koschmieder', () => {
    const t = target('QUAD_SMALL', 2000, null);
    expect(apparentContrast(t, c)).toBeCloseTo(0.5 * Math.exp((-3.912 * 2000) / 10_000), 12);
  });

  it('reduces to the sky case when S = 1 and the background is right behind', () => {
    const same = { sky: 0.4, ground: 0.4 };
    const a = apparentContrast(target('QUAD_SMALL', 3000, 0, same), cond(10_000, 1, 1));
    const b = apparentContrast(target('QUAD_SMALL', 3000, null, same), cond(10_000, 1, 1));
    expect(a).toBeCloseTo(b, 12);
  });

  it('always leaves less contrast against the ground when S > 1', () => {
    for (const r of [100, 1000, 5000]) {
      const same = { sky: 0.4, ground: 0.4 };
      expect(apparentContrast(target('QUAD_SMALL', r, 0, same), c)).toBeLessThan(
        apparentContrast(target('QUAD_SMALL', r, null, same), c),
      );
    }
  });

  it('meets 2 % at the visibility for a black object', () => {
    const black = { sky: 1, ground: 1 };
    // e^(−3.912) = 0.0200005.
    expect(apparentContrast(target('QUAD_SMALL', 10_000, null, black), c)).toBeCloseTo(0.02, 6);
  });

  it('is zero at the threshold, continuous at the pixel limit, 1 at the reference', () => {
    expect(ttp(EO_CONTRAST_THRESHOLD)).toBe(0);
    expect(ttp(0.01)).toBe(0);
    expect(ttp(-1)).toBe(0);
    const edge = EO_CONTRAST_THRESHOLD * CTF_RISE;
    expect(Math.abs(ttp(edge - 1e-12) - ttp(edge))).toBeLessThan(1e-9);
    expect(ttpRatio(CONTRAST_REF)).toBe(1);
    expect(ttpRatio(0.9)).toBe(1);
    let prev = -1;
    for (let x = 0; x <= 1; x += 0.01) {
      expect(ttpRatio(x)).toBeGreaterThanOrEqual(prev);
      prev = ttpRatio(x);
    }
  });

  it('handles zero visibility, zero range and a negative gap without NaN', () => {
    expect(eoLevel(eo, FULL, target('QUAD_SMALL', 100, null), cond(0))).toBeNull();
    expect(Number.isNaN(apparentContrast(target('QUAD_SMALL', 0, -50), c))).toBe(false);
    expect(apparentContrast(target('QUAD_SMALL', 500, -50), c)).toBe(
      apparentContrast(target('QUAD_SMALL', 500, 0), c),
    );
  });

  it('keeps the hard cap at the visibility even on a thin path (plan [C2])', () => {
    const ridge = cond(6000, 0.05);
    expect(eoLevel(eo, FULL, target('HELICOPTER_FRIENDLY', 5900, null), ridge)).not.toBeNull();
    expect(eoLevel(eo, FULL, target('HELICOPTER_FRIENDLY', 6100, null), ridge)).toBeNull();
  });

  it('leaves the IR view and the night unchanged', () => {
    const ir = { zoom: 20, mode: 'IR' as const };
    for (const r of [300, 1000, 3000]) {
      const a = eoLevel(eo, ir, target('QUAD_HEAVY', r, null), cond(5000, 1, 2.5));
      const b = eoLevel(eo, ir, target('QUAD_HEAVY', r, 0), cond(5000, 0, 9));
      expect(a).toBe(b);
    }
    expect(eoLevel(eo, FULL, target('QUAD_HEAVY', 100, null), { ...c, isNight: true })).toBeNull();
  });
});

describe('cue worst case (plan [C1])', () => {
  const night = { isNight: true, visibilityM: 10_000, skyGroundRatio: 2.5 };
  const day = { isNight: false, visibilityM: 10_000, skyGroundRatio: 2.5 };

  it('gives the ground-backed small-quad DETECT range per field of view', () => {
    expect(worstCaseDetectRangeM(eo, 30, day)).toBeCloseTo(291, -1);
    expect(worstCaseDetectRangeM(eo, 14.142, day)).toBeCloseTo(548, -1);
    expect(worstCaseDetectRangeM(eo, 6.708, day)).toBeCloseTo(935, -1);
    expect(worstCaseDetectRangeM(eo, 1.5, day)).toBeGreaterThan(2000);
    expect(worstCaseDetectRangeM(eo, 6.708, night)).toBe(0);
  });

  it('shrinks as the field of view widens', () => {
    let prev = Infinity;
    for (const f of [1.5, 3.2, 6.7, 14.1, 30]) {
      const r = worstCaseDetectRangeM(eo, f, day);
      expect(r).toBeLessThan(prev);
      prev = r;
    }
  });
});
