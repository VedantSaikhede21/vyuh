import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../src/index.ts';
import { demoRuns, playDemoTrainee } from './demo-policy.ts';
import { loadScripted } from './fixture-logs.ts';
import { presetWorld } from './fixtures.ts';

// The seeded demo history (decision 125) must match what the policy records now;
// re-run `node packages/sim-core/scripts/export-demo-sessions.ts` when this fails.

const DIR = new URL('../../../apps/api/app/seed/demo_sessions/', import.meta.url);

describe('committed demo sessions', () => {
  const runs = demoRuns();

  it('cover six trainees with seven runs each', () => {
    expect(runs).toHaveLength(42);
    expect(new Set(runs.map((r) => r.email)).size).toBe(6);
  });

  // One easy, one dense-town and one swarm run keep the check fast.
  for (const name of ['trainee1_01', 'trainee4_04', 'trainee3_07']) {
    it(`${name} is up to date`, () => {
      const log = JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8')) as {
        scenarioCode: string;
        skill: number;
        seed: number;
        simVersion: number;
        events: unknown[];
      };
      expect(log.simVersion).toBe(SIM_VERSION);
      const scenario = loadScripted(log.scenarioCode);
      const sim = playDemoTrainee(
        scenario,
        presetWorld(scenario.terrain.preset),
        log.skill,
        log.seed,
      );
      expect(JSON.parse(JSON.stringify(sim.getEvents()))).toEqual(log.events);
    });
  }
});
