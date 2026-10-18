import { readdirSync, readFileSync } from 'node:fs';
import { Scenario } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { PROCEDURAL_HILLS, createSim } from '../src/index.ts';
import {
  E2E_SEED_DIR,
  FIXTURE_DIR,
  recordE2eSeedLogs,
  recordFixtureLogs,
} from './fixture-logs.ts';
import { playScripted, presetWorld } from './fixtures.ts';

// Guards the hand-written scenarios in apps/api/app/seed/scenarios: valid
// against the zod schema, a real threat if ignored, and defensible in time.
// Since Phase 2 radar has LOS masking, so low threats appear later (S03 is the
// low-level one); 45 s of warning is the floor, and a scripted defence must win.
// Library scenarios built from seed/scenarios/src/ (S04–S10, S15) have their own
// guard in library-scenarios.test.ts (validator + per-scenario checks).

const MIN_WARNING_MS = 45_000;

const DIR = new URL('../../../apps/api/app/seed/scenarios/', import.meta.url);
const built = new Set(readdirSync(new URL('src/', DIR)));
const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !built.has(f));

describe.each(files)('scripted scenario %s', (file) => {
  const scenario = Scenario.parse(JSON.parse(readFileSync(new URL(file, DIR), 'utf8')));
  const terrain = presetWorld(scenario.terrain.preset);

  it('loads its terrain preset; Phase 1 training scenarios last 3 minutes', () => {
    expect(terrain.meta?.name).toBe(scenario.terrain.preset);
    if (scenario.terrain.preset === PROCEDURAL_HILLS) expect(scenario.durationS).toBe(180);
    else expect(scenario.durationS).toBeLessThanOrEqual(360);
  });

  it('every threat reaches the asset before time-up if ignored', () => {
    const sim = createSim(scenario, terrain);
    while (sim.getState().endReason === null) sim.tick();
    const leaked = sim.getEvents().filter((e) => e.type === 'CONTACT_REACHED_ASSET');
    expect(leaked.map((e) => e.contactId).sort()).toEqual(
      scenario.contacts.filter((c) => c.isThreat).map((c) => c.id),
    );
    expect(sim.getState().endReason).toBe('ALL_RESOLVED');
  });

  it('every threat is tracked with at least 45 s of warning', () => {
    const sim = createSim(scenario, terrain);
    while (sim.getState().endReason === null) sim.tick();
    const ev = sim.getEvents();
    for (const c of scenario.contacts.filter((x) => x.isThreat)) {
      const created = ev.find((e) => e.type === 'SENSOR_TRACK_CREATED' && e.contactId === c.id);
      const leaked = ev.find((e) => e.type === 'CONTACT_REACHED_ASSET' && e.contactId === c.id);
      expect(created).toBeDefined();
      expect(leaked!.tMs - created!.tMs).toBeGreaterThanOrEqual(MIN_WARNING_MS);
    }
  });

  it('a prompt scripted defence neutralises every threat', () => {
    const ev = playScripted(scenario, terrain).getEvents();
    const neutralised = new Set(
      ev.filter((e) => e.type === 'CONTACT_NEUTRALISED').map((e) => e.contactId),
    );
    // The scripted player engages every track in range, so it may also down non-threats.
    for (const c of scenario.contacts.filter((x) => x.isThreat)) {
      expect(neutralised.has(c.id), c.id).toBe(true);
    }
  });
});

describe('API fixture logs (apps/api/tests/fixtures)', () => {
  it('match what the sim records today — re-run scripts/export-api-fixtures.ts if not', () => {
    for (const [name, events] of Object.entries(recordFixtureLogs())) {
      const committed: unknown = JSON.parse(
        readFileSync(new URL(`${name}.json`, FIXTURE_DIR), 'utf8'),
      );
      expect(committed, name).toEqual(JSON.parse(JSON.stringify(events)));
    }
  });
});

describe('e2e@demo seed logs (apps/api/app/seed/e2e)', () => {
  it('match what the sim records today — re-run scripts/export-api-fixtures.ts if not', () => {
    for (const [name, log] of Object.entries(recordE2eSeedLogs())) {
      const committed: unknown = JSON.parse(
        readFileSync(new URL(`${name}.json`, E2E_SEED_DIR), 'utf8'),
      );
      expect(committed, name).toEqual(JSON.parse(JSON.stringify(log)));
    }
  });
});
