import { EO_ACQUIRE_FRAME_FRACTION } from '@vyuh/sim-core';
import { describe, expect, it } from 'vitest';
import {
  cameraVerdict,
  CUE_ERROR_P95,
  frameFovDeg,
  pickStep,
  searchFovDeg,
} from '@/lib/hud/cue-zoom';
import { ACQ_AFTER_MS } from '@/lib/hud/derive';
import { eoFovSteps } from '@/lib/sim/commands';

// Scripted cameras: 30° widest, 1.5° narrowest → 30, 14.2, 6.7, 3.2, 1.5.
const STEPS = eoFovSteps(30, 1.5);

describe('cue search field of view', () => {
  it('covers the p95 radar pointing error inside the tracker window, both axes', () => {
    for (const range of [300, 800, 1500, 2500, 4000]) {
      const e = CUE_ERROR_P95.find((b) => range < b.maxRangeM)!;
      const h = searchFovDeg(range);
      const v = (h * 9) / 16;
      expect((h / 2) * EO_ACQUIRE_FRAME_FRACTION).toBeGreaterThanOrEqual(e.azDeg - 1e-9);
      expect((v / 2) * EO_ACQUIRE_FRAME_FRACTION).toBeGreaterThanOrEqual(e.elDeg - 1e-9);
    }
  });

  it('picks the widest step close in and a mid step far out', () => {
    expect(pickStep(STEPS, searchFovDeg(300))).toBe(30);
    expect(pickStep(STEPS, searchFovDeg(800))).toBe(STEPS[1]);
    expect(pickStep(STEPS, searchFovDeg(2500))).toBe(STEPS[2]);
  });

  it('is never narrower than needed when a step is wide enough', () => {
    for (const range of [800, 1500, 2500, 4000]) {
      expect(pickStep(STEPS, searchFovDeg(range))).toBeGreaterThanOrEqual(searchFovDeg(range));
    }
  });
});

describe('cue framing field of view', () => {
  it('zooms all the way in beyond a few hundred metres', () => {
    expect(pickStep(STEPS, frameFovDeg(1000))).toBeCloseTo(1.5, 5);
    expect(pickStep(STEPS, frameFovDeg(400))).toBeCloseTo(1.5, 5);
  });

  it('keeps a 2 m object within 40 % of the width close in', () => {
    const range = 100;
    const h = pickStep(STEPS, frameFovDeg(range));
    const objectDeg = (2 * Math.atan(1 / range) * 180) / Math.PI;
    expect(objectDeg / h).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it('falls back to the widest step when nothing is wide enough', () => {
    expect(pickStep(STEPS, 90)).toBe(30);
  });
});

describe('camera verdict', () => {
  it('says nothing under manual pointing', () => {
    expect(cameraVerdict('MANUAL', null, null, null, 0)).toBeNull();
  });

  it('searches, then reports no lock after the acquisition time', () => {
    expect(cameraVerdict('CUE', null, 'T004', 1000, 1000 + ACQ_AFTER_MS - 1)).toEqual({
      tone: 'info',
      text: 'Searching for T004',
    });
    expect(cameraVerdict('CUE', null, 'T004', 1000, 1000 + ACQ_AFTER_MS)?.tone).toBe('warn');
  });

  it('maps each tracker level to one plain sentence', () => {
    expect(cameraVerdict('TRACK', 'IDENTIFY', 'T1', null, 0)).toEqual({
      tone: 'ok',
      text: 'Clear enough to identify',
    });
    expect(cameraVerdict('TRACK', 'RECOGNISE', 'T1', null, 0)?.tone).toBe('info');
    expect(cameraVerdict('TRACK', 'DETECT', 'T1', null, 0)?.text).toMatch(/Too far to identify/);
    expect(cameraVerdict('TRACK', null, 'T1', null, 0)?.text).toMatch(/faint/);
  });
});
