import { expect, test, type Page } from '@playwright/test';
import { SIM_VERSION } from '@vyuh/sim-core';
import { ADAPTIVE_PIXEL_RATIO_KEY } from '../lib/sim/pixel-ratio';
import { login, openBriefing } from './helpers';

// FPS check (decision 45 method: headless Chrome, ANGLE D3D11, integrated GPU),
// tagged @fps so `pnpm e2e` skips it: run `pnpm --filter @vyuh/web e2e:fps`
// (100 % display scaling) and `e2e:fps:150` (150 %: Windows display scaling is
// emulated as deviceScaleFactor 1.5, so the canvas renders up to 2.25× the pixels).
// S13 and S14 are real training sessions (instructor list), and the generated
// cases are created through POST /scenarios/generate as an instructor, so the
// same spec measures a production build (E2E_BASE_URL). The 60-bird stress case
// needs the dev hero route and is skipped where it does not exist.
// Budget: SPEC §16, ≥ 30 fps. Also reported: WebGL draw calls per frame (counted
// by wrapping the context's draw* calls), the scenario's entity count and the
// canvas pixel ratio actually used. Each case runs with the pixel ratio fixed
// (as in every other e2e run) and adaptive (PerformanceMonitor, as for users);
// FPS_MODES=fixed or FPS_MODES=adaptive runs one of them.
//
// Repeatable method (Phase 3b): before each case the browser idles on a blank
// page for FPS_COOLDOWN_MS (default 30 s) so heat from the previous case does
// not carry over; at the measuring time a 5 s warm-up window is discarded, then
// three 10 s windows are sampled and the median window (by mean FPS) is
// reported, with all three listed. For fully independent runs add
// `--repeat-each 3`.
//
// FPS_SELECT=1 (Phase 6B): before measuring, select and mark three tracks
// (Tab, D) so their 3D labels and the selected-track camera are part of the
// frame; without it the spec measures as before.

const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';

interface Case {
  name: string;
  code?: string;
  hero?: string;
  /** POST /scenarios/generate body (instructor). */
  generate?: Record<string, unknown>;
  /** Sim time to measure at (contacts airborne). */
  atMs: number;
}

const CASES: Case[] = [
  { name: 'S13 Silent Ridge (JK, buildings)', code: 'S13', atMs: 30_000 },
  { name: 'S14 Mixed Sky', code: 'S14', atMs: 30_000 },
  { name: 'S06 Crowded Skies (URBAN, 13.6 k buildings)', code: 'S06', atMs: 70_000 },
  {
    name: 'Generated JK D4 seed 37',
    generate: { terrainPreset: 'JK_MOUNTAIN', difficulty: 4, seed: 37 },
    atMs: 70_000,
  },
  {
    name: 'Generated PUNJAB D5 seed 6 (pop-downs, zones)',
    generate: { terrainPreset: 'PUNJAB_PLAINS', difficulty: 5, seed: 6 },
    atMs: 70_000,
  },
  {
    name: 'Generated JK D5 seed 6 (pop-downs)',
    generate: { terrainPreset: 'JK_MOUNTAIN', difficulty: 5, seed: 6 },
    atMs: 70_000,
  },
  {
    name: 'Generated PUNJAB D5 at the 60-entity cap',
    generate: {
      terrainPreset: 'PUNJAB_PLAINS',
      difficulty: 5,
      seed: 5001,
      swarmSize: 20,
      falseContactDensity: 'HIGH',
    },
    atMs: 70_000,
  },
  {
    name: 'Generated JK D5 at the 60-entity cap',
    generate: {
      terrainPreset: 'JK_MOUNTAIN',
      difficulty: 5,
      seed: 5001,
      swarmSize: 20,
      falseContactDensity: 'HIGH',
    },
    atMs: 70_000,
  },
  {
    name: 'Generated URBAN D5 seed 2 (13.6 k buildings)',
    generate: { terrainPreset: 'URBAN_GENERIC', difficulty: 5, seed: 2 },
    atMs: 70_000,
  },
  { name: 'S14 + 60 birds (stress)', hero: 's=S14&t=30&birds=60', atMs: 0 },
];
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];
/** Display scaling: title tag → deviceScaleFactor. */
const SCALES = [
  { tag: '@fps', factor: 1 },
  { tag: '@fps150', factor: 1.5 },
];
const WARMUP_MS = 5_000;
const WINDOW_MS = 10_000;
const WINDOWS = 3;
const COOLDOWN_MS = Number(process.env.FPS_COOLDOWN_MS ?? 30_000);
const MODES = (process.env.FPS_MODES ?? 'fixed,adaptive').split(',') as ('fixed' | 'adaptive')[];

/** Opt this page into the adaptive pixel ratio (fixed under automation by default). */
const ADAPTIVE = (key: string) => {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // about:blank has no storage
  }
};

/** Count WebGL draw calls (all contexts) into window.__vyuhDrawCalls. */
const COUNT_DRAWS = () => {
  const w = window as unknown as { __vyuhDrawCalls: number; __vyuhVertices: number };
  w.__vyuhDrawCalls = 0;
  w.__vyuhVertices = 0;
  // Vertices submitted per call (× instances): [count argument index, instances index].
  const calls: [string, number, number | null][] = [
    ['drawArrays', 2, null],
    ['drawElements', 1, null],
    ['drawArraysInstanced', 2, 3],
    ['drawElementsInstanced', 1, 4],
    ['drawRangeElements', 3, null],
  ];
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const [name, countArg, instArg] of calls) {
      const p = proto as unknown as Record<string, (...a: unknown[]) => unknown>;
      const orig = p[name];
      if (typeof orig !== 'function') continue;
      p[name] = function (this: unknown, ...args: unknown[]) {
        w.__vyuhDrawCalls++;
        w.__vyuhVertices +=
          Number(args[countArg] ?? 0) * (instArg === null ? 1 : Number(args[instArg] ?? 1));
        return orig.apply(this, args);
      };
    }
  }
};

async function startGenerated(page: Page, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ api, body, simVersion }) => {
      const token = window.localStorage.getItem('vyuh.localToken');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const gen = await fetch(`${api}/scenarios/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!gen.ok) throw new Error(`generate ${gen.status} ${await gen.text()}`);
      const g = (await gen.json()) as {
        scenarioId: string;
        scenario: { contacts: { isThreat: boolean }[] };
      };
      const ses = await fetch(`${api}/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ scenarioId: g.scenarioId, mode: 'PRACTICE', simVersion }),
      });
      if (!ses.ok) throw new Error(`session ${ses.status} ${await ses.text()}`);
      return {
        sessionId: ((await ses.json()) as { sessionId: string }).sessionId,
        entities: g.scenario.contacts.length,
        threats: g.scenario.contacts.filter((c) => c.isThreat).length,
      };
    },
    { api: API, body, simVersion: SIM_VERSION },
  );
}

/** Run the session to `atMs`: stepped by the test hook (dev) or on the wall clock (production). */
async function runTo(page: Page, atMs: number) {
  const hook = await page.evaluate(() => window.__vyuhE2E !== undefined);
  if (hook) {
    await page.evaluate((t) => {
      window.__vyuhE2E!.stepTo(t);
      window.__vyuhE2E!.release();
    }, atMs);
  } else {
    await page.waitForTimeout(atMs);
  }
}

interface FrameWindow {
  meanFps: number;
  p95FrameMs: number;
  drawCallsPerFrame: number;
  /** Vertices (index count for indexed draws) submitted per frame, all views. */
  kVerticesPerFrame: number;
}

/** Sample rAF frame times for `ms`; draw calls counted over the same frames. */
async function sampleWindow(page: Page, ms: number): Promise<FrameWindow> {
  const { frames, draws, vertices } = await page.evaluate(
    (ms) =>
      new Promise<{ frames: number[]; draws: number; vertices: number }>((resolve) => {
        const w = window as unknown as { __vyuhDrawCalls: number; __vyuhVertices: number };
        const out: number[] = [];
        const d0 = w.__vyuhDrawCalls;
        const v0 = w.__vyuhVertices;
        let last = performance.now();
        const t0 = last;
        const f = (now: number) => {
          out.push(now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(f);
          else
            resolve({
              frames: out,
              draws: w.__vyuhDrawCalls - d0,
              vertices: w.__vyuhVertices - v0,
            });
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
    drawCallsPerFrame: Math.round(draws / frames.length),
    kVerticesPerFrame: Math.round(vertices / frames.length / 1000),
  };
}

for (const scale of SCALES) {
  test.describe(`display scaling ${scale.factor * 100} %`, () => {
    test.use({ deviceScaleFactor: scale.factor });
    for (const vp of VIEWPORTS) {
      for (const c of CASES) {
        for (const mode of MODES) {
          const title = `${c.name} at ${vp.width}×${vp.height} ×${scale.factor} ${mode} ${scale.tag}`;
          test(title, async ({ page }) => {
            test.setTimeout(420_000);
            await page.goto('about:blank');
            await page.waitForTimeout(COOLDOWN_MS);
            await page.addInitScript(COUNT_DRAWS);
            if (mode === 'adaptive') await page.addInitScript(ADAPTIVE, ADAPTIVE_PIXEL_RATIO_KEY);
            await page.setViewportSize(vp);
            let entities: number | null = null;
            if (c.code || c.generate) {
              await login(page, 'instructor@demo');
              if (c.generate) {
                const g = await startGenerated(page, c.generate);
                entities = g.entities;
                // A session page opened directly starts by itself.
                await page.goto(`/train/session/${g.sessionId}`);
              } else {
                await openBriefing(page, c.code!);
                await page.getByTestId('start-session').click();
              }
              await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 60_000 });
              await page.waitForTimeout(1500);
              await runTo(page, c.atMs);
              if (process.env.FPS_SELECT === '1') {
                for (let i = 0; i < 3; i++) {
                  await page.keyboard.press('Tab');
                  await page.keyboard.press('d');
                }
              }
            } else {
              const res = await page.goto(`/dev/hero?${c.hero}`);
              test.skip(res?.status() === 404, 'dev hero route is not in production builds');
              await page.waitForFunction(() => window.__vyuhHero?.ready === true, null, {
                timeout: 120_000,
              });
            }
            await page.waitForTimeout(2000); // shader compile and first frames
            await sampleWindow(page, WARMUP_MS);
            const windows: FrameWindow[] = [];
            for (let i = 0; i < WINDOWS; i++) windows.push(await sampleWindow(page, WINDOW_MS));
            const median = [...windows].sort((a, b) => a.meanFps - b.meanFps)[1]!;
            const tracks = await page
              .getByRole('tab', { name: /Tracks/ })
              .textContent()
              .catch(() => null);
            const result = {
              ...median,
              windows: windows.map((w) => `${w.meanFps} fps / p95 ${w.p95FrameMs} ms`),
              entities,
              activeTracks: tracks ? Number(tracks.replace(/\D+/g, '')) : null,
              ...(await page.evaluate(() => {
                // The shared 3D canvas is the largest one (the radar PPI is a small 2D canvas).
                const canvas = [...document.querySelectorAll('canvas')].sort(
                  (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
                )[0];
                const gl = document.createElement('canvas').getContext('webgl');
                const ext = gl?.getExtension('WEBGL_debug_renderer_info');
                return {
                  devicePixelRatio: window.devicePixelRatio,
                  canvasPixelRatio: canvas
                    ? Math.round((canvas.width / canvas.clientWidth) * 100) / 100
                    : null,
                  gpu: ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
                };
              })),
            };
            console.log(`${title.replace(/ @fps\d*$/, '')}: ${JSON.stringify(result)}`);
            test.info().annotations.push({ type: 'fps', description: JSON.stringify(result) });
            expect(result.meanFps).toBeGreaterThanOrEqual(30);
          });
        }
      }
    }
  });
}
