import type { SimEnvironment } from '@vyuh/sim-core';
import { describe, expect, it } from 'vitest';
import { environmentLook } from '../lib/sim/environment-look';

const env = (elDeg: number, visibilityM = 20_000, azDeg = 180): SimEnvironment => ({
  date: '2026-12-21',
  time: '12:00',
  sun: { azDeg, elDeg },
  isNight: elDeg < -6,
  weather: { visibilityM, rainMmph: 0, windMps: 0, windDirDeg: 0, cloudPct: 0 },
});

describe('environmentLook', () => {
  it('lights the day from the sun direction (south sun → +z in Three.js)', () => {
    const look = environmentLook(env(36), 'tactical');
    expect(look.showSky).toBe(true);
    expect(look.sunIntensity).toBeGreaterThan(1.5);
    expect(look.sunDir[1]).toBeCloseTo(Math.sin((36 * Math.PI) / 180));
    expect(look.sunDir[2]).toBeGreaterThan(0); // south = −north = +z
  });

  it('goes dark at night, keeping a light floor only for the tactical map', () => {
    const eo = environmentLook(env(-30), 'eo');
    const tac = environmentLook(env(-30), 'tactical');
    expect(eo.showSky).toBe(false);
    expect(eo.sunIntensity).toBe(0);
    expect(eo.hemiIntensity).toBeLessThan(0.1);
    expect(tac.hemiIntensity).toBeGreaterThanOrEqual(0.7);
    expect(tac.sunIntensity).toBeGreaterThanOrEqual(1.2); // overhead map light, not a moon
  });

  it('fogs the EO view at the true visibility and the tactical map more gently', () => {
    const eo = environmentLook(env(30, 2000), 'eo');
    const tac = environmentLook(env(30, 2000), 'tactical');
    expect(eo.fogFar).toBe(2000);
    expect(tac.fogFar).toBeGreaterThanOrEqual(9000);
    expect(environmentLook(env(30, 2000), 'eo').turbidity).toBeGreaterThan(
      environmentLook(env(30, 20_000), 'eo').turbidity,
    );
  });
});
