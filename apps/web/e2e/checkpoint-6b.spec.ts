import { expect, test, type Page } from '@playwright/test';
import { login, openBriefing } from './helpers';

// Phase 6B Checkpoint B (tags @checkpoint @cp6b), written to e2e/checkpoint/6b/
// (git-ignored), at 1366×768 and 1920×1080. Works on a production build
// (E2E_BASE_URL) or the dev server. Screens changed in 6B that capture-all.spec.ts
// does not reach in the state that matters:
//  01  /train: S01–S03 thumbnails, Generate secondary
//  02  briefing S06: RELAY SITE label clear of the zone (P2-3)
//  03  briefing S05: interceptor ring label clear of Z2 (P2-3)
//  04  briefing S01: procedural-hills map
//  05  builder, Place asset active: hint on the map (P1-17)
//  06  builder, zone being drawn
//  07  builder, invalid swarm size: inline error

const OUT = 'e2e/checkpoint/6b';
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

async function coverageReady(page: Page) {
  await expect(page.getByTestId('coverage-status')).toHaveText(/^LOS coverage ·/, {
    timeout: 120_000,
  });
  await page.waitForTimeout(400);
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test(`training list @checkpoint @cp6b`, async ({ page }) => {
      await login(page, 'trainee1@demo');
      await page.goto('/train');
      await expect(page.getByTestId('scenario-S01')).toBeVisible({ timeout: 60_000 });
      await shot(page, '01-train');
    });

    for (const [n, code] of [
      ['02', 'S06'],
      ['03', 'S05'],
      ['04', 'S01'],
    ] as const) {
      test(`briefing ${code} @checkpoint @cp6b`, async ({ page }) => {
        test.setTimeout(240_000);
        await login(page, 'trainee1@demo');
        await openBriefing(page, code);
        await coverageReady(page);
        await shot(page, `${n}-briefing-${code}`);
      });
    }

    test(`builder tools @checkpoint @cp6b`, async ({ page }) => {
      test.setTimeout(180_000);
      await login(page, 'instructor@demo');
      await page.goto('/instructor/builder');
      const map = page.getByTestId('briefing-map');
      await expect(map).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId('builder-status')).toHaveText('Checks passed', {
        timeout: 60_000,
      });
      await page.getByRole('button', { name: 'Place asset' }).click();
      await expect(page.getByTestId('map-tool-hint')).toContainText('Esc cancels');
      await shot(page, '05-builder-asset-tool');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('map-tool-hint')).toBeHidden();

      await page.getByRole('button', { name: 'Draw no-kinetic zone' }).click();
      const box = (await map.boundingBox())!;
      for (const [fx, fy] of [
        [0.6, 0.3],
        [0.75, 0.3],
        [0.75, 0.42],
      ] as const)
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await expect(page.getByTestId('map-tool-hint')).toContainText('3 placed');
      await shot(page, '06-builder-zone-draft');
      await page.keyboard.press('Escape');

      await page.getByLabel('Swarm size').fill('80');
      await expect(page.getByText('A whole number from 1 to 50')).toBeVisible();
      await expect(page.getByTestId('builder-save')).toBeDisabled();
      await shot(page, '07-builder-field-error');
    });
  });
}
