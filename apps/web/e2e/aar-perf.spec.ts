import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { login, openBriefing, sessionFromLog } from './helpers';

// Phase 4a close-out: replay FPS and memory on a production build (tag @fps-aar,
// skipped by `pnpm e2e`). Run with the API up and the web app built and started:
//   cd apps/web; pnpm build; pnpm start
//   $env:E2E_BASE_URL = "http://localhost:3000"; pnpm exec playwright test --grep @fps-aar
// For the live S06 player and the S06 replay it reports, separately:
//  - JS heap: peak `JSHeapUsedSize` of the page (CDP Performance.getMetrics), the
//    page's own JavaScript objects;
//  - Chrome process memory: peak private bytes summed over every Playwright Chrome
//    process (Windows), i.e. heap plus GPU, renderer, decoded textures and buffers.
// Replay FPS: rAF frame times while the replay plays at 1×, three 10 s windows
// after a 5 s warm-up, median window reported (same method as fps.spec.ts).

const sh = promisify(exec);
const WARMUP_MS = 5_000;
const WINDOW_MS = 10_000;
const WINDOWS = 3;
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];

async function chromePrivateMb(): Promise<number> {
  const ps =
    "$p = Get-CimInstance Win32_Process -Filter \\\"Name='chrome.exe'\\\" | Where-Object { $_.CommandLine -match 'playwright' }; " +
    '($p | Measure-Object PrivatePageCount -Sum).Sum';
  const { stdout } = await sh(`powershell -NoProfile -Command "${ps}"`);
  return Number(stdout.trim()) / 2 ** 20;
}

async function jsHeapMb(cdp: CDPSession): Promise<number> {
  const { metrics } = (await cdp.send('Performance.getMetrics')) as {
    metrics: { name: string; value: number }[];
  };
  return (metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 2 ** 20;
}

/** Samples both measures until stopped; returns their peaks. */
function sampleMemory(cdp: CDPSession) {
  let running = true;
  const peak = { heap: 0, process: 0 };
  const loop = (async () => {
    while (running) {
      const [heap, proc] = await Promise.all([jsHeapMb(cdp), chromePrivateMb()]);
      peak.heap = Math.max(peak.heap, heap);
      peak.process = Math.max(peak.process, proc);
    }
  })();
  return async () => {
    running = false;
    await loop;
    return { heapMb: Math.round(peak.heap), processMb: Math.round(peak.process) };
  };
}

async function frameWindow(page: Page, ms: number) {
  const frames = await page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = performance.now();
        const t0 = last;
        const f = (now: number) => {
          out.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(f);
          else resolve(out);
        };
        requestAnimationFrame(f);
      }),
    ms,
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  return {
    meanFps: Math.round(1000 / mean),
    p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)]! * 10) / 10,
  };
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp });

    test(`S06 replay FPS and memory @fps-aar`, async ({ page }) => {
      test.setTimeout(300_000);
      await login(page, 'trainee1@demo');
      const sid = await sessionFromLog(page, 'S06', 's06_trainee', 5);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const stop = sampleMemory(cdp);
      const t0 = Date.now();
      await page.goto(`/aar/session/${sid}`);
      await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
      const readyS = Math.round((Date.now() - t0) / 100) / 10;
      // Play at 1× from 01:00 (contacts up), ground truth on.
      for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('g');
      await page.keyboard.press('Space');
      await page.waitForTimeout(WARMUP_MS);
      const windows = [];
      for (let i = 0; i < WINDOWS; i++) windows.push(await frameWindow(page, WINDOW_MS));
      await page.keyboard.press('Space');
      // Seeks across the session (keyframe restores).
      for (const k of ['Home', 'End', 'Home']) await page.keyboard.press(k);
      const mem = await stop();
      const median = [...windows].sort((a, b) => a.meanFps - b.meanFps)[1]!;
      console.log(
        `AAR S06 replay ${vp.width}×${vp.height}: ready ${readyS} s; ` +
          `${median.meanFps} fps (p95 ${median.p95FrameMs} ms; windows ${windows.map((w) => w.meanFps).join(' / ')}); ` +
          `peak JS heap ${mem.heapMb} MB; peak Chrome private ${mem.processMb} MB`,
      );
      expect(median.meanFps).toBeGreaterThanOrEqual(30);
    });

    test(`S06 live player memory @fps-aar`, async ({ page }) => {
      test.setTimeout(300_000);
      await login(page, 'trainee1@demo');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const stop = sampleMemory(cdp);
      await openBriefing(page, 'S06');
      await page.getByTestId('start-session').click();
      await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 60_000 });
      // Production build: the sim runs on the wall clock; 70 s puts the town's tracks up.
      await page.waitForTimeout(70_000);
      const fps = await frameWindow(page, WINDOW_MS);
      const mem = await stop();
      console.log(
        `Live S06 player ${vp.width}×${vp.height}: ${fps.meanFps} fps; ` +
          `peak JS heap ${mem.heapMb} MB; peak Chrome private ${mem.processMb} MB`,
      );
    });
  });
}
