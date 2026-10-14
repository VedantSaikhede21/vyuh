import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors the `@/*` path alias in tsconfig.json so component modules can be tested.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
});
