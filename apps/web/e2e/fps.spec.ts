import { expect, test, type Page } from '@playwright/test';
import { login, openBriefing } from './helpers';

// FPS check (decision 45 method: headless Chrome, ANGLE D3D11, integrated GPU),
// tagged @fps so `pnpm e2e` skips it: run `pnpm --filter @vyuh/web e2e:fps`.
// S13 and S14 are real training sessions (instructor list), and the generated
// cases are created through POST /scenarios/generate as an instructor, so the
// same spec measures a production build (E2E_BASE_URL). The 60-bird stress case
// needs the dev hero route and is skipped where it does not exist.
// Budget: SPEC §16, ≥ 30 fps. Also reported: WebGL draw calls per frame (counted
// by wrapping the context's draw* calls) and the scenario's entity count.

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
  { name: 'S14 + 60 birds (stress)', hero: 's=S14&t=30&birds=60', atMs: 0 },
];
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];
const SAMPLE_MS = 10_000;

/** Count WebGL draw calls (all contexts) into window.__vyuhDrawCalls. */
const COUNT_DRAWS = () => {
  const w = window as unknown as { __vyuhDrawCalls: number };
  w.__vyuhDrawCalls = 0;
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const name of [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
      'drawRangeElements',
    ]) {
      const p = proto as unknown as Record<string, (...a: unknown[]) => unknown>;
      const orig = p[name];
      if (typeof orig !== 'function') continue;
      p[name] = function (this: unknown, ...args: unknown[]) {
        w.__vyuhDrawCalls++;
        return orig.apply(this, args);
      };
    }
  }
};

async function startGenerated(page: Page, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ api, body }) => {
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
        body: JSON.stringify({ scenarioId: g.scenarioId, mode: 'PRACTICE', simVersion: 3 }),
      });
      if (!ses.ok) throw new Error(`session ${ses.status} ${await ses.text()}`);
      return {
        sessionId: ((await ses.json()) as { sessionId: string }).sessionId,
        entities: g.scenario.contacts.length,
        threats: g.scenario.contacts.filter((c) => c.isThreat).length,
      };
    },
    { api: API, body },
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

for (const vp of VIEWPORTS) {
  for (const c of CASES) {
    test(`${c.name} at ${vp.width}×${vp.height} @fps`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.addInitScript(COUNT_DRAWS);
      await page.setViewportSize(vp);
      let entities: number | null = null;
      if (c.code || c.generate) {
        await login(page, 'instructor@demo');
        if (c.generate) {
          const g = await startGenerated(page, c.generate);
          entities = g.entities;
          await page.goto(`/train/session/${g.sessionId}`);
        } else {
          await openBriefing(page, c.code!);
        }
        await page.getByTestId('start-session').click();
        await expect(page.getByTestId('sim-player')).toBeVisible();
        await page.waitForTimeout(1500);
        await runTo(page, c.atMs);
      } else {
        const res = await page.goto(`/dev/hero?${c.hero}`);
        test.skip(res?.status() === 404, 'dev hero route is not in production builds');
        await page.waitForFunction(() => window.__vyuhHero?.ready === true, null, {
          timeout: 120_000,
        });
      }
      await page.waitForTimeout(2000); // shader compile and first frames
      const sample = await page.evaluate(
        (ms) =>
          new Promise<{ frames: number[]; draws: number }>((resolve) => {
            const w = window as unknown as { __vyuhDrawCalls: number };
            const out: number[] = [];
            const d0 = w.__vyuhDrawCalls;
            let last = performance.now();
            const t0 = last;
            const f = (now: number) => {
              out.push(now - last);
              last = now;
              if (now - t0 < ms) requestAnimationFrame(f);
              else resolve({ frames: out, draws: w.__vyuhDrawCalls - d0 });
            };
            requestAnimationFrame(f);
          }),
        SAMPLE_MS,
      );
      const { frames } = sample;
      const sorted = [...frames].sort((a, b) => a - b);
      const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
      const tracks = await page
        .getByRole('tab', { name: /Tracks/ })
        .textContent()
        .catch(() => null);
      const result = {
        meanFps: Math.round(1000 / mean),
        p95FrameMs: Math.round(p95 * 10) / 10,
        drawCallsPerFrame: Math.round(sample.draws / frames.length),
        entities,
        activeTracks: tracks ? Number(tracks.replace(/\D+/g, '')) : null,
        frames: frames.length,
        gpu: await page.evaluate(() => {
          const gl = document.createElement('canvas').getContext('webgl');
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
        }),
      };
      console.log(`${c.name} ${vp.width}×${vp.height}: ${JSON.stringify(result)}`);
      test.info().annotations.push({ type: 'fps', description: JSON.stringify(result) });
      expect(result.meanFps).toBeGreaterThanOrEqual(30);
    });
  }
}
