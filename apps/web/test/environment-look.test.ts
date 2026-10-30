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
    expect(look.sunIntensity).toBeGreaterThan(1.5);
    expect(look.sunDir[1]).toBeCloseTo(Math.sin((36 * Math.PI) / 180));
    expect(look.sunDir[2]).toBeGreaterThan(0); // south = −north = +z
  });

  it('goes dark at night, keeping a light floor only for the tactical map', () => {
    const eo = environmentLook(env(-30), 'eo');
    const tac = environmentLook(env(-30), 'tactical');
    expect(eo.showStars).toBe(true);
    expect(eo.sunIntensity).toBe(0);
    expect(eo.hemiIntensity).toBeLessThan(0.1);
    expect(tac.hemiIntensity).toBeGreaterThanOrEqual(0.7);
    expect(tac.sunIntensity).toBeGreaterThanOrEqual(1.2); // overhead map light, not a moon
  });

  it('gives the tactical map a dimmed sky, and stars only at night (decision 167)', () => {
    const tac = environmentLook(env(36), 'tactical');
    const eo = environmentLook(env(36), 'eo');
    expect(tac.showStars).toBe(false);
    expect(environmentLook(env(-30), 'tactical').showStars).toBe(true);
    expect(tac.skyHorizon.r).toBeLessThan(eo.skyHorizon.r);
  });

  it('bakes shadows only while the real sun lights the view', () => {
    expect(environmentLook(env(36), 'tactical').shadowStrength).toBeGreaterThan(0);
    expect(environmentLook(env(-30), 'tactical').shadowStrength).toBe(0);
    expect(environmentLook(env(-30), 'eo').shadowStrength).toBe(0);
  });

  it('fogs the EO view at the true visibility and the tactical map more gently', () => {
    const eo = environmentLook(env(30, 2000), 'eo');
    const tac = environmentLook(env(30, 2000), 'tactical');
    expect(eo.fogFar).toBe(2000);
    expect(tac.fogFar).toBeGreaterThanOrEqual(9000);
  });

  it('gives the EO day view a grey-blue sky, not white (audit P1-3)', () => {
    const { r, g, b } = environmentLook(env(36), 'eo').background;
    expect(b).toBeGreaterThan(r);
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeLessThan(0.6);
  });
});
