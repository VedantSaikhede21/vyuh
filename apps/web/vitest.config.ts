import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors the `@/*` path alias in tsconfig.json so component modules can be tested.
// Playwright specs in e2e/ are run by `pnpm e2e`, not vitest.
// At most 4 workers, like sim-core: one per core (15 here) beside sim-core's 4 and
// the dev servers could not spawn on a 6 GB machine (decision 154).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'], maxWorkers: 4 },
});
