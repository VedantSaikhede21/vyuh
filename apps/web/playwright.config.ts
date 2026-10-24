import { defineConfig } from '@playwright/test';

// E2E and visual tests (DESIGN §12). Runs against the local dev stack
// (`pnpm dev`: web on :3000, API on :8000) using the installed Chrome, so no
// browser download is needed. GPU flags follow decision 45 (headless ANGLE).
export default defineConfig({
  testDir: './e2e',
  // Resets the @demo accounts before every run (decision 148).
  globalSetup: './e2e/global-setup.ts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  timeout: 180_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    channel: 'chrome',
    headless: true,
    // Template debrief on every result screen and AAR, whatever LLM_ENABLED says:
    // runs never depend on, or spend, the LLM (decision 148; honoured only where
    // dev login is). checkpoint-5 @cp5-on clears it to capture a real LLM debrief.
    extraHTTPHeaders: { 'X-Vyuh-Test-Debrief': 'template' },
    launchOptions: {
      args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'pnpm dev',
    cwd: '../..',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
