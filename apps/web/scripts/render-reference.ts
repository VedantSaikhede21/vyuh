// The eight reference shots every realism step is judged on (realism plan §4, SPEC
// §16 Rendering): 1920×1080 stills of the real player on the dev hero route, with the
// picture held (pause=1) so a before and an after show the same moment. Graphics
// setting High; Chrome on the NVIDIA (scripts/gpu.ts; GPU=amd for the AMD).
//
//   pnpm dev                                         # web :3000 (no API needed)
//   pnpm --filter @vyuh/web render:reference <step> [01 03 ...]
//
// Writes apps/web/e2e/reference/<step>/NN-name.jpg and shots.json (URL, GPU, commit
// and working-tree state per shot).

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { GPU_ARGS, rendererString } from './gpu.ts';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const HERE = import.meta.dirname;
/** Terrain textures fade in over 0.4 s; the shadow bake and trees take a few seconds. */
const SETTLE_MS = 5000;
const HIDE_DEV = 'nextjs-portal { display: none !important; }';

interface Shot {
  id: string;
  name: string;
  /** Hero-route query (pause=1 is added unless `live`). */
  query: string;
  /**
   * Let the sim run until the EO tracker holds (TRK) and the cue has zoomed in, then
   * hold the picture with the Practice pause (P): a cue needs ticks to slew and lock.
   */
  live?: boolean;
  /** Generated scenario fixture in e2e/reference/scenarios, passed as s=session. */
  scenarioFile?: string;
}

// Moments and bearings chosen from the sim (2026-11-17): S15's quad is ~2 km out and
// tracked around 25–30 s; a village lies at 165° ~1.9 km from S15's mast; S05's slope
// forested flank is at 095° (steeper bearings fill the frame with near terrain); URBAN D5 seed 2 has a street gap 1.1 km long
// at 46°. URBAN D5 seed 2 starts at 18:50 in December (dark), so its shot is at noon
// with the seed's own weather (800 m fog), looking down into the nearest blocks: the
// shot exists to judge buildings. S06 at 17:20 has the sun 4.4° high at 253°. S15 runs
// without the scripted defender, which would end the scenario at 34 s. S13's thermal
// view looks across the ridge towards its first bird track (015°).
const SHOTS: Shot[] = [
  { id: '01', name: 's15-tactical', query: 's=S15&t=70&defend=0' },
  {
    id: '02',
    name: 's15-eo-drone-2km',
    query: 's=S15&t=24&defend=0&select=threat&main=camera',
    live: true,
  },
  { id: '03', name: 's15-eo-village', query: 's=S15&t=70&defend=0&aim=165,-0.4&fov=6&main=camera' },
  { id: '04', name: 's05-tactical', query: 's=S05&t=70' },
  { id: '05', name: 's05-eo-slope', query: 's=S05&t=70&aim=95,5&fov=30&main=camera' },
  { id: '06', name: 's13-night-ir', query: 's=S13&t=60&ir=1&aim=15,1&fov=30&main=camera' },
  {
    id: '07',
    name: 'urban-d5s2-eo-street',
    query: 's=session&t=20&hour=12:00&aim=46,-1.5&fov=30&main=camera',
    scenarioFile: 'URBAN-D5-2.json',
  },
  { id: '08', name: 's06-dusk', query: 's=S06&t=70&hour=17:20' },
];

const step = process.argv[2];
if (!step) {
  console.error('usage: render:reference <step> [shot ids…]');
  process.exit(2);
}
const only = new Set(process.argv.slice(3));
const out = resolve(HERE, '../e2e/reference', step);
mkdirSync(out, { recursive: true });

const git = (cmd: string) => {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: GPU_ARGS });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem('vyuh.settings.v1', JSON.stringify({ graphics: 'HIGH' }));
  } catch {
    // Storage blocked: Auto is used and recorded below.
  }
});
const page = await context.newPage();
const gpu = await rendererString(page);
console.log('GPU:', gpu);
const record = {
  step,
  takenAt: new Date().toISOString(),
  gpu,
  commit: git('rev-parse --short HEAD'),
  uncommittedWebFiles: git('status --short -- apps/web packages/sim-core')
    .split('\n')
    .filter(Boolean),
  shots: [] as { file: string; url: string; simTMs: number }[],
};

for (const shot of SHOTS) {
  if (only.size > 0 && !only.has(shot.id)) continue;
  if (shot.scenarioFile) {
    const json = readFileSync(
      resolve(HERE, '../e2e/reference/scenarios', shot.scenarioFile),
      'utf8',
    );
    await page.goto(`${BASE}/dev/ui`);
    await page.evaluate((j) => sessionStorage.setItem('vyuh.hero.scenario', j), json);
  }
  const url = `${BASE}/dev/hero?${shot.query}${shot.live ? '' : '&pause=1'}`;
  await page.goto(url);
  await page.addStyleTag({ content: HIDE_DEV });
  await page.waitForFunction(() => window.__vyuhHero?.ready === true, null, { timeout: 180_000 });
  let simTMs = await page.evaluate(() => window.__vyuhHero?.tMs ?? -1);
  if (shot.live) {
    await page.getByText('TRK', { exact: true }).first().waitFor({ timeout: 90_000 });
    await page.waitForTimeout(3000); // cue framing zooms in once the tracker holds
    await page.keyboard.press('p');
    const clock = (await page.getByLabel('Session clock').textContent()) ?? '';
    const m = /(\d+):(\d+)/.exec(clock);
    simTMs = m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : -1;
  }
  await page.waitForTimeout(SETTLE_MS);
  const file = `${shot.id}-${shot.name}.jpg`;
  await page.screenshot({ path: resolve(out, file), type: 'jpeg', quality: 90 });
  record.shots.push({ file, url: url.replace(BASE, ''), simTMs });
  console.log(
    `${file}: ${Math.round(statSync(resolve(out, file)).size / 1024)} KB, t=${simTMs} ms`,
  );
}
await browser.close();
writeFileSync(resolve(out, 'shots.json'), `${JSON.stringify(record, null, 2)}\n`);
