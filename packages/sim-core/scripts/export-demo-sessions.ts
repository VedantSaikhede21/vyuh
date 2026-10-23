// Records the seeded demo history (SPEC §22, decision 125): every demo trainee's
// Assessment runs, played by the skill-scaled policy in test/demo-policy.ts, into
// apps/api/app/seed/demo_sessions/. The API seed replays each log through the
// real ingest and scoring path, so scores are server-computed and runs replay.
// Run from the repo root: `node packages/sim-core/scripts/export-demo-sessions.ts`
// Re-run whenever sim behaviour or a scripted scenario changes.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { SIM_VERSION } from '../src/index.ts';
import { demoRuns, playDemoTrainee } from '../test/demo-policy.ts';
import { loadScripted } from '../test/fixture-logs.ts';
import { presetWorld } from '../test/fixtures.ts';

const DIR = new URL('../../../apps/api/app/seed/demo_sessions/', import.meta.url);
mkdirSync(DIR, { recursive: true });
for (const f of readdirSync(DIR)) if (f.endsWith('.json')) rmSync(new URL(f, DIR));

for (const run of demoRuns()) {
  const scenario = loadScripted(run.scenarioCode);
  const t0 = performance.now();
  const sim = playDemoTrainee(scenario, presetWorld(scenario.terrain.preset), run.skill, run.seed);
  const events = sim.getEvents();
  const name = `${run.email.split('@')[0]}_${String(run.index + 1).padStart(2, '0')}`;
  const log = { ...run, mode: 'ASSESSMENT', simVersion: SIM_VERSION, events };
  writeFileSync(new URL(`${name}.json`, DIR), JSON.stringify(log) + '\n');
  console.log(
    `${name} ${run.scenarioCode} skill ${run.skill.toFixed(2)}: ${events.length} events, ` +
      `${Math.round(performance.now() - t0)} ms`,
  );
}
