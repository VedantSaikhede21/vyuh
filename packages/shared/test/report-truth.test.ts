import { describe, expect, it } from 'vitest';
import { SimEvent, activityOf, altitudeBandOf } from '../src/index.ts';

describe('report truth helpers (decision 104)', () => {
  it('bands altitude at 50 m and 150 m AGL', () => {
    expect([0, 49.9, 50, 150, 150.1].map(altitudeBandOf)).toEqual([
      'LOW',
      'LOW',
      'MEDIUM',
      'MEDIUM',
      'HIGH',
    ]);
  });

  it('derives activity from velocity relative to the nearest asset', () => {
    const toAsset = { x: 0, z: -1000 }; // asset due south
    expect(activityOf(0.5, 0, toAsset)).toBe('HOVERING');
    expect(activityOf(0, -10, toAsset)).toBe('APPROACHING');
    expect(activityOf(0, 10, toAsset)).toBe('DEPARTING');
    expect(activityOf(10, 0, toAsset)).toBe('LOITERING'); // crossing
    expect(activityOf(10, -2, toAsset)).toBe('LOITERING'); // radial share 0.2 < 0.3
    expect(activityOf(10, -4, toAsset)).toBe('APPROACHING'); // 0.37
    expect(activityOf(10, 0, null)).toBe('LOITERING');
  });

  it('REPORT_TRUTH carries no top-level track or contact id', () => {
    const ev = {
      seq: 41,
      tMs: 30000,
      type: 'REPORT_TRUTH',
      payload: {
        reportSeq: 40,
        contacts: [
          {
            contactId: 'c01',
            x: 10,
            z: 2000,
            aglM: 45,
            headingDeg: 180,
            speedMps: 12,
            activity: 'APPROACHING',
          },
        ],
      },
    };
    expect(SimEvent.safeParse(ev).success).toBe(true);
    expect(SimEvent.parse({ ...ev, trackId: 'T001' })).not.toHaveProperty('trackId');
  });
});
