// Records real sim event logs for API tests (apps/api/tests/fixtures/).
// Run from the repo root: `node packages/sim-core/scripts/export-api-fixtures.ts`
// Re-run whenever sim behaviour changes; the sim-core test suite fails if the
// committed logs are stale.

import { writeFileSync } from 'node:fs';
import { FIXTURE_DIR, recordFixtureLogs } from '../test/fixture-logs.ts';

for (const [name, events] of Object.entries(recordFixtureLogs())) {
  writeFileSync(new URL(`${name}.json`, FIXTURE_DIR), JSON.stringify(events, null, 1) + '\n');
  console.log(`Wrote ${name}.json (${events.length} events)`);
}
