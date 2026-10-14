import type { EoIrSensor } from '@vyuh/shared';
import { CLASS_PROFILES } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  TICK_MS,
  commandFromEvent,
  computeEnvironment,
  createHeightmap,
  createSim,
  createWorld,
  eoHfovDeg,
  eoIfovRad,
  eoLevel,
  followPointing,
  inEoFrustum,
  isNightAt,
  johnsonCycles,
  levelForCycles,
  localInstantMs,
  sunPosition,
  type EoCameraState,
  type SimCommand,
} from '../src/index.ts';
import { attackQuad, hills, testScenario } from './fixtures.ts';

const PUNJAB = { lat: 30.52, lon: 75.7 };

describe('sun (SPEC §14)', () => {
  it('builds the instant from local time and the explicit offset, not the machine timezone', () => {
    expect(localInstantMs('2026-12-21', '12:30', 330)).toBe(Date.UTC(2026, 11, 21, 7, 0));
    expect(localInstantMs('2026-01-01', '02:00', 330)).toBe(Date.UTC(2025, 11, 31, 20, 30));
  });

  it('puts the winter-solstice midday sun low in the south', () => {
    // Noon elevation ≈ 90 − 30.5 − 23.4 ≈ 36°.
    const sun = sunPosition(PUNJAB.lat, PUNJAB.lon, localInstantMs('2026-12-21', '12:30', 330));
    expect(sun.elDeg).toBeGreaterThan(33);
    expect(sun.elDeg).toBeLessThan(38);
    expect(sun.azDeg).toBeGreaterThan(165);
    expect(sun.azDeg).toBeLessThan(195);
  });

  it('computes isNight from the −6° threshold and overrides the stored flag', () => {
    const env = (time: string, isNight: boolean) =>
      computeEnvironment(
        {
          terrain: { preset: 'X', origin: { lat: 0, lon: 0 } },
          environment: {
            date: '2026-12-21',
            time,
            isNight,
            weather: { visibilityM: 8000, rainMmph: 0, windMps: 0, windDirDeg: 0, cloudPct: 0 },
          },
        },
        { origin: PUNJAB, utcOffsetMin: 330 },
      );
    expect(env('12:30', true).isNight).toBe(false); // stored flag ignored
    expect(env('00:00', false).isNight).toBe(true);
    // Sunset ≈ 17:25 IST; civil dusk (−6°) ≈ 17:52.
    expect(env('17:30', true).isNight).toBe(false);
    expect(env('17:30', true).sun.elDeg).toBeLessThan(0);
    expect(env('18:15', false).isNight).toBe(true);
    // The scenario-list helper applies the same rule.
    for (const t of ['00:00', '12:30', '17:30', '18:15']) {
      expect(isNightAt('2026-12-21', t, { origin: PUNJAB, utcOffsetMin: 330 })).toBe(
        env(t, false).isNight,
      );
    }
  });
});

const eo: EoIrSensor = {
  id: 'eo1',
  kind: 'EO_IR',
  x: 0,
  y: 8,
  z: 0,
  fovDegMin: 1.5,
  fovDegMax: 30,
  resolution: [640, 360],
};
const MAX_ZOOM = 20; // 30° / 1.5°
const clear = { isNight: false, visibilityM: 20_000 };
const quad = CLASS_PROFILES.QUAD_SMALL;
const target = (rangeM: number, p = quad) => ({
  sizeM: p.sizeM,
  thermalContrast: p.thermalContrast,
  rangeM,
});
const day = { zoom: MAX_ZOOM, mode: 'DAY' as const };
const ir = { zoom: MAX_ZOOM, mode: 'IR' as const };

describe('EO/IR Johnson criteria (SPEC §6.2)', () => {
  // Narrowest FOV 1.5° over 640 px: IFOV = 4.0906e-5 rad. A 0.35 m quad gives
  // 12.8 px (6.4 cycles) at 668.5 m, 8 px at 1069.6 m, 2 px at 4278 m.
  it('derives IFOV from FOV and pixels', () => {
    expect(eoHfovDeg(eo, MAX_ZOOM)).toBeCloseTo(1.5);
    expect(eoHfovDeg(eo, 100)).toBeCloseTo(1.5); // clamped
    expect(eoIfovRad(eo, MAX_ZOOM, 'DAY')).toBeCloseTo(4.0906e-5, 8);
    expect(johnsonCycles(0.35, 668.5, eoIfovRad(eo, MAX_ZOOM, 'DAY'))).toBeCloseTo(6.4, 2);
  });

  it('crosses DETECT / RECOGNISE / IDENTIFY at the expected ranges', () => {
    expect(eoLevel(eo, day, target(660), clear)).toBe('IDENTIFY');
    expect(eoLevel(eo, day, target(680), clear)).toBe('RECOGNISE');
    expect(eoLevel(eo, day, target(1060), clear)).toBe('RECOGNISE');
    expect(eoLevel(eo, day, target(1080), clear)).toBe('DETECT');
    expect(eoLevel(eo, day, target(4250), clear)).toBe('DETECT');
    expect(eoLevel(eo, day, target(4300), clear)).toBeNull();
    // Wide FOV (zoom 1) is 20× coarser.
    expect(eoLevel(eo, { zoom: 1, mode: 'DAY' }, target(660), clear)).toBeNull();
    expect(levelForCycles(0.99)).toBeNull();
  });

  it('caps the day camera at visibility and IR at 1.5 × visibility', () => {
    const heli = CLASS_PROFILES.HELICOPTER_FRIENDLY;
    const hazy = { isNight: false, visibilityM: 3000 };
    expect(eoLevel(eo, day, target(2900, heli), hazy)).toBe('IDENTIFY');
    expect(eoLevel(eo, day, target(3100, heli), hazy)).toBeNull();
    expect(eoLevel(eo, ir, target(3100, heli), hazy)).toBe('IDENTIFY');
    expect(eoLevel(eo, ir, target(4600, heli), hazy)).toBeNull();
  });

  it('needs IR at night, where thermal contrast reduces the cycles', () => {
    const night = { isNight: true, visibilityM: 20_000 };
    expect(eoLevel(eo, day, target(250), night)).toBeNull();
    expect(eoLevel(eo, ir, target(250), night)).toBe('IDENTIFY');
    // 0.45 contrast: identify range shrinks from 668 m to ~300 m.
    expect(eoLevel(eo, ir, target(400), night)).toBe('RECOGNISE');
  });
});

describe('EO pointing', () => {
  const cam: EoCameraState = {
    azDeg: 0,
    elDeg: 0,
    zoom: 1,
    mode: 'DAY',
    lockTrackId: null,
    trackMode: 'MANUAL',
  };
  const from = { x: 0, y: 0, z: 0 };
  const at = (azDeg: number, elDeg: number, r = 1000) => {
    const a = (azDeg * Math.PI) / 180;
    const e = (elDeg * Math.PI) / 180;
    return {
      x: r * Math.sin(a) * Math.cos(e),
      y: r * Math.sin(e),
      z: r * Math.cos(a) * Math.cos(e),
    };
  };

  it('tests the rectangular frustum (30° wide, 16:9)', () => {
    expect(inEoFrustum(eo, cam, from, at(10, 0))).toBe(true);
    expect(inEoFrustum(eo, cam, from, at(20, 0))).toBe(false);
    expect(inEoFrustum(eo, cam, from, at(0, 5))).toBe(true);
    expect(inEoFrustum(eo, cam, from, at(0, 12))).toBe(false);
    expect(inEoFrustum(eo, cam, from, at(180, 0))).toBe(false); // behind
    expect(inEoFrustum(eo, { ...cam, azDeg: 355 }, from, at(3, 0))).toBe(true); // wraps
  });

  it('follows a locked target deterministically, wrapping through north', () => {
    const c: EoCameraState = { ...cam, azDeg: 350, elDeg: 0 };
    for (let i = 0; i < 40; i++) followPointing(c, { azDeg: 10, elDeg: 5 }, 0.05);
    expect(c.azDeg).toBeCloseTo(10, 2);
    expect(c.elDeg).toBeCloseTo(5, 2);
    const d: EoCameraState = { ...cam, azDeg: 350, elDeg: 0 };
    followPointing(d, { azDeg: 10, elDeg: 0 }, 0.05);
    expect(d.azDeg).toBeCloseTo(354, 6); // 20° gap closed by 20 %, through 0
  });
});

describe('EO/IR in the sim', () => {
  const flatWorld = createWorld(createHeightmap(20_000, 2, new Float32Array(4)));
  /** A quad hovering `rangeM` north of the EO mast at 40 m AGL. */
  const hoverer = (rangeM: number) => {
    const q = attackQuad('c01', [0, rangeM]);
    q.path = [{ x: 0, y: 40, z: rangeM, speedMps: 0, holdS: 600 }];
    return q;
  };
  const scenarioWith = (rangeM: number, time = '10:00') =>
    testScenario({
      environment: { ...testScenario().environment, time, isNight: false },
      sensors: [...testScenario().sensors, eo],
      contacts: [hoverer(rangeM)],
    });
  const eoEvents = (sim: ReturnType<typeof createSim>) =>
    sim.getEvents().filter((e) => e.type === 'EO_IDENTIFIABLE');
  const run = (sim: ReturnType<typeof createSim>, ticks: number) => {
    for (let i = 0; i < ticks; i++) sim.tick();
  };
  /** Point at the hoverer: elevation of (0, 40, r) from the 8 m mast. */
  const elTo = (r: number) => (Math.atan2(32, r) * 180) / Math.PI;

  it('emits EO_IDENTIFIABLE only when pointed and zoomed enough', () => {
    const sim = createSim(scenarioWith(600), flatWorld);
    run(sim, 40); // wide FOV, 600 m: < 1 cycle
    expect(eoEvents(sim)).toHaveLength(0);
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: { azDeg: 0, elDeg: elTo(600), zoom: 20 } });
    run(sim, 2);
    const ev = eoEvents(sim);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ contactId: 'c01', payload: { level: 'IDENTIFY' } });
    run(sim, 40); // still in view: no repeats
    expect(eoEvents(sim)).toHaveLength(1);
  });

  it('starts a new pointing episode only after 1 s with no level', () => {
    const sim = createSim(scenarioWith(600), flatWorld);
    const on = { azDeg: 0, elDeg: elTo(600), zoom: 20 };
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: on });
    run(sim, 2);
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: { ...on, azDeg: 90 } });
    run(sim, 10); // 0.5 s away
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: on });
    run(sim, 2);
    expect(eoEvents(sim)).toHaveLength(1);
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: { ...on, azDeg: 90 } });
    run(sim, 30); // 1.5 s away
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: on });
    run(sim, 2);
    expect(eoEvents(sim)).toHaveLength(2);
  });

  it('needs IR mode to identify at night (computed isNight overrides the stored flag)', () => {
    const sim = createSim(scenarioWith(250, '01:30'), flatWorld);
    expect(sim.getState().environment.isNight).toBe(true);
    const on = { azDeg: 0, elDeg: elTo(250), zoom: 20 };
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: { ...on, mode: 'DAY' } });
    run(sim, 20);
    expect(eoEvents(sim)).toHaveLength(0);
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: { ...on, mode: 'IR' } });
    run(sim, 2);
    expect(eoEvents(sim)[0]?.payload).toMatchObject({ level: 'IDENTIFY' });
    expect(sim.getState().camera.mode).toBe('IR');
  });

  it('a locked camera follows its track and unlocks on a manual slew', () => {
    const sim = createSim(
      testScenario({ sensors: [...testScenario().sensors, eo] }),
      createWorld(hills),
    );
    while (sim.getState().tracks.length === 0) sim.tick();
    const track = sim.getState().tracks[0]!;
    sim.dispatch({
      type: 'CAMERA_SLEWED',
      trackId: track.id,
      payload: { azDeg: 180, elDeg: 0, zoom: 1 },
    });
    run(sim, 60);
    const cam = sim.getState().camera;
    expect(cam.lockTrackId).toBe(track.id);
    expect(Math.abs(((cam.azDeg - track.bearingDeg + 540) % 360) - 180)).toBeLessThan(3);
    sim.dispatch({ type: 'CAMERA_SLEWED', payload: { azDeg: 90, elDeg: 0, zoom: 1 } });
    run(sim, 1);
    expect(sim.getState().camera).toMatchObject({ azDeg: 90, lockTrackId: null });
  });

  it('replays exactly with terrain, LOS, camera lock and IR commands', () => {
    const scenario = testScenario({
      environment: { ...testScenario().environment, time: '22:00' },
      sensors: [...testScenario().sensors, eo],
    });
    const world = createWorld(hills);
    const live = createSim(scenario, world);
    let locked = false;
    while (live.getState().endReason === null) {
      const t = live.getState().tracks.find((x) => x.status === 'ACTIVE');
      if (t && !locked) {
        locked = true;
        live.dispatch({
          type: 'CAMERA_SLEWED',
          trackId: t.id,
          payload: { azDeg: 0, elDeg: 0, zoom: 20, mode: 'IR' },
        });
      }
      live.tick();
    }
    expect(eoEvents(live).length).toBeGreaterThan(0);
    const replay = createSim(scenario, world);
    const cmds = live.getEvents().filter((e) => commandFromEvent(e) !== null);
    let i = 0;
    while (replay.getState().endReason === null) {
      const next = replay.getState().clock.tMs + TICK_MS;
      while (i < cmds.length && cmds[i]!.tMs === next) {
        replay.dispatch(commandFromEvent(cmds[i]!) as SimCommand);
        i++;
      }
      replay.tick();
    }
    expect(replay.getEvents()).toEqual(live.getEvents());
    expect(replay.getState()).toEqual(live.getState());
  });
});
