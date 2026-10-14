import { readFileSync } from 'node:fs';
import { Scenario, type SimEvent } from '@vyuh/shared';
import { createProceduralTerrain, createSim, type Sim } from '../src/index.ts';
import { playScripted, presetWorld } from './fixtures.ts';

// Real event logs used as API test fixtures (see scripts/export-api-fixtures.ts).

export const FIXTURE_DIR = new URL('../../../apps/api/tests/fixtures/', import.meta.url);

export function loadScripted(id: string): Scenario {
  const url = new URL(`../../../apps/api/app/seed/scenarios/${id}.json`, import.meta.url);
  return Scenario.parse(JSON.parse(readFileSync(url, 'utf8')));
}

/** S14: jam the hostile once its track is inside 1.4 km; the friendly patrol shares the sector. */
export function playS14Jam(): Sim {
  const scenario = loadScripted('S14');
  const sim = createSim(scenario, presetWorld(scenario.terrain.preset), { mode: 'PRACTICE' });
  let jammed = false;
  while (sim.getState().endReason === null) {
    const t = sim
      .getState()
      .tracks.find((x) => x.contactId === 'c01' && x.status === 'ACTIVE' && x.rangeM < 1400);
    if (!jammed && t) {
      jammed = true;
      sim.dispatch({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
      sim.dispatch({ type: 'MARKED_DETECTED', trackId: t.id, payload: {} });
      sim.dispatch({ type: 'RESPONSE_ORDERED', trackId: t.id, payload: { response: 'EW_JAM' } });
    }
    sim.tick();
  }
  return sim;
}

export function recordFixtureLogs(): Record<string, readonly SimEvent[]> {
  const s01 = loadScripted('S01');
  const terrain = createProceduralTerrain();

  const ignored = createSim(s01, terrain, { mode: 'PRACTICE' });
  while (ignored.getState().endReason === null) ignored.tick();

  const s14 = loadScripted('S14');
  return {
    s01_ignored: ignored.getEvents(),
    s01_defended: playScripted(s01, terrain, 'PRACTICE').getEvents(),
    // The scripted player calls every track hostile and shoots it when in range: fratricide.
    s14_scripted: playScripted(s14, presetWorld(s14.terrain.preset), 'PRACTICE').getEvents(),
    s14_jam: playS14Jam().getEvents(),
  };
}
