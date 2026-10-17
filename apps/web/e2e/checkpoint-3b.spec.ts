import { expect, test, type Page } from '@playwright/test';
import { VIEWPORTS, login, openBriefing } from './helpers';

// Phase 3b Checkpoint B captures (tag @checkpoint, not part of `pnpm e2e`):
//   pnpm --filter @vyuh/web e2e:checkpoint
// Writes PNGs to e2e/checkpoint/ for review against DESIGN §13: the training list,
// the Generate panel (idle, loading, rate-limited) and the briefing pages for S06
// (urban, no-kinetic zones) and S04 (night, border line), at both viewports.

const OUT = 'e2e/checkpoint';
const GENERATE = '**/scenarios/generate';

async function coverageReady(page: Page) {
  await expect(page.getByTestId('coverage-status')).toContainText('LOS coverage ·', {
    timeout: 120_000,
  });
  // Map image decode and one paint.
  await page.waitForTimeout(400);
}

for (const vp of VIEWPORTS) {
  test.describe(`Phase 3b checkpoint at ${vp.name} @checkpoint`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('training list and Generate panel', async ({ page }) => {
      test.setTimeout(180_000);
      await login(page, 'trainee1@demo');
      await expect(page.getByTestId('scenario-S15')).toBeVisible();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/3b-${vp.name}-01-training-list.png` });

      // Filters and sort live in the URL.
      await page.goto('/train?difficulty=4&sort=name');
      await expect(page.getByTestId('scenario-S07')).toBeVisible();
      await page.screenshot({ path: `${OUT}/3b-${vp.name}-02-list-filtered.png` });

      // Loading: hold the response for a while.
      await page.goto('/train');
      await expect(page.getByTestId('generate-panel')).toBeVisible();
      await page.route(GENERATE, async (route) => {
        await new Promise((r) => setTimeout(r, 3000));
        await route.abort();
      });
      await page.getByTestId('gen-submit').click();
      await expect(page.getByTestId('gen-submit')).toContainText('Generating scenario');
      await page.getByTestId('generate-panel').screenshot({
        path: `${OUT}/3b-${vp.name}-03-generate-loading.png`,
      });
      await expect(page.getByTestId('generate-panel')).toContainText('Could not generate', {
        timeout: 10_000,
      });
      await page.getByTestId('generate-panel').screenshot({
        path: `${OUT}/3b-${vp.name}-04-generate-error.png`,
      });

      // Rate-limited: the API's 429 envelope with retryAfterS.
      await page.unroute(GENERATE);
      await page.route(GENERATE, (route) =>
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many generate requests',
              details: { retryAfterS: 42 },
            },
          }),
        }),
      );
      await page.getByTestId('gen-submit').click();
      await expect(page.getByTestId('gen-submit')).toContainText('Rate limited');
      await page.getByTestId('generate-panel').screenshot({
        path: `${OUT}/3b-${vp.name}-05-generate-rate-limited.png`,
      });
      await page.unroute(GENERATE);
      await page.goto('/train');
      await page.getByTestId('generate-panel').screenshot({
        path: `${OUT}/3b-${vp.name}-06-generate-idle.png`,
      });
    });

    for (const code of ['S06', 'S04'] as const) {
      test(`briefing ${code}`, async ({ page }) => {
        test.setTimeout(240_000);
        await login(page, 'trainee1@demo');
        await openBriefing(page, code);
        await coverageReady(page);
        await page.screenshot({ path: `${OUT}/3b-${vp.name}-07-briefing-${code}.png` });
      });
    }

    test('briefing S05, coverage at 15 m (valley masking)', async ({ page }) => {
      test.setTimeout(240_000);
      await login(page, 'trainee1@demo');
      await openBriefing(page, 'S05');
      await coverageReady(page);
      await page.getByRole('radio', { name: '15 m' }).click();
      await expect(page.getByTestId('coverage-status')).toContainText('15 m AGL', {
        timeout: 120_000,
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/3b-${vp.name}-08-briefing-S05-15m.png` });
    });
  });
}
