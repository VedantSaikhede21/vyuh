// Writes the sim version for the API (eo-haze plan [C4]): the API refuses a session
// from a simulator newer than it knows, so the web cannot go live before the API.
// Part of `pnpm gen:schemas`; CI fails if the committed file differs.

import { writeFileSync } from 'node:fs';
import { SIM_VERSION } from '../src/version.ts';

const out = new URL('../../../apps/api/app/seed/generated/sim.json', import.meta.url);
const body = {
  _generated:
    'GENERATED FILE — DO NOT EDIT. Source: packages/sim-core/src/version.ts; run `pnpm gen:schemas`.',
  simVersion: SIM_VERSION,
};
writeFileSync(out, JSON.stringify(body, null, 2) + '\n');
console.log(`Wrote apps/api/app/seed/generated/sim.json (SIM_VERSION ${SIM_VERSION})`);
