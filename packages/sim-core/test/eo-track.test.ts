import { readFileSync } from 'node:fs';
import { Scenario, type ContactSpec, type EoIrSensor, type EoMode } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  EO_ACQUIRE_MS,
  EO_TRACK_DROP_MS,
  TICK_MS,
  commandFromEvent,
  createSim,
  createWorld,
  hasLineOfSight,
  inEoFrustum,
  type EoTrackMode,
  type Sim,
  type World,
} from '../src/index.ts';
import { flatTerrain, presetWorld, testScenario } from './fixtures.ts';

// EO video auto-track (decision 52): MANUAL / CUE / TRACK camera states.

const load = (id: string) =>
  Scenario.parse(
    JSON.parse(
      readFileSync(
        new URL(`../../../apps/api/app/seed/scenarios/${id}.json`, import.meta.url),
        'utf8',
      ),
    ),
  );

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

/** A contact crossing west → east at `z` metres north of the sensors. */
function crossing(cls: ContactSpec['class'], z: number, speedMps: number): Scenario {
  return testScenario({
    sensors: [{ id: 'rad1', kind: 'RADAR', x: 0, y: 6, z: 0, refRangeM: 3000, scanPeriodS: 2 }, EO],
    contacts: [
      {
        id: 'c01',
        class: cls,
        isThreat: true,
        affiliation: 'HOSTILE',
        controlLink: 'RF_MANUAL',
        behaviour: 'TRANSIT',
        spawnTMs: 0,
        path: [
          { x: -1500, y: 40, z, speedMps },
          { x: 1500, y: 40, z, speedMps },
        ],
        emissions: { rfActive: true, rfBand: '2.4GHz' },
      },
    ],
    durationS: 200,
  });
}

interface Step {
  readonly tMs: number;
  readonly mode: EoTrackMode;
  /** Locked contact inside the frame after the tick (null without a lock). */
  readonly inFrame: boolean | null;
}

/** Lock (re-lock after any drop to MANUAL) on the first live track and record each tick. */
function runLocked(
  sim: Sim,
  eo: EoIrSensor,
  opts: { mode?: EoMode; zoom?: number; untilMs?: number; relock?: boolean } = {},
): Step[] {
  const steps: Step[] = [];
  let lockedOnce = false;
  while (sim.getState().endReason === null) {
    const st = sim.getState();
    if (opts.untilMs !== undefined && st.clock.tMs >= opts.untilMs) break;
    const t = st.tracks.find((x) => x.status === 'ACTIVE');
    if (t && st.camera.lockTrackId === null && (opts.relock !== false || !lockedOnce)) {
      lockedOnce = true;
      sim.dispatch({
        type: 'CAMERA_SLEWED',
        trackId: t.id,
        payload: { azDeg: t.bearingDeg, elDeg: 0, zoom: opts.zoom ?? 20, mode: opts.mode ?? 'DAY' },
      });
    }
    sim.tick();
    const s = sim.getState();
    const lock = s.camera.lockTrackId;
    const contactId = lock !== null ? s.tracks.find((x) => x.id === lock)?.contactId : undefined;
    const c = s.contacts.find((x) => x.id === contactId);
    steps.push({
      tMs: s.clock.tMs,
      mode: s.camera.trackMode,
      inFrame:
        c !== undefined && c.status === 'ACTIVE'
          ? inEoFrustum(eo, s.camera, s.sensorPositions[eo.id]!, c.pos)
          : null,
    });
  }
  return steps;
}

const tickUntil = (sim: Sim, done: () => boolean, maxTicks = 4000) => {
  for (let i = 0; i < maxTicks && !done(); i++) sim.tick();
  return done();
};

describe('CUE → TRACK acquisition', () => {
  it('a radar-cued lock hands over to the EO tracker after 0.5 s centred', () => {
    const scenario = crossing('QUAD_HEAVY', 300, 12);
    const sim = createSim(scenario, flatTerrain);
    const steps = runLocked(sim, EO, { zoom: 4, untilMs: 120_000 });
    const firstCue = steps.findIndex((s) => s.mode === 'CUE');
    const firstTrack = steps.findIndex((s) => s.mode === 'TRACK');
    expect(firstCue).toBeGreaterThanOrEqual(0);
    expect(firstTrack).toBeGreaterThan(firstCue);
    // At least EO_ACQUIRE_MS of CUE (with the target in frame) before TRACK.
    expect(steps[firstTrack]!.tMs - steps[firstCue]!.tMs).toBeGreaterThanOrEqual(EO_ACQUIRE_MS);
    for (let i = firstTrack - EO_ACQUIRE_MS / TICK_MS; i < firstTrack; i++) {
      expect(steps[i]!.inFrame).toBe(true);
    }
  });

  it('never acquires what the camera cannot see (day camera at night)', () => {
    const s12 = load('S12');
    const eo = s12.sensors.find((x): x is EoIrSensor => x.kind === 'EO_IR')!;
    const steps = runLocked(createSim(s12, presetWorld(s12.terrain.preset)), eo, { mode: 'DAY' });
    expect(steps.some((s) => s.mode === 'CUE')).toBe(true);
    expect(steps.some((s) => s.mode === 'TRACK')).toBe(false);
  });
});

describe.each([
  ['S11', 'DAY'],
  ['S12', 'IR'],
  ['S01', 'DAY'],
] as const)('%s fully zoomed (%s)', (id, mode) => {
  it('keeps the target in frame on ≥ 95 % of TRACK ticks', () => {
    const scenario = load(id);
    const eo = scenario.sensors.find((x): x is EoIrSensor => x.kind === 'EO_IR')!;
    const steps = runLocked(createSim(scenario, presetWorld(scenario.terrain.preset)), eo, {
      mode,
    });
    const inTrack = steps.filter((s) => s.mode === 'TRACK' && s.inFrame !== null);
    expect(inTrack.length).toBeGreaterThan(200);
    const share = inTrack.filter((s) => s.inFrame).length / inTrack.length;
    expect(share).toBeGreaterThanOrEqual(0.95);
  });
});

describe('TRACK breaks', () => {
  /** Run to TRACK on a crossing contact; returns the sim and the lock's track id. */
  function toTrack(scenario: Scenario, world: World | typeof flatTerrain) {
    const sim = createSim(scenario, world);
    expect(tickUntil(sim, () => lockFirst(sim))).toBe(true);
    expect(tickUntil(sim, () => sim.getState().camera.trackMode === 'TRACK')).toBe(true);
    return { sim, trackId: sim.getState().camera.lockTrackId! };
  }

  /** Lock on the first live track once (helper for toTrack). */
  function lockFirst(sim: Sim): boolean {
    const t = sim.getState().tracks.find((x) => x.status === 'ACTIVE');
    if (t === undefined) return false;
    sim.dispatch({
      type: 'CAMERA_SLEWED',
      trackId: t.id,
      payload: { azDeg: t.bearingDeg, elDeg: 0, zoom: 4, mode: 'DAY' },
    });
    return true;
  }

  it('loses TRACK when a building cuts the line of sight', () => {
    // A 120 m tower between the camera and the crossing path, east of north.
    const ring: [number, number][] = [
      [180, 100],
      [260, 100],
      [260, 160],
      [180, 160],
    ];
    const world = createWorld(flatTerrain, [{ ring, heightM: 120 }]);
    const { sim } = toTrack(crossing('QUAD_HEAVY', 300, 12), world);
    const eoPos = sim.getState().sensorPositions[EO.id]!;
    expect(tickUntil(sim, () => sim.getState().camera.trackMode !== 'TRACK', 6000)).toBe(true);
    const c = sim.getState().contacts[0]!;
    expect(c.status).toBe('ACTIVE');
    expect(hasLineOfSight(world, eoPos, c.pos)).toBe(false);
    expect(sim.getState().camera.trackMode).toBe('CUE'); // radar track still live
  });

  it('loses TRACK after more than 1 s with no EO level (IR → day at night)', () => {
    const s12 = load('S12');
    const sim = createSim(s12, presetWorld(s12.terrain.preset));
    expect(
      tickUntil(sim, () => {
        const st = sim.getState();
        const t = st.tracks.find((x) => x.status === 'ACTIVE');
        if (t && st.camera.lockTrackId === null) {
          sim.dispatch({
            type: 'CAMERA_SLEWED',
            trackId: t.id,
            payload: { azDeg: t.bearingDeg, elDeg: 0, zoom: 20, mode: 'IR' },
          });
        }
        return st.camera.trackMode === 'TRACK';
      }),
    ).toBe(true);
    const cam = sim.getState().camera;
    // Same lock, day mode: the tracker keeps the contact but sees nothing at night.
    sim.dispatch({
      type: 'CAMERA_SLEWED',
      trackId: cam.lockTrackId!,
      payload: { azDeg: cam.azDeg, elDeg: cam.elDeg, zoom: cam.zoom, mode: 'DAY' },
    });
    const ticks = EO_TRACK_DROP_MS / TICK_MS;
    for (let i = 0; i <= ticks; i++) {
      sim.tick();
      expect(sim.getState().camera.trackMode).toBe('TRACK');
    }
    sim.tick();
    sim.tick();
    expect(sim.getState().camera.trackMode).not.toBe('TRACK');
  });

  it('loses TRACK when the target leaves the frame (fast crossing, zoomed in)', () => {
    const { sim, trackId } = toTrack(crossing('FPV', 100, 40), flatTerrain);
    const cam = sim.getState().camera;
    sim.dispatch({
      type: 'CAMERA_SLEWED',
      trackId,
      payload: { azDeg: cam.azDeg, elDeg: cam.elDeg, zoom: 20, mode: 'DAY' },
    });
    sim.tick();
    expect(sim.getState().camera.zoom).toBe(20);
    expect(tickUntil(sim, () => sim.getState().camera.trackMode !== 'TRACK', 40)).toBe(true);
    expect(sim.getState().contacts[0]!.status).toBe('ACTIVE');
  });

  it('a manual slew overrides TRACK (MANUAL, no lock, camera stays put)', () => {
    const { sim } = toTrack(crossing('QUAD_HEAVY', 300, 12), flatTerrain);
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: { azDeg: 200, elDeg: 3, zoom: 2 } });
    sim.tick();
    const cam = sim.getState().camera;
    expect([cam.trackMode, cam.lockTrackId, cam.azDeg, cam.elDeg]).toEqual([
      'MANUAL',
      null,
      200,
      3,
    ]);
    for (let i = 0; i < 40; i++) sim.tick();
    expect([sim.getState().camera.azDeg, sim.getState().camera.trackMode]).toEqual([200, 'MANUAL']);
  });
});

describe('EO tracker determinism', () => {
  it('replays camera state and events exactly from the logged commands', () => {
    const s11 = load('S11');
    const eo = s11.sensors.find((x): x is EoIrSensor => x.kind === 'EO_IR')!;
    const live = createSim(s11, presetWorld('JK_MOUNTAIN'));
    const liveCams: string[] = [];
    runLocked(live, eo);
    const replay = createSim(s11, presetWorld('JK_MOUNTAIN'));
    const again = createSim(s11, presetWorld('JK_MOUNTAIN'));
    const cmds = live.getEvents().filter((e) => commandFromEvent(e) !== null);
    for (const sim of [replay, again]) {
      let i = 0;
      while (sim.getState().endReason === null) {
        const next = sim.getState().clock.tMs + TICK_MS;
        while (i < cmds.length && cmds[i]!.tMs === next)
          sim.dispatch(commandFromEvent(cmds[i++]!)!);
        sim.tick();
        if (sim === replay) liveCams.push(JSON.stringify(sim.getState().camera));
      }
    }
    expect(JSON.stringify(replay.getEvents())).toBe(JSON.stringify(live.getEvents()));
    expect(JSON.stringify(replay.getState().camera)).toBe(JSON.stringify(live.getState().camera));
    expect(JSON.stringify(again.getState())).toBe(JSON.stringify(replay.getState()));
    expect(liveCams.some((c) => c.includes('"TRACK"'))).toBe(true);
  });
});
