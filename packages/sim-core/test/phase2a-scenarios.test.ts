import { readFileSync } from 'node:fs';
import { Scenario } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { TICK_MS, commandFromEvent, createSim, type Sim, type SimCommand } from '../src/index.ts';
import { presetWorld } from './fixtures.ts';

// Part A done-criteria (SPEC §12 Phase 2, S11/S12 test scenarios, SPEC §7.2).

const load = (id: string) =>
  Scenario.parse(
    JSON.parse(
      readFileSync(
        new URL(`../../../apps/api/app/seed/scenarios/${id}.json`, import.meta.url),
        'utf8',
      ),
    ),
  );

/** Lock the EO camera, fully zoomed, on the first live track; returns the sim at the end. */
function lockAndRun(scenario: Scenario, mode: 'DAY' | 'IR'): Sim {
  const sim = createSim(scenario, presetWorld(scenario.terrain.preset));
  let locked = false;
  while (sim.getState().endReason === null) {
    const t = sim.getState().tracks.find((x) => x.status === 'ACTIVE');
    if (t && !locked) {
      locked = true;
      sim.dispatch({
        type: 'CAMERA_SLEWED',
        trackId: t.id,
        payload: { azDeg: t.bearingDeg, elDeg: 0, zoom: 20, mode },
      });
    }
    sim.tick();
  }
  return sim;
}

describe('S11 Ridge Line (JK_MOUNTAIN)', () => {
  const s11 = load('S11');

  it('loses the radar track behind the ridge (LOS) and reacquires it', () => {
    const sim = createSim(s11, presetWorld('JK_MOUNTAIN'));
    while (sim.getState().endReason === null) sim.tick();
    const ev = sim.getEvents();
    const created = ev.filter((e) => e.type === 'SENSOR_TRACK_CREATED');
    const lost = ev.filter((e) => e.type === 'SENSOR_TRACK_LOST');
    expect(lost.map((e) => e.payload)).toContainEqual({ reason: 'LOS' });
    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(created[1]!.tMs).toBeGreaterThan(lost[0]!.tMs);
    expect(created.every((e) => e.contactId === 'c01')).toBe(true);
  });

  it('replays exactly over real terrain with LOS and EO commands', () => {
    const live = lockAndRun(s11, 'DAY');
    const replay = createSim(s11, presetWorld('JK_MOUNTAIN'));
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
  });
});

describe('S12 Night Watch (PUNJAB_PLAINS)', () => {
  const s12 = load('S12');
  const identified = (sim: Sim) =>
    sim.getEvents().filter((e) => e.type === 'EO_IDENTIFIABLE' && e.payload.level === 'IDENTIFY');

  it('is night by computed sun position', () => {
    expect(createSim(s12, presetWorld('PUNJAB_PLAINS')).getState().environment.isNight).toBe(true);
  });

  it('cannot be identified with the day camera, only in IR', () => {
    expect(identified(lockAndRun(s12, 'DAY'))).toHaveLength(0);
    const ir = identified(lockAndRun(s12, 'IR'));
    expect(ir.length).toBeGreaterThan(0);
    // Representative IR identify range for a heavy quad at full zoom: ~1.1 km.
    expect((ir[0]!.payload as { rangeM: number }).rangeM).toBeLessThan(1300);
  });
});
