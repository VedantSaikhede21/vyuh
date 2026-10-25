import { expect, test, type Page } from '@playwright/test';
import { beginSession, login, openBriefing, selectTrack, stepUntilTracked } from './helpers';

const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';

// Phase 6C Checkpoint C (tags @checkpoint @cp6c), written to e2e/checkpoint/6c/
// (git-ignored). Every new signed-in page at 1366×768 and 1920×1080; public pages
// (landing, login, guest entry, sources, status) also at 390×844. Works on a
// production build (E2E_BASE_URL) or the dev server.

const OUT = 'e2e/checkpoint/6c';

/** Horizontal overflow in px (public pages must have none from 360 px up). */
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const SIZES = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const;

async function shot(page: Page, name: string, full = true) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(300);
  const size = page.viewportSize();
  await page.screenshot({
    path: `${OUT}/${size?.width}x${size?.height}-${name}.png`,
    fullPage: full,
  });
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test(`threat library @checkpoint @cp6c`, async ({ page }) => {
      await login(page, 'trainee1@demo');
      await page.goto('/library');
      await expect(page.getByTestId('library-row')).toHaveCount(10);
      await shot(page, 'library');
      await page.getByRole('radio', { name: 'Friendly' }).click();
      await expect(page.getByTestId('library-row')).toHaveCount(2);
      await shot(page, 'library-friendly', false);
      await page.goto('/library/FPV');
      await expect(page.getByTestId('library-entry')).toBeVisible();
      await shot(page, 'library-entry');
    });

    test(`help, settings, notices @checkpoint @cp6c`, async ({ page }) => {
      await login(page, 'trainee1@demo');
      await page.goto('/help');
      await expect(page.getByTestId('help-components')).toBeVisible({ timeout: 30_000 });
      await shot(page, 'help');
      await page.goto('/settings');
      await expect(page.getByTestId('settings')).toBeVisible();
      await shot(page, 'settings', false);
      await page.goto('/notices');
      await expect(page.getByTestId('notice').first()).toBeVisible({ timeout: 30_000 });
      await shot(page, 'notices');
    });
  });
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height} record and home`, () => {
    test.use({ viewport: size });

    test(`operator home @checkpoint @cp6c`, async ({ page }) => {
      await login(page, 'trainee3@demo');
      await page.goto('/home');
      await expect(page.getByTestId('home-losing')).toBeVisible({ timeout: 30_000 });
      await shot(page, 'home');
      // First run: the same page with an empty history (response rewritten in flight).
      await page.route('**/api/v1/home', async (route) => {
        const res = await route.fetch();
        const body = await res.json();
        await route.fulfill({
          response: res,
          json: {
            ...body,
            assignment: null,
            openAssignments: 0,
            assessments: 0,
            demoAssessments: 0,
            recent: [],
            stages: body.stages.map((s: object) => ({ ...s, ok: 0, total: 0, rate: null })),
          },
        });
      });
      await page.reload();
      await expect(page.getByTestId('home-welcome')).toBeVisible({ timeout: 30_000 });
      await shot(page, 'home-first-run');
    });

    test(`service record @checkpoint @cp6c`, async ({ page }) => {
      await login(page, 'trainee3@demo');
      await page.goto('/record');
      await expect(page.getByTestId('levels')).toBeVisible({ timeout: 30_000 });
      await shot(page, 'record-trainee');
      await page.emulateMedia({ media: 'print' });
      await shot(page, 'record-print');
      await page.emulateMedia({ media: 'screen' });
    });

    test(`staff: readiness, sign-off, live, remark @checkpoint @cp6c`, async ({ page }) => {
      await login(page, 'instructor@demo');
      await page.goto('/instructor/readiness');
      await expect(page.getByTestId('readiness-row').first()).toBeVisible({ timeout: 60_000 });
      await shot(page, 'readiness');
      await page.getByTestId('readiness-row').filter({ hasText: 'Trainee 3' }).first().click();
      await expect(page.getByTestId('signoff')).toBeVisible({ timeout: 30_000 });
      await shot(page, 'record-staff');
      await page.getByTestId('signoff').click();
      await shot(page, 'record-staff-confirm', false);

      // Live: one running session for a trainee in the unit, started through the API.
      const tr = await page.request.post(`${API}/auth/dev-login`, {
        data: { email: 'trainee1@demo' },
      });
      const auth = { Authorization: `Bearer ${(await tr.json()).accessToken}` };
      const list = await (await page.request.get(`${API}/scenarios`, { headers: auth })).json();
      const s15 = list.items.find((x: { code: string }) => x.code === 'S15');
      const detail = await (
        await page.request.get(`${API}/scenarios/${s15.id}`, { headers: auth })
      ).json();
      const created = await (
        await page.request.post(`${API}/sessions`, {
          headers: auth,
          data: { scenarioId: s15.id, mode: 'PRACTICE', simVersion: 6 },
        })
      ).json();
      await page.request.post(`${API}/sessions/${created.sessionId}/events`, {
        headers: auth,
        data: {
          batchSeq: 0,
          events: [
            {
              seq: 0,
              tMs: 0,
              type: 'SESSION_STARTED',
              payload: { mode: 'PRACTICE', scenarioId: 'S15', seed: detail.scenario.seed },
            },
          ],
        },
      });
      await page.goto('/instructor/live');
      await expect(page.getByTestId('live')).toBeVisible({ timeout: 30_000 });
      await shot(page, 'live');
    });

    test(`AAR remarks tab @checkpoint @cp6c`, async ({ page }) => {
      await login(page, 'trainee1@demo');
      await page.goto('/notices');
      const remark = page.getByTestId('notice').filter({ hasText: 'Remark from' }).first();
      await expect(remark).toBeVisible({ timeout: 30_000 });
      await remark.getByRole('link').click();
      await expect(page.getByTestId('remarks')).toBeVisible({ timeout: 60_000 });
      await shot(page, 'aar-remarks', false);
    });

    test(`player library dialog @checkpoint @cp6c`, async ({ page }) => {
      test.setTimeout(240_000);
      await login(page, 'trainee1@demo');
      await openBriefing(page, 'S15');
      await beginSession(page);
      const track = await stepUntilTracked(page, 'c01');
      await selectTrack(page, track);
      await page.keyboard.press('l');
      await expect(page.getByTestId('library-dialog')).toBeVisible();
      await shot(page, 'player-library', false);
    });
  });
}

const PUBLIC_SIZES = [...SIZES, { width: 390, height: 844 }] as const;

for (const size of PUBLIC_SIZES) {
  test.describe(`public ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test(`landing, login, sources @checkpoint @cp6c`, async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('chain-explorer')).toBeVisible({ timeout: 60_000 });
      // Full page: the lazy pictures load as the page scrolls.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 80));
        }
        window.scrollTo(0, 0);
      });
      await shot(page, 'landing');
      await shot(page, 'landing-fold', false);
      await page.getByRole('tab', { name: /Respond/ }).click();
      await page.getByTestId('chain-explorer').scrollIntoViewIfNeeded();
      await shot(page, 'landing-chain-respond', false);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.goto('/login');
      await expect(page.locator('#email')).toBeVisible({ timeout: 30_000 });
      await shot(page, 'login', false);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.goto('/sources');
      await expect(page.getByTestId('sources-topic').first()).toBeVisible({ timeout: 30_000 });
      await shot(page, 'sources');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // Guest entry exists only with NEXT_PUBLIC_GUEST_MODE=true (switched on in 6E).
      const demo = await page.goto('/demo');
      if (demo?.status() === 200) {
        await expect(page.getByTestId('demo-path')).toBeVisible();
        await shot(page, 'demo');
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      }
    });

    test(`status @checkpoint @cp6c`, async ({ page }) => {
      await page.goto('/status');
      await expect(page.getByTestId('status-chip').nth(1)).toHaveText(/OK|Down/, {
        timeout: 30_000,
      });
      await shot(page, 'status');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
