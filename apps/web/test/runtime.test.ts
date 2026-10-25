import { readFileSync } from 'node:fs';
import { Scenario } from '@vyuh/shared';
import { TICK_MS, createProceduralTerrain, heightNoiseSigmaM } from '@vyuh/sim-core';
import { describe, expect, it } from 'vitest';
import { MAX_FRAME_MS, SimRuntime } from '../lib/sim/runtime';
import { snapshot } from '../lib/sim/store';

const S01 = Scenario.parse(
  JSON.parse(
    readFileSync(new URL('../../api/app/seed/scenarios/S01.json', import.meta.url), 'utf8'),
  ),
);
const terrain = createProceduralTerrain({ resolution: 65 });

describe('SimRuntime', () => {
  it('runs a fixed 50 ms tick from variable frame times', () => {
    const rt = new SimRuntime(S01, terrain, 'PRACTICE');
    let ticks = 0;
    for (const frame of [16.7, 16.7, 16.6, 33, 7]) ticks += rt.advance(frame);
    expect(ticks).toBe(1); // 90 ms → one tick, 40 ms carried
    expect(rt.sim.getState().clock.tMs).toBe(TICK_MS);
    expect(rt.alpha).toBeCloseTo(40 / 50);
  });

  it('treats long stalls as at most MAX_FRAME_MS of sim time', () => {
    const rt = new SimRuntime(S01, terrain, 'ASSESSMENT');
    expect(rt.advance(10_000)).toBe(MAX_FRAME_MS / TICK_MS);
  });

  it('interpolates contact positions between ticks', () => {
    const rt = new SimRuntime(S01, terrain, 'PRACTICE');
    while (rt.sim.getState().clock.tMs < 20_000) rt.advance(50);
    rt.advance(25); // half a tick
    const c = rt.sim.getState().contacts[0]!;
    const prev = rt.prevPositions.get(c.id)!;
    const out = rt.contactPosition(c.id, { x: 0, y: 0, z: 0 })!;
    expect(rt.alpha).toBeCloseTo(0.5);
    expect(out.z).toBeCloseTo((prev.z + c.pos.z) / 2);
    expect(prev.z).not.toBe(c.pos.z); // it is moving
  });

  it('pauses only in practice mode', () => {
    const practice = new SimRuntime(S01, terrain, 'PRACTICE');
    practice.setPaused(true);
    expect(practice.advance(200)).toBe(0);
    const assessment = new SimRuntime(S01, terrain, 'ASSESSMENT');
    assessment.setPaused(true);
    expect(assessment.advance(200)).toBe(4);
  });

  it('holds the practice clock while an overlay is open, never the assessment clock', () => {
    const practice = new SimRuntime(S01, terrain, 'PRACTICE');
    practice.setOverlayHold(true);
    expect(practice.advance(200)).toBe(0);
    expect(practice.paused).toBe(false);
    practice.setOverlayHold(false);
    expect(practice.advance(200)).toBe(4);
    const assessment = new SimRuntime(S01, terrain, 'ASSESSMENT');
    assessment.setOverlayHold(true);
    expect(assessment.advance(200)).toBe(4);
  });

  it('publishes a HUD snapshot without ground-truth contact ids', () => {
    const rt = new SimRuntime(S01, terrain, 'PRACTICE');
    while (rt.sim.getState().tracks.length === 0) rt.advance(50);
    const hud = snapshot(rt);
    expect(hud.tracks[0]!.id).toBe('T001');
    expect(JSON.stringify(hud)).not.toContain('c01');
    // S01 cruises between 50 m and 45 m AGL before the dive. The HUD shows the
    // radar's noisy height estimate (decision 108): within 3 σ of that, never the truth.
    const t = hud.tracks[0]!;
    const sigma = heightNoiseSigmaM(t.rangeM);
    expect(t.altitudeAglM).toBeGreaterThanOrEqual(Math.max(45 - 3 * sigma, 0));
    expect(t.altitudeAglM).toBeLessThanOrEqual(50 + 3 * sigma);
    expect(t.altitudeAglM).not.toBe(rt.sim.getState().contacts[0]!.agl);
  });
});
