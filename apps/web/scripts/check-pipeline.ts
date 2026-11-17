// Realism plan R0: proves a pipeline GLB (meshopt + KTX2, scripts/assets/optimize.mjs)
// loads in the browser through lib/assets. Opens /dev/models?pipeline=1 on the dev
// server, prints what each model decoded to and the GPU used, saves a screenshot.
//
//   pnpm dev   (web :3000)
//   node apps/web/scripts/check-pipeline.ts [out.png]

import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { GPU_ARGS, rendererString } from './gpu.ts';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const out = resolve(process.argv[2] ?? 'pipeline-check.png');

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1200, height: 640 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
console.log('GPU:', await rendererString(page));
await page.goto(`${BASE}/dev/models?pipeline=1`);
await page.waitForFunction(() => Object.keys(window.__vyuhPipeline ?? {}).length === 2, null, {
  timeout: 120_000,
});
await page.waitForTimeout(500);
console.log(JSON.stringify(await page.evaluate(() => window.__vyuhPipeline), null, 2));
await page.screenshot({ path: out });
console.log('screenshot', out);
if (errors.length) console.log('page errors:', errors);
await browser.close();
