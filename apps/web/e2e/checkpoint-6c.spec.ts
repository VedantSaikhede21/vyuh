import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Phase 6C Checkpoint C (tags @checkpoint @cp6c), written to e2e/checkpoint/6c/
// (git-ignored). Every new signed-in page at 1366×768 and 1920×1080; public pages
// (landing, login, guest entry, sources, status) also at 390×844. Works on a
// production build (E2E_BASE_URL) or the dev server.

const OUT = 'e2e/checkpoint/6c';
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

const PUBLIC_SIZES = [...SIZES, { width: 390, height: 844 }] as const;

for (const size of PUBLIC_SIZES) {
  test.describe(`public ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test(`status @checkpoint @cp6c`, async ({ page }) => {
      await page.goto('/status');
      await expect(page.getByTestId('status-chip').nth(1)).toHaveText(/OK|Down/, {
        timeout: 30_000,
      });
      await shot(page, 'status');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
