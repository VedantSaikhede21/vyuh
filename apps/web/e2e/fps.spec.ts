import { expect, test } from '@playwright/test';
import { login, openBriefing } from './helpers';

// FPS check (decision 45 method: headless Chrome, ANGLE D3D11, integrated GPU),
// tagged @fps so `pnpm e2e` skips it: run `pnpm --filter @vyuh/web e2e:fps`.
// S13 and S14 are real training sessions (instructor list), so the same spec
// measures a production build (E2E_BASE_URL). The 60-bird stress case needs the
// dev hero route and is skipped where it does not exist. Budget: SPEC §16, ≥ 30 fps.

const CASES = [
  { name: 'S13 Silent Ridge', code: 'S13' },
  { name: 'S14 Mixed Sky', code: 'S14' },
  { name: 'S14 + 60 birds (stress)', hero: 's=S14&t=30&birds=60' },
];
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];
const SAMPLE_MS = 10_000;

for (const vp of VIEWPORTS) {
  for (const c of CASES) {
    test(`${c.name} at ${vp.width}×${vp.height} @fps`, async ({ page }) => {
      await page.setViewportSize(vp);
      if (c.code) {
        await login(page, 'instructor@demo');
        await openBriefing(page, c.code);
        await page.getByTestId('start-session').click();
        await expect(page.getByTestId('sim-player')).toBeVisible();
        // Non-production builds hold the sim for screenshots: run it on the wall clock.
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
          window.__vyuhE2E?.stepTo(30_000);
          window.__vyuhE2E?.release();
        });
      } else {
        const res = await page.goto(`/dev/hero?${c.hero}`);
        test.skip(res?.status() === 404, 'dev hero route is not in production builds');
        await page.waitForFunction(() => window.__vyuhHero?.ready === true, null, {
          timeout: 120_000,
        });
      }
      await page.waitForTimeout(2000); // shader compile and first frames
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
        SAMPLE_MS,
      );
      const sorted = [...frames].sort((a, b) => a - b);
      const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
      const result = {
        meanFps: Math.round(1000 / mean),
        p95FrameMs: Math.round(p95 * 10) / 10,
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
