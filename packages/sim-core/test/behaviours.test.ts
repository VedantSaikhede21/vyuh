import type { ContactSpec, Scenario, SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  BIRD_MIN_AGL_M,
  DRIFT_MAX_M,
  LINK_LOSS_HOVER_MS,
  TICK_MS,
  TICK_S,
  createContactState,
  createSim,
  horizontalRange,
  startDrift,
  stepContact,
  type ContactState,
  type ContactStepContext,
} from '../src/index.ts';
import { attackQuad, flatTerrain, testScenario } from './fixtures.ts';

// Link-loss reactions (decision 54) and bird-flock boids (SPEC §5).

function bird(id: string, x: number, z: number, groupId = 'g1'): ContactSpec {
  return {
    id,
    class: id === 'b01' ? 'BIRD_LARGE' : 'BIRD_SMALL',
    isThreat: false,
    affiliation: 'NEUTRAL',
    controlLink: 'NONE',
    behaviour: 'BIRD_FLOCK',
    groupId,
    spawnTMs: 0,
    path:
      id === 'b01'
        ? [
            { x, y: 60, z, speedMps: 12 },
            { x: x + 3000, y: 40, z, speedMps: 12 },
          ]
        : [{ x, y: 55, z, speedMps: 12 }],
    emissions: { rfActive: false },
  };
}

const flock = (groupId = 'g1') =>
  ['b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08'].map((id, i) =>
    bird(id, -1500 + (i % 3) * 15, 2000 + Math.floor(i / 3) * 15, groupId),
  );

const flockScenario = (groupId = 'g1'): Scenario =>
  testScenario({ contacts: [attackQuad('c01', [300, 2500], 5000), ...flock(groupId)] });

function run(scenario: Scenario, each?: (contacts: readonly ContactState[]) => void) {
  const sim = createSim(scenario, flatTerrain);
  while (sim.getState().endReason === null) {
    sim.tick();
    each?.(sim.getState().contacts);
  }
  return sim;
}

describe('bird flock boids', () => {
  it('is deterministic', () => {
    const trace = () => {
      const out: string[] = [];
      run(flockScenario(), (cs) => out.push(JSON.stringify(cs)));
      return out.join('|');
    };
    expect(trace()).toBe(trace());
  });

  it('stays cohesive around the leader, and no bird goes below the minimum AGL', () => {
    let maxDist = 0;
    let minAgl = Infinity;
    let moved = false;
    run(flockScenario(), (cs) => {
      const leader = cs.find((c) => c.id === 'b01')!;
      for (const c of cs) {
        if (!c.id.startsWith('b') || c.id === 'b01' || c.status !== 'ACTIVE') continue;
        maxDist = Math.max(maxDist, horizontalRange(c.pos, leader.pos));
        minAgl = Math.min(minAgl, c.agl);
        if (c.speedMps > 5) moved = true;
      }
    });
    expect(moved).toBe(true);
    expect(maxDist).toBeLessThan(150);
    expect(minAgl).toBeGreaterThanOrEqual(BIRD_MIN_AGL_M);
  });

  it('creates radar tracks (SPEC §6.1: intentional false contacts)', () => {
    const ev = run(flockScenario()).getEvents();
    const birdTracks = ev.filter(
      (e) => e.type === 'SENSOR_TRACK_CREATED' && e.contactId?.startsWith('b'),
    );
    expect(birdTracks.length).toBeGreaterThanOrEqual(3);
  });

  it("the flock's own stream does not shift other random sequences", () => {
    const quadEvents = (groupId: string) =>
      run(flockScenario(groupId))
        .getEvents()
        .filter((e: SimEvent) => 'contactId' in e && e.contactId === 'c01');
    expect(JSON.stringify(quadEvents('g2'))).toBe(JSON.stringify(quadEvents('g1')));
  });
});

describe('link-loss reactions', () => {
  const ctxAt = (tMs: number): ContactStepContext => ({
    terrain: flatTerrain,
    assets: [{ id: 'a1', name: 'Post', x: 0, z: 0, radiusM: 60 }],
    tMs,
    dtS: TICK_S,
  });

  /** Fly a quad from 2500 m north toward the asset for `ms`, then return it. */
  function flown(spec: ContactSpec, ms: number): { c: ContactState; t: number } {
    const c = createContactState(spec);
    let t = 0;
    for (; t <= ms; t += TICK_MS) stepContact(c, spec, ctxAt(t));
    return { c, t };
  }

  function finish(c: ContactState, spec: ContactSpec, from: number) {
    const events: string[] = [];
    let t = from;
    for (; t < from + 400_000 && c.status === 'ACTIVE'; t += TICK_MS) {
      events.push(...stepContact(c, spec, ctxAt(t)).map((e) => e.type));
    }
    return { events, t };
  }

  const spec = attackQuad('c01', [0, 2500]);

  it('HOVER_LAND hovers 5 s, then descends and despawns on the ground', () => {
    const { c, t } = flown(spec, 20_000);
    const at = { ...c.pos };
    c.control = 'HOVER_LAND';
    c.defeated = true;
    const { events, t: end } = finish(c, spec, t);
    expect(events).toEqual(['CONTACT_DESPAWNED']);
    expect(horizontalRange(c.pos, at)).toBe(0);
    expect(end - t).toBeGreaterThan(LINK_LOSS_HOVER_MS + 15_000); // 40 m at ≤ 2 m/s
  });

  it('RTH flies back to the first waypoint and despawns there', () => {
    const { c, t } = flown(spec, 60_000);
    c.control = 'RTH';
    c.defeated = true;
    const { events } = finish(c, spec, t);
    expect(events).toEqual(['CONTACT_DESPAWNED']);
    expect(horizontalRange(c.pos, { x: 0, y: 0, z: 2500 })).toBeLessThanOrEqual(10);
  });

  it('DRIFT shifts the route ~400 m sideways so the dive misses the asset', () => {
    const { c, t } = flown(spec, 20_000);
    c.control = 'DRIFT';
    c.defeated = true;
    startDrift(c, spec, t);
    const { events } = finish(c, spec, t);
    expect(events).toEqual(['CONTACT_DESPAWNED']);
    const miss = horizontalRange(c.pos, { x: 0, y: 0, z: 0 });
    expect(miss).toBeGreaterThan(0.8 * DRIFT_MAX_M);
    expect(miss).toBeLessThan(1.2 * DRIFT_MAX_M);
  });

  it('a defeated contact never reaches an asset, even on its path', () => {
    const c = createContactState(spec);
    stepContact(c, spec, ctxAt(0));
    c.defeated = true;
    const { events } = finish(c, spec, TICK_MS);
    expect(events).not.toContain('CONTACT_REACHED_ASSET');
    expect(events).toEqual(['CONTACT_DESPAWNED']);
  });
});
