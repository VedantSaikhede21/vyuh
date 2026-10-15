import { readFileSync } from 'node:fs';
import { Scenario } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { createDefender, createSim, trueAffiliation } from '../src/index.ts';
import { presetWorld } from './fixtures.ts';

// The ground-truth defender (decision 68) must never engage a non-threat and
// must defend the Phase 1 training scenarios; it is RNG-free, so runs repeat.

const DIR = new URL('../../../apps/api/app/seed/scenarios/', import.meta.url);
const load = (code: string) =>
  Scenario.parse(JSON.parse(readFileSync(new URL(`${code}.json`, DIR), 'utf8')));

function run(code: string) {
  const scenario = load(code);
  const sim = createSim(scenario, presetWorld(scenario.terrain.preset));
  const defender = createDefender(scenario);
  while (sim.getState().endReason === null) {
    for (const cmd of defender.step(sim.getState())) sim.dispatch(cmd);
    sim.tick();
  }
  return { scenario, sim };
}

describe.each(['S01', 'S02', 'S03', 'S14'])('defender on %s', (code) => {
  it('engages threats only and calls every affiliation correctly', () => {
    const { scenario, sim } = run(code);
    const threats = new Set(scenario.contacts.filter((c) => c.isThreat).map((c) => c.id));
    const trackContact = new Map(sim.getState().tracks.map((t) => [t.id, t.contactId]));
    for (const e of sim.getEvents()) {
      if (e.type === 'RESPONSE_ORDERED') {
        expect(threats.has(trackContact.get(e.trackId ?? '') ?? '')).toBe(true);
      }
      if (e.type === 'AFFILIATION_SET') {
        const contact = trackContact.get(e.trackId ?? '') ?? '';
        expect(e.payload.affiliation).toBe(trueAffiliation(scenario, contact));
      }
    }
  });
});

describe.each(['S01', 'S02', 'S03'])('defender defends %s', (code) => {
  it('no threat reaches the asset, and a second run is identical', () => {
    const a = run(code).sim;
    expect(a.getEvents().filter((e) => e.type === 'CONTACT_REACHED_ASSET')).toEqual([]);
    expect(JSON.stringify(run(code).sim.getEvents())).toBe(JSON.stringify(a.getEvents()));
  });
});

describe('defender EW policy (decision 77)', () => {
  it('never jams when a friendly shares the sector (S14), and still defends', () => {
    const { sim } = run('S14');
    const orders = sim
      .getEvents()
      .flatMap((e) => (e.type === 'RESPONSE_ORDERED' ? [e.payload.response] : []));
    expect(orders).not.toContain('EW_JAM');
    expect(orders).toContain('INTERCEPT');
    expect(sim.getEvents().some((e) => e.type === 'CONTACT_REACHED_ASSET')).toBe(false);
  });

  it('jams an RF threat first when the sector is clear, saving rounds', () => {
    const base = load('S01');
    const scenario = {
      ...base,
      effectors: [
        ...base.effectors,
        { id: 'jam1', kind: 'EW_JAM' as const, x: 0, z: 0, rangeM: 2000, cooldownS: 10 },
      ],
    };
    const sim = createSim(scenario, presetWorld(scenario.terrain.preset));
    const defender = createDefender(scenario);
    while (sim.getState().endReason === null) {
      for (const cmd of defender.step(sim.getState())) sim.dispatch(cmd);
      sim.tick();
    }
    const first = sim.getEvents().find((e) => e.type === 'RESPONSE_ORDERED');
    expect(first?.type === 'RESPONSE_ORDERED' && first.payload.response).toBe('EW_JAM');
  });
});
