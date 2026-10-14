import { readFileSync } from 'node:fs';
import { Scenario, type SimEvent } from '@vyuh/shared';
import { createProceduralTerrain, createSim } from '../src/index.ts';
import { playScripted } from './fixtures.ts';

// Real S01 event logs used as API test fixtures (see scripts/export-api-fixtures.ts).

export const FIXTURE_DIR = new URL('../../../apps/api/tests/fixtures/', import.meta.url);

export function recordFixtureLogs(): Record<string, readonly SimEvent[]> {
  const url = new URL('../../../apps/api/app/seed/scenarios/S01.json', import.meta.url);
  const scenario = Scenario.parse(JSON.parse(readFileSync(url, 'utf8')));
  const terrain = createProceduralTerrain();

  const ignored = createSim(scenario, terrain, { mode: 'PRACTICE' });
  while (ignored.getState().endReason === null) ignored.tick();

  return {
    s01_ignored: ignored.getEvents(),
    s01_defended: playScripted(scenario, terrain, 'PRACTICE').getEvents(),
  };
}
