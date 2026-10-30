import { describe, expect, it } from 'vitest';
import {
  ALL_ACTIONS,
  moreActions,
  nearestAsset,
  stageActions,
  threatOrder,
} from '@/lib/hud/stage-actions';

const base = {
  status: 'ACTIVE' as const,
  markedDetected: true,
  classifiedAs: 'SMALL_QUAD' as never,
  affiliation: 'UNKNOWN' as const,
};
const asset = { x: 0, z: 0, name: 'Post Alpha' };
const moving = (over: object) => ({
  id: 'T1',
  status: 'ACTIVE' as const,
  rangeM: 1000,
  x: 0,
  z: 1000,
  headingDeg: 180,
  speedMps: 20,
  ...over,
});

describe('stage actions (player plan §6.2)', () => {
  it('follows the kill chain', () => {
    expect(stageActions(null)).toEqual([]);
    expect(stageActions({ ...base, markedDetected: false })[0]).toBe('MARK');
    expect(stageActions({ ...base, classifiedAs: null })[0]).toBe('CLASSIFY');
    expect(stageActions(base)[0]).toBe('HOSTILE');
    expect(stageActions({ ...base, affiliation: 'HOSTILE' }).slice(0, 3)).toEqual([
      'JAM',
      'SPOOF',
      'INTERCEPT',
    ]);
    expect(stageActions({ ...base, affiliation: 'FRIENDLY' })[0]).toBe('MONITOR');
    expect(stageActions({ ...base, status: 'LOST' })).toEqual(['REPORT']);
  });

  it('never loses an action: row plus More is always all of them', () => {
    for (const t of [
      null,
      base,
      { ...base, markedDetected: false },
      { ...base, affiliation: 'HOSTILE' as const },
      { ...base, status: 'LOST' as const },
    ]) {
      expect([...stageActions(t), ...moreActions(t)].sort()).toEqual([...ALL_ACTIONS].sort());
    }
  });
});

describe('time to asset and threat order', () => {
  it('gives a time only when closing', () => {
    expect(nearestAsset(moving({}), [asset])?.etaS).toBeCloseTo(50);
    expect(nearestAsset(moving({ headingDeg: 0 }), [asset])?.etaS).toBeNull();
    expect(nearestAsset(moving({ speedMps: null }), [asset])?.etaS).toBeNull();
    expect(nearestAsset(moving({}), [])).toBeNull();
  });

  it('puts closing tracks first by time, then others by range, lost last', () => {
    const order = threatOrder(
      [
        moving({ id: 'OUT', headingDeg: 0, rangeM: 300, z: 300 }),
        moving({ id: 'LOST', status: 'LOST', rangeM: 10 }),
        moving({ id: 'SLOW', speedMps: 5 }),
        moving({ id: 'FAST', speedMps: 40 }),
      ],
      [asset],
    );
    expect(order.map((t) => t.id)).toEqual(['FAST', 'SLOW', 'OUT', 'LOST']);
  });
});
