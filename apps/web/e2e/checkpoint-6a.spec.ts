import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Phase 6A Checkpoint A (tag @checkpoint), written to e2e/checkpoint/6a/
// (git-ignored), at 1366×768 and 1920×1080. Runs on the dev server, because
// /dev/ui does not exist in production builds (decision 63).
//  01  /dev/ui design gallery (full page)
//  02  /dev/ui dialog open
//  03  /train as trainee1@demo (shell, page header)
//  04  /aar/trends as trainee1@demo
//  05  /instructor as instructor@demo (staff nav, Scoring weights)
//  06  /instructor/text as instructor@demo (Builder active, breadcrumbs, sub-nav)
//  07  user menu open
//  08  404

const OUT = 'e2e/checkpoint/6a';
const SIZES = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const;

async function shot(page: Page, name: string, full = false) {
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

    test(`gallery @checkpoint @cp6a`, async ({ page }) => {
      await page.goto('/dev/ui');
      await expect(page.getByRole('heading', { name: 'Design gallery' })).toBeVisible();
      await shot(page, '01-gallery', true);
      await page.getByTestId('g-open-dialog').click();
      await expect(page.getByTestId('g-dialog')).toBeVisible();
      await shot(page, '02-gallery-dialog');
    });

    test(`trainee shell @checkpoint @cp6a`, async ({ page }) => {
      await login(page, 'trainee1@demo');
      await page.goto('/train');
      await expect(page.getByTestId('shell-top-bar')).toBeVisible();
      await expect(page.getByTestId('nav-training')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('table').first()).toBeVisible({ timeout: 60_000 });
      await shot(page, '03-train');
      await page.getByTestId('nav-aar').click();
      await expect(page.getByTestId('nav-aar')).toHaveAttribute('aria-current', 'page');
      await page.waitForLoadState('networkidle');
      await shot(page, '04-trends');
      await page.getByTestId('user-menu').click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(page.getByTestId('menu-help')).toBeFocused();
      await shot(page, '07-user-menu');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toBeHidden();
      await expect(page.getByTestId('user-menu')).toBeFocused();
    });

    test(`instructor shell @checkpoint @cp6a`, async ({ page }) => {
      await login(page, 'instructor@demo');
      await page.goto('/instructor');
      await expect(page.getByTestId('nav-unit')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('unit-dashboard')).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState('networkidle');
      await shot(page, '05-unit');
      await page.goto('/instructor/text');
      await expect(page.getByTestId('nav-builder')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('from-text')).toBeVisible({ timeout: 60_000 });
      await shot(page, '06-from-text');
    });

    test(`not found @checkpoint @cp6a`, async ({ page }) => {
      await login(page, 'trainee1@demo');
      await page.goto('/no-such-page');
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      await shot(page, '08-not-found');
    });
  });
}
