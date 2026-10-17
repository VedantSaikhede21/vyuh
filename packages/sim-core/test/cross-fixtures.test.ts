import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CROSSCHECK_DIR, recordCrossChecks } from './cross-fixtures.ts';

describe('API cross-check fixtures (apps/api/tests/fixtures/crosscheck)', () => {
  it('match sim-core today — re-run scripts/export-api-fixtures.ts if not', () => {
    for (const [name, value] of Object.entries(recordCrossChecks())) {
      const committed: unknown = JSON.parse(
        readFileSync(new URL(`${name}.json`, CROSSCHECK_DIR), 'utf8'),
      );
      expect(committed, name).toEqual(JSON.parse(JSON.stringify(value)));
    }
    // Loads every file preset, URBAN_GENERIC's 13.6 k footprints included.
  }, 30_000);
});
