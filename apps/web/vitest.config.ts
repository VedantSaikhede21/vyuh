import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors the `@/*` path alias in tsconfig.json so component modules can be tested.
// Playwright specs in e2e/ are run by `pnpm e2e`, not vitest.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'] },
});
