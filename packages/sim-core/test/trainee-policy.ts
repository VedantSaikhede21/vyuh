import type { ContactReport, Scenario, SessionMode } from '@vyuh/shared';
import { altitudeBandOf } from '@vyuh/shared';
import {
  createDefender,
  createSim,
  wrapDeg,
  type Heightmap,
  type Sim,
  type SimState,
  type TrackState,
  type World,
} from '../src/index.ts';

// A scripted trainee for replay tests (Phase 4a): the ground-truth defender plus
// the things a person also does — select, lock the EO camera on new tracks,
// change zoom and mode, and send a contact report per track. Its log exercises
// every command type replay must reproduce.

function report(state: Readonly<SimState>, t: TrackState): Omit<ContactReport, 'tMs'> {
  return {
    trackIds: [t.id],
    count: 1,
    class: t.classifiedAs ?? 'UNKNOWN',
    affiliation: t.affiliation,
    location: { bearingDeg: wrapDeg(t.bearingDeg), rangeM: t.rangeM, fromSensorId: t.sensorId },
    headingDeg: wrapDeg(t.headingDeg ?? 0),
    altitudeBand: altitudeBandOf(t.altitudeAglM),
    activity: 'UNKNOWN',
  };
}

export function playTrainee(
  scenario: Scenario,
  world: World | Heightmap,
  mode: SessionMode = 'ASSESSMENT',
): Sim {
  const sim = createSim(scenario, world, { mode });
  const defender = createDefender(scenario);
  const locked = new Set<string>();
  const reported = new Set<string>();
  let n = 0;
  while (sim.getState().endReason === null) {
    const st = sim.getState();
    for (const cmd of defender.step(st)) sim.dispatch(cmd);
    for (const t of st.tracks) {
      if (t.status !== 'ACTIVE') continue;
      if (!locked.has(t.id)) {
        locked.add(t.id);
        sim.dispatch({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
        sim.dispatch({
          type: 'CAMERA_SLEWED',
          trackId: t.id,
          payload: {
            azDeg: wrapDeg(t.bearingDeg),
            elDeg: 2,
            zoom: 4,
            mode: st.environment.isNight ? 'IR' : 'DAY',
          },
        });
      } else if (!reported.has(t.id) && t.headingDeg !== null && t.markedDetected) {
        reported.add(t.id);
        sim.dispatch({
          type: 'REPORT_SUBMITTED',
          payload: { ...report(st, t), tMs: st.clock.tMs },
        });
      }
    }
    // A manual slew now and then (no lock), as a trainee scanning the sector.
    if (++n % 400 === 0) {
      sim.dispatch({
        type: 'CAMERA_SLEWED',
        payload: { azDeg: (n / 4) % 360, elDeg: 1, zoom: 1, mode: 'DAY' },
      });
    }
    sim.tick();
  }
  return sim;
}
