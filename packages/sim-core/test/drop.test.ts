import type { ContactSpec, EoIrSensor, Scenario, SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  TICK_MS,
  TICK_S,
  commandFromEvent,
  createContactState,
  createSim,
  horizontalRange,
  stepContact,
  type ContactStepContext,
  type Sim,
} from '../src/index.ts';
import { flatTerrain, testScenario } from './fixtures.ts';

// DROP and RTH waypoint actions (SIM_VERSION 3) and the observed-release rule:
// CONTACT_DROPPED carries a trackId only when the EO tracker was in TRACK on it.

const EO: EoIrSensor = {
  id: 'eo1',
  kind: 'EO_IR',
  x: 0,
  y: 8,
  z: 0,
  fovDegMin: 1.5,
  fovDegMax: 30,
  resolution: [640, 360],
};

/** Smuggler: in from 2.5 km north, hover 15 s at 600 m with DROP, then RTH. */
function smuggler(id = 'c01', holdS = 15): ContactSpec {
  return {
    id,
    class: 'QUAD_HEAVY',
    isThreat: true,
    affiliation: 'HOSTILE',
    controlLink: 'RF_MANUAL',
    behaviour: 'SMUGGLING_DROP',
    spawnTMs: 0,
    path: [
      { x: 0, y: 40, z: 2500, speedMps: 12 },
      { x: 0, y: 30, z: 600, speedMps: 12, action: 'DROP', ...(holdS ? { holdS } : {}) },
      { x: 300, y: 40, z: 900, speedMps: 12, action: 'RTH' },
      { x: 2000, y: 40, z: 2000, speedMps: 12 },
    ],
    emissions: { rfActive: true, rfBand: '2.4GHz' },
  };
}

const ctxAt = (tMs: number): ContactStepContext => ({
  terrain: flatTerrain,
  assets: [{ id: 'a1', name: 'Post', x: 0, z: 0, radiusM: 60 }],
  tMs,
  dtS: TICK_S,
});

function flyAll(spec: ContactSpec, maxMs = 600_000) {
  const c = createContactState(spec);
  const events: { tMs: number; type: string }[] = [];
  let dropAt: { x: number; z: number } | null = null;
  for (let t = 0; t < maxMs && c.status !== 'DESPAWNED'; t += TICK_MS) {
    for (const e of stepContact(c, spec, ctxAt(t))) {
      events.push({ tMs: t, type: e.type });
      if (e.type === 'CONTACT_DROPPED') dropAt = { x: e.payload.x, z: e.payload.z };
    }
  }
  return { c, events, dropAt };
}

describe('DROP waypoint action', () => {
  it('releases once when the hold ends, then the RTH waypoint sends it home', () => {
    const { c, events, dropAt } = flyAll(smuggler());
    expect(events.map((e) => e.type)).toEqual([
      'CONTACT_SPAWNED',
      'CONTACT_DROPPED',
      'CONTACT_DESPAWNED',
    ]);
    expect(c.dropped).toBe(true);
    expect(
      horizontalRange({ x: dropAt!.x, y: 0, z: dropAt!.z }, { x: 0, y: 0, z: 600 }),
    ).toBeLessThan(30);
    // ~1900 m at 12 m/s ≈ 158 s to the drop point, then a 15 s hover.
    const drop = events.find((e) => e.type === 'CONTACT_DROPPED')!.tMs;
    expect(drop).toBeGreaterThan(165_000);
    expect(drop).toBeLessThan(180_000);
    // RTH: despawned at the first waypoint, never flew to the last one.
    expect(horizontalRange(c.pos, { x: 0, y: 0, z: 2500 })).toBeLessThanOrEqual(12);
  });

  it('releases on arrival when the DROP waypoint has no hold', () => {
    const held = flyAll(smuggler('c01', 15)).events.find((e) => e.type === 'CONTACT_DROPPED')!;
    const now = flyAll(smuggler('c01', 0)).events.find((e) => e.type === 'CONTACT_DROPPED')!;
    expect(held.tMs - now.tMs).toBeGreaterThanOrEqual(14_900);
  });

  it('no release after an EW defeat during the hover', () => {
    const spec = smuggler();
    const c = createContactState(spec);
    const types: string[] = [];
    for (let t = 0; t < 600_000 && c.status !== 'DESPAWNED'; t += TICK_MS) {
      if (c.holdUntilMs !== null && !c.defeated) {
        // What a successful jam does (effectors.ts): defeat, cancel the hold, go home.
        c.defeated = true;
        c.holdUntilMs = null;
        c.pendingAction = null;
        c.control = 'RTH';
      }
      types.push(...stepContact(c, spec, ctxAt(t)).map((e) => e.type));
    }
    expect(types).not.toContain('CONTACT_DROPPED');
    expect(c.dropped).toBe(false);
  });

  it('no release from a spoofed contact still flying its drifted route', () => {
    const spec = smuggler('c01', 0);
    const c = createContactState(spec);
    stepContact(c, spec, ctxAt(0));
    c.defeated = true;
    c.control = 'DRIFT';
    const types: string[] = [];
    for (let t = TICK_MS; t < 600_000 && c.status === 'ACTIVE'; t += TICK_MS) {
      types.push(...stepContact(c, spec, ctxAt(t)).map((e) => e.type));
    }
    expect(types).not.toContain('CONTACT_DROPPED');
  });
});

describe('observed payload release (CONTACT_DROPPED.trackId)', () => {
  const scenario = (): Scenario =>
    testScenario({
      sensors: [
        { id: 'rad1', kind: 'RADAR', x: 0, y: 6, z: 0, refRangeM: 3000, scanPeriodS: 2 },
        EO,
      ],
      effectors: [],
      contacts: [smuggler()],
      durationS: 300,
    });

  /** Run to the end; when `lock`, cue the camera on the first track and let it acquire. */
  function run(lock: boolean): Sim {
    const sim = createSim(scenario(), flatTerrain);
    let locked = false;
    while (sim.getState().endReason === null) {
      const st = sim.getState();
      const t = st.tracks.find((x) => x.status === 'ACTIVE');
      if (lock && t && !locked) {
        locked = true;
        sim.dispatch({
          type: 'CAMERA_SLEWED',
          trackId: t.id,
          payload: { azDeg: t.bearingDeg, elDeg: 0, zoom: 4, mode: 'DAY' },
        });
      }
      sim.tick();
    }
    return sim;
  }

  const dropOf = (sim: Sim) =>
    sim.getEvents().find((e): e is Extract<SimEvent, { type: 'CONTACT_DROPPED' }> => {
      return e.type === 'CONTACT_DROPPED';
    });

  it('carries the track id when the EO tracker holds the contact at the release', () => {
    const sim = run(true);
    const drop = dropOf(sim);
    expect(drop).toBeDefined();
    const track = sim.getState().tracks.find((t) => t.contactId === 'c01');
    expect(drop!.trackId).toBe(track!.id);
  });

  it('has no track id when nobody is watching', () => {
    const drop = dropOf(run(false));
    expect(drop).toBeDefined();
    expect(drop!.trackId).toBeUndefined();
  });

  it('replays exactly from the logged commands', () => {
    const a = run(true);
    const b = createSim(scenario(), flatTerrain);
    const cmds = a.getEvents().flatMap((e) => {
      const cmd = commandFromEvent(e);
      return cmd ? [{ tMs: e.tMs, cmd }] : [];
    });
    while (b.getState().endReason === null) {
      const next = b.getState().clock.tMs + TICK_MS;
      for (const { tMs, cmd } of cmds) if (tMs === next) b.dispatch(cmd);
      b.tick();
    }
    expect(JSON.stringify(b.getEvents())).toBe(JSON.stringify(a.getEvents()));
  });
});
