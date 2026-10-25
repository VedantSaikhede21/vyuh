// Records the landing-page media from the real sim (DESIGN §11.1): the hero
// clip and poster, the kill-chain crops, the realism crops and the result
// screen (demo data). Re-run whenever the UI changes:
//
//   pnpm dev                                  # web :3000 + API :8000, demo data seeded
//   pnpm --filter @vyuh/web record:landing
//
// Uses the installed Chrome (decision 45 GPU flags) and the dev-only
// /dev/hero route (scripted ground-truth defender, decision 68). The clip is
// trimmed and re-encoded to VP8 with an ffmpeg that has libvpx: a Playwright
// ffmpeg build if one has it (the 1010 build does; 1013 does not), else set
// VYUH_FFMPEG to any ffmpeg with libvpx.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const OUT = resolve(import.meta.dirname, '../public/landing');
const LAUNCH = {
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
};
/** Hide Next's dev-only issue badge (React dev warnings from drei <Html> labels). */
const HIDE_DEV_OVERLAY = 'nextjs-portal { display: none !important; }';
const HERO = { s: 'S14', t: 98, seconds: 24 };

interface Encoder {
  path: string;
  /** Codec arguments for a WebM clip. */
  codec: string[];
}

const VP9 = ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33', '-row-mt', '1', '-cpu-used', '2'];
const VP8 = ['-c:v', 'libvpx', '-b:v', '1400k', '-crf', '8', '-auto-alt-ref', '0'];

function codecFor(path: string): string[] | null {
  const list = execFileSync(path, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (/\slibvpx-vp9\s/.test(list)) return VP9;
  if (/\slibvpx\s/.test(list)) return VP8;
  return null;
}

/** A WebM encoder: VYUH_FFMPEG, else the newest Playwright ffmpeg build with VP9 or VP8. */
function ffmpeg(): Encoder {
  const candidates: string[] = [];
  if (process.env.VYUH_FFMPEG) candidates.push(process.env.VYUH_FFMPEG);
  const root = join(homedir(), 'AppData/Local/ms-playwright');
  if (existsSync(root)) {
    for (const dir of readdirSync(root)
      .filter((d) => d.startsWith('ffmpeg'))
      .sort()
      .reverse()) {
      const exe = readdirSync(join(root, dir)).find((f) => /^ffmpeg.*\.exe$/.test(f));
      if (exe) candidates.push(join(root, dir, exe));
    }
  }
  for (const path of candidates) {
    const codec = codecFor(path);
    if (codec) return { path, codec };
  }
  throw new Error('No ffmpeg with a VP9 or VP8 encoder found: set VYUH_FFMPEG to one.');
}

async function heroReady(page: Page, query: string): Promise<void> {
  await page.goto(`${BASE}/dev/hero?${query}`);
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.waitForFunction(() => window.__vyuhHero?.ready === true, null, { timeout: 120_000 });
}

async function crop(target: Locator, file: string): Promise<void> {
  await target.screenshot({ path: join(OUT, file) });
  console.log('wrote', file);
}

async function recordHero(): Promise<void> {
  const dir = join(tmpdir(), `vyuh-hero-${Date.now()}`);
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await heroReady(page, `s=${HERO.s}&t=${HERO.t}&select=threat&zoom=4`);
  // Let the terrain and first frames draw: 1.5 s left the 3D view black at the start
  // of the loop on a busy machine (6C re-record).
  const start = (Date.now() - t0) / 1000 + 4;
  await page.waitForTimeout((HERO.seconds + 2) * 1000);
  const video = page.video();
  await ctx.close();
  await browser.close();
  const raw = await video?.path();
  if (!raw) throw new Error('no video recorded');
  const ff = ffmpeg();
  const cut = ['-y', '-loglevel', 'error', '-ss', start.toFixed(2), '-i', raw];
  execFileSync(ff.path, [
    ...cut,
    '-t',
    String(HERO.seconds),
    '-an',
    ...ff.codec,
    join(OUT, 'hero.webm'),
  ]);
  execFileSync(ff.path, [
    ...['-y', '-loglevel', 'error', '-ss', (start + 18).toFixed(2), '-i', raw],
    ...['-frames:v', '1', join(OUT, 'hero-poster.png')],
  ]);
  rmSync(dir, { recursive: true, force: true });
  console.log('wrote hero.webm, hero-poster.png');
}

async function recordCrops(): Promise<void> {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 2,
  });
  const panel = (title: string) =>
    page
      .locator('section', { has: page.getByRole('heading', { name: title, exact: true }) })
      .first();

  // Kill chain: DETECT (PPI), TRACK (track list), IDENTIFY (EO), DECIDE (actions), RESPOND (comms).
  await heroReady(page, 's=S14&t=40&defend=0&pause=1');
  await crop(panel('Radar PPI'), 'chain-detect.png');
  await heroReady(page, 's=S14&t=70&pause=1');
  await crop(page.locator('[role=tabpanel]').locator('..'), 'chain-track.png');
  await heroReady(page, 's=S14&t=25&select=T004&zoom=4');
  await page.waitForSelector('[data-eo-state=TRK]', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  await crop(page.locator('[aria-label^="EO/IR camera view"]').locator('..'), 'chain-identify.png');
  await heroReady(page, 's=S14&t=60&defend=0&select=threat&pause=1');
  await page.locator('[role=group][aria-label=Respond] span[tabindex="0"]').last().focus();
  await page.waitForTimeout(300);
  // The action bar's title changes with state (Practice next step, AI chip), so it is
  // found by its Respond group.
  const actions = await page
    .locator('section', { has: page.locator('[role=group][aria-label=Respond]') })
    .first()
    .boundingBox();
  if (actions) {
    await page.screenshot({
      path: join(OUT, 'chain-decide.png'),
      clip: actions,
    });
    console.log('wrote chain-decide.png');
  }
  // RESPOND: the first moment the visible Comms lines hold an order and its outcome,
  // so the crop shows a response (decision 148: the old fixed time showed classify lines).
  // The lines in view are kept for the caption and alt text.
  for (let t = 80; t <= 200; t += 10) {
    await heroReady(page, `s=S14&t=${t}&pause=1`);
    const comms = panel('Comms');
    const box = await comms.boundingBox();
    const lines = await comms.locator('li').evaluateAll(
      (els, b) =>
        els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return b !== null && r.top >= b.y && r.bottom <= b.y + b.height;
          })
          .map((el) => el.getAttribute('title') ?? ''),
      box,
    );
    const ordered = lines.some((l) => /ORDERED/.test(l));
    const outcome = lines.some((l) => /NEUTRALISED|MISSED|NO EFFECT|LINK LOST/.test(l));
    if (ordered && outcome) {
      respondLines = lines;
      await crop(comms, 'chain-respond.png');
      break;
    }
  }
  if (!respondLines) throw new Error('No S14 moment with an order and its outcome in Comms');

  // Realism: terrain (S13 mountains), night/IR (S12), silent link (S13 RF), false contacts (S14 birds).
  await heroReady(page, 's=S13&t=60&pause=1');
  await crop(page.locator('[aria-label="Tactical view"]'), 'realism-terrain.png');
  await heroReady(page, 's=S12&t=215&defend=0&select=threat&zoom=4&ir=1');
  await page.waitForSelector('[data-eo-state=TRK]', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  await crop(
    page.locator('[aria-label^="EO/IR camera view"]').locator('..'),
    'realism-night-ir.png',
  );
  await heroReady(page, 's=S13&t=200&defend=0&tab=rf&pause=1');
  const rf = await page.locator('[role=tabpanel]').locator('..').boundingBox();
  if (rf) {
    await page.screenshot({
      path: join(OUT, 'realism-silent.png'),
      clip: { ...rf, height: Math.min(rf.height, 120) },
    });
    console.log('wrote realism-silent.png');
  }
  await heroReady(page, 's=S14&t=45&defend=0&pause=1');
  await crop(panel('Radar PPI'), 'realism-false-contacts.png');

  // Measurement + ASSESS: a real session played by the defender, scored by the API.
  await page.setExtraHTTPHeaders({ 'X-Vyuh-Test-Debrief': 'template' });
  await page.goto(`${BASE}/login`);
  await page.selectOption('#email', 'trainee1@demo');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login')); // trainees land on Home
  await page.goto(`${BASE}/dev/hero?s=S01&submit=1`);
  await page.waitForSelector('[data-testid=result-screen]', { timeout: 180_000 });
  // The debrief must be written, not loading: the template one (no LLM spend), as the
  // e2e runs ask for it (decision 148; honoured only where dev login is enabled).
  await page.waitForSelector('[data-testid=debrief-body]', { timeout: 60_000 });
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  await page.waitForTimeout(1000);
  await crop(page.locator('[data-testid=result-screen]'), 'measure-result.png');
  await crop(panel('Score'), 'chain-assess.png');
  await browser.close();
}

/** Facts for the hero's telemetry strip, read from the recorded scenario's own file. */
function heroFacts(): Record<string, string | number> {
  const file = resolve(import.meta.dirname, `../../api/app/seed/scenarios/${HERO.s}.json`);
  const sc = JSON.parse(readFileSync(file, 'utf8')) as {
    name: string;
    terrain: { preset: string; origin: { lat: number; lon: number } };
    environment: { date: string; time: string; weather: { visibilityM: number } };
    roe: string;
    contacts: unknown[];
  };
  return {
    scenario: HERO.s,
    name: sc.name,
    preset: sc.terrain.preset,
    lat: sc.terrain.origin.lat,
    lon: sc.terrain.origin.lon,
    date: sc.environment.date,
    time: sc.environment.time,
    roe: sc.roe,
    visibilityKm: sc.environment.weather.visibilityM / 1000,
    contacts: sc.contacts.length,
  };
}

/** Comms lines shown in the Respond crop, captured when it is taken (P1-18 / decision 148). */
let respondLines: string[] | null = null;

/**
 * manifest.json: every PNG's pixel size (for <Image> width / height), the hero's
 * telemetry, and the Respond crop's real Comms lines, so its caption and alt text
 * always describe the picture. --manifest-only keeps the last recorded lines.
 */
function writeManifest(): void {
  const images: Record<string, { w: number; h: number }> = {};
  for (const f of readdirSync(OUT)
    .filter((x) => x.endsWith('.png'))
    .sort()) {
    const head = readFileSync(join(OUT, f)).subarray(16, 24);
    images[f.replace(/\.png$/, '')] = { w: head.readUInt32BE(0), h: head.readUInt32BE(4) };
  }
  const file = join(OUT, 'manifest.json');
  const previous = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { respond?: { lines: string[] } })
    : {};
  const manifest = {
    images,
    hero: heroFacts(),
    respond: { lines: respondLines ?? previous.respond?.lines ?? [] },
  };
  writeFileSync(
    file,
    `${JSON.stringify(manifest, null, 2)}
`,
  );
  console.log('wrote manifest.json');
}

mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--manifest-only')) {
  if (!process.argv.includes('--crops-only')) await recordHero();
  await recordCrops();
}
writeManifest();
