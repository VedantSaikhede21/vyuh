import { readFileSync } from 'node:fs';
import type { SimEnvironment } from '@vyuh/sim-core';
import { describe, expect, it } from 'vitest';
import {
  atmosphereLook,
  betaFor,
  CONTACT_FLOOR,
  contactTransmittance,
  KOSCHMIEDER,
  layerFor,
  meanDensity,
  presetFor,
  rayleighOpticalDepth,
  regionFor,
  TACTICAL_MIN_VIS_M,
  transmittance,
  turbidityFor,
  type AtmosphereSite,
} from '../lib/sim/atmosphere-look';

const weather = (visibilityM: number, rainMmph = 0) => ({
  visibilityM,
  rainMmph,
  windMps: 0,
  windDirDeg: 0,
  cloudPct: 0,
});

const env = (visibilityM: number, date = '2026-10-07', elDeg = 40): SimEnvironment => ({
  date,
  time: '12:00',
  sun: { azDeg: 180, elDeg },
  isNight: elDeg < -6,
  weather: weather(visibilityM),
});

const PUNJAB: AtmosphereSite = {
  terrainPreset: 'PUNJAB_PLAINS',
  floorY: -5,
  floorAltM: 232,
  sizeM: 14_000,
};

describe('Koschmieder fog', () => {
  it('leaves 2 % contrast at exactly the visibility inside the even layer', () => {
    const V = 6000;
    const p = { beta: betaFor(V), topY: 1000, falloffM: 500 };
    expect(transmittance(V, 0, 0, p)).toBeCloseTo(0.02, 3);
    expect(Math.abs(transmittance(V, 0, 0, p) - 0.02)).toBeLessThan(0.0005);
  });

  it('mean density is 1 under the layer top and exp(−Δ/H) on a level path above it', () => {
    expect(meanDensity(-300, -10, 400)).toBe(1);
    expect(meanDensity(-10, -10, 400)).toBe(1);
    expect(meanDensity(200, 200, 400)).toBeCloseTo(Math.exp(-200 / 400), 10);
  });

  it('is continuous across the layer top (no jump within 1 m)', () => {
    for (const a of [-500, -50, 0.4, 300]) {
      const below = meanDensity(a, -0.5, 400);
      const above = meanDensity(a, 0.5, 400);
      expect(Math.abs(below - above)).toBeLessThan(0.01);
    }
    // Long climbing path vs a near-level one at the same mid height agree in the limit.
    expect(meanDensity(99.5, 100.4, 400)).toBeCloseTo(meanDensity(99.9, 100.1, 400), 3);
  });

  it('thins the haze for a camera high above the layer', () => {
    const p = { beta: betaFor(6000), topY: 300, falloffM: 1000 };
    expect(transmittance(5000, 3000, 0, p)).toBeGreaterThan(transmittance(5000, 0, 0, p));
  });
});

describe('contact contrast floor (EO)', () => {
  const V = 6000;
  const p = { beta: betaFor(V), topY: 1e6, falloffM: 1000 };
  it('keeps the floor (0.5) at half the visibility', () => {
    expect(transmittance(0.5 * V, 0, 0, p)).toBeLessThan(CONTACT_FLOOR);
    expect(contactTransmittance(0.5 * V, 0, 0, p)).toBeCloseTo(CONTACT_FLOOR, 10);
  });
  it('fades to the plain physical value at the visibility and beyond', () => {
    expect(contactTransmittance(V, 0, 0, p)).toBeCloseTo(transmittance(V, 0, 0, p), 10);
    expect(contactTransmittance(1.3 * V, 0, 0, p)).toBe(transmittance(1.3 * V, 0, 0, p));
  });
});

describe('derived turbidity', () => {
  /** Visibility whose haze column over `layerM` is `aod` (inverse of turbidityFor's input). */
  const visForAod = (aod: number, layerM: number, altM: number) =>
    KOSCHMIEDER / (aod / layerM + 13.2e-6 * Math.exp(-altM / 8000));

  it('uses Hansen–Travis molecular depth (0.097 at 550 nm, sea level)', () => {
    expect(rayleighOpticalDepth(0)).toBeCloseTo(0.097, 3);
  });

  it('matches the IGP aerosol optical depth range 0.5–1 (≈ 6.3 to 11.6)', () => {
    const layer = layerFor('CLEAR', 'PUNJAB_PLAINS', 10);
    const L = layer.baseM + layer.falloffM;
    expect(turbidityFor(visForAod(0.5, L, 232), layer, 232)).toBeCloseTo(6.3, 1);
    expect(turbidityFor(visForAod(1, L, 232), layer, 232)).toBeCloseTo(11.6, 1);
  });

  it('gives J&K CLEAR at 40 km a mountain-clear sky, clamped to [1.7, 20]', () => {
    const t = turbidityFor(40_000, layerFor('CLEAR', 'JK_MOUNTAIN', 1), 2431);
    expect(t).toBeGreaterThanOrEqual(1.7);
    expect(t).toBeLessThanOrEqual(2.6);
    expect(turbidityFor(50, layerFor('FOG', 'PUNJAB_PLAINS', 1), 232)).toBe(20);
    expect(turbidityFor(1e9, layerFor('CLEAR', 'PUNJAB_PLAINS', 1), 232)).toBe(1.7);
  });

  it('makes S15 (20 km, October) as clear as its own data says (≈ 3.5)', () => {
    const t = turbidityFor(20_000, layerFor('CLEAR', 'PUNJAB_PLAINS', 10), 232);
    expect(t).toBeGreaterThan(3.2);
    expect(t).toBeLessThan(3.8);
  });
});

describe('presetFor (IMD fog at 1,000 m, haze to 10 km, no DUST)', () => {
  it('reads rain first, then the visibility bands', () => {
    expect(presetFor(weather(20_000, 0.1))).toBe('RAIN');
    expect(presetFor(weather(1000))).toBe('FOG');
    expect(presetFor(weather(1001))).toBe('HAZE');
    expect(presetFor(weather(10_000))).toBe('HAZE');
    expect(presetFor(weather(10_001))).toBe('CLEAR');
  });
  it('draws every generator preset as intended (DUST until a desert map exists: HAZE)', () => {
    // Visibility (and rain) each preset writes, read from the generator itself.
    const src = readFileSync(
      new URL('../../api/app/services/generator/environment.py', import.meta.url),
      'utf8',
    );
    const body = src.slice(src.indexOf('def weather_for'));
    const vis = (preset: string) => {
      const m = new RegExp(`preset == "${preset}":[\\s\\S]*?"visibilityM": (\\d+)`).exec(body);
      if (!m) throw new Error(`no visibility for ${preset} in environment.py`);
      return Number(m[1]);
    };
    expect(vis('CLEAR')).toBe(20_000);
    expect(vis('HAZE')).toBe(6000);
    expect(vis('FOG')).toBe(800);
    expect(vis('RAIN')).toBe(5000);
    expect(vis('DUST')).toBe(2000);
    expect(presetFor(weather(vis('CLEAR')))).toBe('CLEAR');
    expect(presetFor(weather(vis('HAZE')))).toBe('HAZE');
    expect(presetFor(weather(vis('RAIN'), 4))).toBe('RAIN');
    expect(presetFor(weather(vis('FOG')))).toBe('FOG');
    expect(presetFor(weather(vis('DUST')))).toBe('HAZE');
  });
  it('never picks DUST', () => {
    for (let v = 50; v <= 50_000; v += 250) expect(presetFor(weather(v))).not.toBe('DUST');
  });
});

describe('layerFor', () => {
  it('follows the season on the plains', () => {
    expect(layerFor('CLEAR', 'PUNJAB_PLAINS', 1)).toEqual({ baseM: 150, falloffM: 400 });
    expect(layerFor('HAZE', 'PUNJAB_PLAINS', 12)).toEqual({ baseM: 150, falloffM: 400 });
    expect(layerFor('CLEAR', 'PUNJAB_PLAINS', 4)).toEqual({ baseM: 600, falloffM: 1200 });
    expect(layerFor('CLEAR', 'PUNJAB_PLAINS', 8)).toEqual({ baseM: 400, falloffM: 900 });
  });
  it('puts URBAN lower (× 0.8) and keeps fog shallow in every season', () => {
    const u = layerFor('CLEAR', 'URBAN_GENERIC', 4);
    expect(u.baseM).toBeCloseTo(480);
    expect(u.falloffM).toBeCloseTo(960);
    for (const m of [1, 4, 8])
      expect(layerFor('FOG', 'URBAN_GENERIC', m)).toEqual({ baseM: 50, falloffM: 100 });
  });
  it('keeps J&K the same all year, and maps PROCEDURAL_HILLS to the plains', () => {
    for (const m of [1, 4, 8, 11]) {
      expect(layerFor('CLEAR', 'JK_MOUNTAIN', m)).toEqual({ baseM: 0, falloffM: 300 });
    }
    expect(regionFor('PROCEDURAL_HILLS')).toBe('PUNJAB_PLAINS');
    expect(regionFor('JK_MOUNTAIN')).toBe('JK_MOUNTAIN');
  });
});

describe('atmosphereLook per view', () => {
  it('draws the true visibility in the EO view, a readable floor on the map', () => {
    const eo = atmosphereLook(env(6000), 'eo', PUNJAB);
    const tac = atmosphereLook(env(6000), 'tactical', PUNJAB, [0.55, 0.97]);
    expect(eo.beta).toBeCloseTo(KOSCHMIEDER / 6000);
    expect(tac.beta).toBeCloseTo(KOSCHMIEDER / TACTICAL_MIN_VIS_M);
    expect(atmosphereLook(env(20_000), 'tactical', PUNJAB).beta).toBeCloseTo(KOSCHMIEDER / 50_000);
  });
  it('gives the contact floor to the EO view only, the edge fade to the map only', () => {
    const eo = atmosphereLook(env(6000), 'eo', PUNJAB, [0.55, 0.97]);
    const tac = atmosphereLook(env(6000), 'tactical', PUNJAB, [0.55, 0.97]);
    expect(eo.contactFloor).toBe(CONTACT_FLOOR);
    expect(tac.contactFloor).toBe(0);
    expect(eo.edge).toEqual([0, 0]);
    expect(tac.edge[0]).toBeCloseTo(7000 * 0.55);
  });
  it('puts the even layer on the map floor and dims the map sky (decision 167)', () => {
    const eo = atmosphereLook(env(20_000, '2026-01-10'), 'eo', PUNJAB);
    const tac = atmosphereLook(env(20_000, '2026-01-10'), 'tactical', PUNJAB);
    expect(eo.topY).toBe(-5 + 150);
    expect(tac.horizon.r).toBeLessThan(eo.horizon.r);
    expect(atmosphereLook(env(20_000, '2026-01-10', -30), 'eo', PUNJAB).glow).toBe(0);
  });
});
