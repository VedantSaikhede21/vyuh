import type { Asset, ContactSpec } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  TICK_MS,
  TICK_S,
  advanceClock,
  angleDiffDeg,
  appendEvent,
  bearingDeg,
  ceilToTick,
  createClock,
  createContactState,
  createEventLog,
  createHeightmap,
  createProceduralTerrain,
  fromThree,
  sampleHeight,
  stepContact,
  toThree,
  type ContactState,
  type EventDraft,
  type Heightmap,
} from '../src/index.ts';

describe('clock', () => {
  it('advances in fixed 50 ms ticks with integer time', () => {
    let c = createClock();
    for (let i = 0; i < 1000; i++) c = advanceClock(c);
    expect(TICK_MS).toBe(50);
    expect(c).toEqual({ tick: 1000, tMs: 50_000 });
    expect(Number.isInteger(c.tMs)).toBe(true);
  });

  it('snaps times up to the next tick boundary', () => {
    expect(ceilToTick(0)).toBe(0);
    expect(ceilToTick(1)).toBe(50);
    expect(ceilToTick(50)).toBe(50);
    expect(ceilToTick(20_010)).toBe(20_050);
  });
});

describe('coords', () => {
  it('flips north to Three.js -z and back', () => {
    expect(toThree({ x: 10, y: 5, z: 300 })).toEqual({ x: 10, y: 5, z: -300 });
    expect(fromThree(toThree({ x: -4, y: 1, z: 7 }))).toEqual({ x: -4, y: 1, z: 7 });
  });

  it('computes compass bearings (0 = north, clockwise)', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(bearingDeg(o, { x: 0, y: 0, z: 100 })).toBeCloseTo(0);
    expect(bearingDeg(o, { x: 100, y: 0, z: 0 })).toBeCloseTo(90);
    expect(bearingDeg(o, { x: 0, y: 0, z: -100 })).toBeCloseTo(180);
    expect(bearingDeg(o, { x: -100, y: 0, z: 0 })).toBeCloseTo(270);
  });

  it('takes the short way round for angle differences', () => {
    expect(angleDiffDeg(10, 350)).toBeCloseTo(20);
    expect(angleDiffDeg(350, 10)).toBeCloseTo(-20);
    expect(angleDiffDeg(180, 0)).toBeCloseTo(180);
  });
});

describe('terrain', () => {
  it('samples grid points exactly and interpolates between them', () => {
    // 3×3 grid over 200 m: samples at -100, 0, 100.
    const map = createHeightmap(200, 3, Float32Array.from([0, 0, 0, 0, 10, 20, 0, 0, 0]));
    expect(sampleHeight(map, 0, 0)).toBe(10);
    expect(sampleHeight(map, 100, 0)).toBe(20);
    expect(sampleHeight(map, 50, 0)).toBeCloseTo(15);
    expect(sampleHeight(map, 0, 50)).toBeCloseTo(5);
    expect(sampleHeight(map, 10_000, 0)).toBe(20); // clamped at edge
  });

  it('rejects malformed heightmaps', () => {
    expect(() => createHeightmap(100, 3, new Float32Array(8))).toThrow(RangeError);
  });

  it('builds the same gentle hills for the same seed', () => {
    const a = createProceduralTerrain({ seed: 7, resolution: 65 });
    const b = createProceduralTerrain({ seed: 7, resolution: 65 });
    const c = createProceduralTerrain({ seed: 8, resolution: 65 });
    expect(a.heights).toEqual(b.heights);
    expect(a.heights).not.toEqual(c.heights);
    const max = Math.max(...a.heights);
    expect(Math.min(...a.heights)).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(60);
    expect(max).toBeGreaterThan(10); // not flat
    expect(sampleHeight(a, 0, 0)).toBeCloseTo(0, 5); // defended position is level
  });
});

describe('event log', () => {
  it('assigns a monotonic seq', () => {
    const log = createEventLog();
    appendEvent(log, { tMs: 0, type: 'CONTACT_SPAWNED', contactId: 'c01', payload: {} });
    const e = appendEvent(log, { tMs: 50, type: 'MARKED_DETECTED', trackId: 'T001', payload: {} });
    expect(e.seq).toBe(1);
    expect(log.events.map((x) => x.seq)).toEqual([0, 1]);
  });
});

// ---- Kinematics ------------------------------------------------------------

const flat: Heightmap = createHeightmap(20_000, 2, new Float32Array(4));
const asset: Asset = { id: 'a1', name: 'Post', x: 0, z: 0, radiusM: 60 };

function quad(path: ContactSpec['path'], extra: Partial<ContactSpec> = {}): ContactSpec {
  return {
    id: 'c01',
    class: 'QUAD_SMALL',
    isThreat: true,
    affiliation: 'HOSTILE',
    controlLink: 'RF_MANUAL',
    behaviour: 'ATTACK_RUN',
    spawnTMs: 1000,
    path,
    emissions: { rfActive: true },
    ...extra,
  };
}

function run(
  spec: ContactSpec,
  untilMs: number,
  terrain: Heightmap = flat,
  onTick?: (c: ContactState, prevHeading: number) => void,
): { c: ContactState; events: EventDraft[] } {
  const c = createContactState(spec);
  const events: EventDraft[] = [];
  for (let t = TICK_MS; t <= untilMs; t += TICK_MS) {
    const prev = c.headingDeg;
    const wasActive = c.status === 'ACTIVE';
    events.push(...stepContact(c, spec, { terrain, assets: [asset], tMs: t, dtS: TICK_S }));
    if (wasActive && onTick) onTick(c, prev);
  }
  return { c, events };
}

describe('contact kinematics', () => {
  it('spawns at the first waypoint at spawnTMs', () => {
    const spec = quad([
      { x: 0, y: 40, z: 3000, speedMps: 15 },
      { x: 0, y: 40, z: 0, speedMps: 15 },
    ]);
    const { c, events } = run(spec, 1000);
    expect(events).toEqual([{ tMs: 1000, type: 'CONTACT_SPAWNED', contactId: 'c01', payload: {} }]);
    expect(c.pos).toEqual({ x: 0, y: 40, z: 3000 });
    expect(c.headingDeg).toBeCloseTo(180);
  });

  it('flies a straight leg at waypoint speed', () => {
    const spec = quad([
      { x: 0, y: 40, z: 3000, speedMps: 15 },
      { x: 0, y: 40, z: -3000, speedMps: 15 },
    ]);
    const { c } = run(spec, 1000 + 100_000);
    expect(c.pos.z).toBeCloseTo(3000 - 15 * 100, 6);
    expect(c.agl).toBe(40);
  });

  it('never exceeds the class turn rate', () => {
    const spec = quad([
      { x: 0, y: 40, z: 0, speedMps: 15 },
      { x: 500, y: 40, z: 0, speedMps: 15 },
      { x: 500, y: 40, z: -500, speedMps: 15 },
      { x: -200, y: 40, z: 300, speedMps: 15 },
    ]);
    const maxPerTick = 120 * TICK_S + 1e-9; // QUAD_SMALL 120°/s
    let maxSeen = 0;
    const { c } = run(spec, 200_000, flat, (st, prev) => {
      maxSeen = Math.max(maxSeen, Math.abs(angleDiffDeg(st.headingDeg, prev)));
    });
    expect(maxSeen).toBeLessThanOrEqual(maxPerTick);
    expect(maxSeen).toBeGreaterThan(maxPerTick * 0.9); // the corners did force max-rate turns
    expect(c.wpIndex).toBe(4); // all waypoints reached
  });

  it('holds altitude above ground over hills', () => {
    const hills = createProceduralTerrain({ seed: 3, resolution: 65 });
    const spec = quad([
      { x: -4000, y: 50, z: -4000, speedMps: 18 },
      { x: 4000, y: 50, z: 4000, speedMps: 18 },
    ]);
    run(spec, 300_000, hills, (st) => {
      expect(st.pos.y - sampleHeight(hills, st.pos.x, st.pos.z)).toBeCloseTo(50, 6);
    });
  });

  it('hovers for holdS at a waypoint', () => {
    const spec = quad([
      { x: 0, y: 40, z: 0, speedMps: 10 },
      { x: 0, y: 40, z: 100, speedMps: 10, holdS: 5 },
      { x: 0, y: 40, z: 1000, speedMps: 10 },
    ]);
    const positions: number[] = [];
    run(spec, 30_000, flat, (st) => positions.push(st.pos.z));
    // Some stretch of ≥ 5 s (100 ticks) with no movement.
    let longest = 0;
    let streak = 0;
    for (let i = 1; i < positions.length; i++) {
      streak = positions[i] === positions[i - 1] ? streak + 1 : 0;
      longest = Math.max(longest, streak);
    }
    expect(longest).toBeGreaterThanOrEqual(99);
  });

  it('ATTACK_RUN ends in a dive that reaches the asset', () => {
    const spec = quad([
      { x: 0, y: 40, z: 2000, speedMps: 16 },
      { x: 0, y: 0, z: 0, speedMps: 16, action: 'DIVE' },
    ]);
    let minAglWhileFar = Infinity;
    const { c, events } = run(spec, 200_000, flat, (st) => {
      if (Math.hypot(st.pos.x, st.pos.z) > 100) minAglWhileFar = Math.min(minAglWhileFar, st.agl);
    });
    expect(minAglWhileFar).toBe(40); // stays at cruise until the terminal dive
    expect(c.status).toBe('REACHED_ASSET');
    const reached = events.find((e) => e.type === 'CONTACT_REACHED_ASSET');
    expect(reached).toMatchObject({ contactId: 'c01', payload: { assetId: 'a1' } });
    // 2000 m at 16 m/s ≈ 125 s after spawn (plus a little for the dive geometry).
    expect(reached!.tMs).toBeGreaterThan(1000 + 124_000);
    expect(reached!.tMs).toBeLessThan(1000 + 128_000);
  });

  it('despawns at despawnTMs', () => {
    const spec = quad(
      [
        { x: 0, y: 40, z: 2000, speedMps: 16 },
        { x: 0, y: 40, z: 0, speedMps: 16 },
      ],
      { despawnTMs: 10_000 },
    );
    const { c, events } = run(spec, 20_000);
    expect(c.status).toBe('DESPAWNED');
    expect(events.at(-1)).toEqual({
      tMs: 10_000,
      type: 'CONTACT_DESPAWNED',
      contactId: 'c01',
      payload: {},
    });
  });
});
