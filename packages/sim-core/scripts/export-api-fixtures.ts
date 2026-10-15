// Records real sim event logs for API tests (apps/api/tests/fixtures/).
// Run from the repo root: `node packages/sim-core/scripts/export-api-fixtures.ts`
// Re-run whenever sim behaviour changes; the sim-core test suite fails if the
// committed logs are stale.

import { writeFileSync } from 'node:fs';
import { CROSSCHECK_DIR, recordCrossChecks } from '../test/cross-fixtures.ts';
import { FIXTURE_DIR, recordFixtureLogs } from '../test/fixture-logs.ts';

for (const [name, events] of Object.entries(recordFixtureLogs())) {
  writeFileSync(new URL(`${name}.json`, FIXTURE_DIR), JSON.stringify(events, null, 1) + '\n');
  console.log(`Wrote ${name}.json (${events.length} events)`);
}

for (const [name, value] of Object.entries(recordCrossChecks())) {
  writeFileSync(new URL(`${name}.json`, CROSSCHECK_DIR), JSON.stringify(value, null, 1) + '\n');
  console.log(`Wrote crosscheck/${name}.json`);
}
