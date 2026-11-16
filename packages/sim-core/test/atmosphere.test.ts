import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FOG_MAX_VISIBILITY_M,
  HAZE_MAX_VISIBILITY_M,
  INHERENT_CONTRAST,
  KOSCHMIEDER,
  SKY_GROUND_RATIO,
  betaFor,
  floorOf,
  hazeLayer,
  layerFor,
  meanDensity,
  monthOf,
  pathHaze,
  presetFor,
  regionFor,
} from '../src/atmosphere.ts';
import { dexp } from '../src/dmath.ts';

const w = (visibilityM: number, rainMmph = 0) => ({ visibilityM, rainMmph });

describe('Koschmieder extinction', () => {
  it('leaves 2 % contrast at the visibility inside the layer', () => {
    for (const v of [800, 5000, 20_000]) {
      expect(dexp(-betaFor(v) * v)).toBeCloseTo(0.02, 3);
    }
    expect(KOSCHMIEDER).toBe(3.912);
  });

  it('never divides by zero', () => {
    expect(Number.isFinite(betaFor(0))).toBe(true);
  });
});

describe('mean haze density along a path', () => {
  it('is 1 inside the even layer and exp(−Δ/H) on a level path above it', () => {
    expect(meanDensity(-300, -10, 400)).toBe(1);
    expect(meanDensity(-10, -10, 400)).toBe(1);
    expect(meanDensity(200, 200, 400)).toBeCloseTo(Math.exp(-200 / 400), 12);
  });

  it('is continuous across the layer top and across the near-level branch', () => {
    for (const a of [-200, -50, 0, 80]) {
      expect(Math.abs(meanDensity(a, -0.5, 400) - meanDensity(a, 0.5, 400))).toBeLessThan(0.01);
    }
    expect(meanDensity(99.5, 100.4, 400)).toBeCloseTo(meanDensity(99.9, 100.1, 400), 3);
  });

  it('thins the path from a ridge camera (S05: 926 m above the floor, HAZE layer)', () => {
    const layer = hazeLayer('JK_MOUNTAIN', '2026-02-14', w(6000), 0);
    expect(pathHaze(layer, 926, 926)).toBeCloseTo(Math.exp(-826 / 500), 9);
    expect(pathHaze(layer, 926, 50)).toBeGreaterThan(pathHaze(layer, 926, 926));
  });
});

describe('weather preset, region and layer', () => {
  it('follows the numbers (IMD fog at 1,000 m, haze to 10 km, rain first, never DUST)', () => {
    expect(presetFor(w(20_000, 0.1))).toBe('RAIN');
    expect(presetFor(w(FOG_MAX_VISIBILITY_M))).toBe('FOG');
    expect(presetFor(w(FOG_MAX_VISIBILITY_M + 1))).toBe('HAZE');
    expect(presetFor(w(HAZE_MAX_VISIBILITY_M))).toBe('HAZE');
    expect(presetFor(w(HAZE_MAX_VISIBILITY_M + 1))).toBe('CLEAR');
    expect(presetFor(w(2000))).not.toBe('DUST');
  });

  it('maps presets to regions; procedural hills borrow the plains', () => {
    expect(regionFor('JK_MOUNTAIN')).toBe('JK_MOUNTAIN');
    expect(regionFor('URBAN_GENERIC')).toBe('URBAN_GENERIC');
    expect(regionFor('PUNJAB_PLAINS')).toBe('PUNJAB_PLAINS');
    expect(regionFor('PROCEDURAL_HILLS')).toBe('PUNJAB_PLAINS');
  });

  it('deepens the plains layer by season and keeps J&K fixed', () => {
    expect(layerFor('CLEAR', 'PUNJAB_PLAINS', 1)).toEqual({ baseM: 150, falloffM: 400 });
    expect(layerFor('HAZE', 'PUNJAB_PLAINS', 4)).toEqual({ baseM: 600, falloffM: 1200 });
    expect(layerFor('CLEAR', 'PUNJAB_PLAINS', 10)).toEqual({ baseM: 400, falloffM: 900 });
    expect(layerFor('HAZE', 'URBAN_GENERIC', 10)).toEqual({ baseM: 320, falloffM: 720 });
    expect(layerFor('FOG', 'PUNJAB_PLAINS', 7)).toEqual({ baseM: 50, falloffM: 100 });
    for (const m of [1, 4, 8]) expect(layerFor('CLEAR', 'JK_MOUNTAIN', m).baseM).toBe(0);
  });

  it('reads the month from an ISO date', () => {
    expect(monthOf('2026-10-07')).toBe(10);
    expect(monthOf('bad')).toBe(1);
  });

  it('starts the layer at the lowest ground', () => {
    expect(floorOf(Float32Array.from([5, -357, 2526]))).toBe(-357);
    expect(floorOf([])).toBe(0);
    expect(hazeLayer('PUNJAB_PLAINS', '2026-10-07', w(10_000), -5).topY).toBe(395);
  });
});

describe('the render draws the same layer', () => {
  // Until apps/web/lib/sim/atmosphere-look.ts imports these (eo-haze plan §6), its
  // copy of the layer tables must stay identical, or the picture and the sensor
  // would fade contacts at different distances.
  const block = (src: string, from: string, to: string) => {
    const i = src.indexOf(from);
    const j = src.indexOf(to, i);
    expect(i, from).toBeGreaterThanOrEqual(0);
    return src
      .slice(i, j)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, '');
  };
  const web = new URL('../../../apps/web/lib/sim/atmosphere-look.ts', import.meta.url);
  const own = new URL('../src/atmosphere.ts', import.meta.url);

  it('has identical season and fixed layer tables', () => {
    const a = readFileSync(web, 'utf8');
    const b = readFileSync(own, 'utf8');
    if (!a.includes('const PLAINS_SEASON')) return; // the web imports them now
    for (const [from, to] of [
      ['const PLAINS_SEASON', '/** URBAN'],
      ['const URBAN_LAYER_SCALE', ';'],
      ['const FIXED_LAYER', 'export function layerFor'],
    ] as const) {
      expect(block(a, from, to)).toBe(block(b, from, to));
    }
  });
});

describe('representative contrast tables', () => {
  it('keep every value inside 0..1 and the sky above the ground for each category', () => {
    for (const c of Object.values(INHERENT_CONTRAST)) {
      expect(c.sky).toBeGreaterThan(c.ground);
      expect(c.sky).toBeLessThanOrEqual(1);
      expect(c.ground).toBeGreaterThan(0);
    }
    for (const s of Object.values(SKY_GROUND_RATIO)) expect(s).toBeGreaterThan(1);
  });
});
