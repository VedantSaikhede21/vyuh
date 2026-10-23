import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Phase 4b checkpoint captures at 1366×768 (tag @checkpoint), written to
// e2e/checkpoint/ (git-ignored). Needs the seeded demo history (`pnpm seed`).
//  01  trainee trends (trainee1@demo): every chart with its question and answer
//  02  unit dashboard (instructor@demo, Demo Unit Alpha)
// Older e2e specs play as trainee1@demo; run `pnpm seed:reset-demo --yes` first so
// only the seeded history is shown (decision 126).
//  03  scenario builder: asset placed, a no-kinetic zone drawn, checks passed
//  04  scenario builder: static check failures
//  05  training list with Assigned badges (trainee2@demo)
//  06  scoring weights

const OUT = 'e2e/checkpoint';
const VP = { width: 1366, height: 768 };

async function shot(page: Page, name: string) {
  // The Next.js dev indicator is not part of the app.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.screenshot({ path: `${OUT}/4b-1366x768-${name}.png` });
  await page.screenshot({ path: `${OUT}/4b-1366x768-${name}-full.png`, fullPage: true });
}

/** Click the briefing map at a fraction of its size. */
async function clickMap(page: Page, fx: number, fy: number) {
  const box = await page.getByTestId('briefing-map').boundingBox();
  if (!box) throw new Error('map not visible');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test.use({ viewport: VP });

test('trainee trends @checkpoint', async ({ page }) => {
  await login(page, 'trainee1@demo');
  await page.goto('/aar/trends');
  await expect(page.getByTestId('chart-score').getByTestId('answer')).not.toHaveText('', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('demo-badge')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, '01-trends');
});

test('unit dashboard @checkpoint', async ({ page }) => {
  await login(page, 'instructor@demo');
  await page.goto('/instructor');
  await expect(page.getByRole('heading', { name: 'Demo Unit Alpha' })).toBeVisible();
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, '02-unit');
});

test('scenario builder @checkpoint', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'instructor@demo');
  await page.goto('/instructor/builder');
  await expect(page.getByTestId('briefing-map')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('builder-status')).toHaveText('Checks passed', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Place asset' }).click();
  await clickMap(page, 0.5, 0.5);
  await page.getByRole('button', { name: 'Draw no-kinetic zone' }).click();
  for (const [x, y] of [
    [0.56, 0.4],
    [0.63, 0.4],
    [0.64, 0.47],
    [0.57, 0.48],
  ] as const)
    await clickMap(page, x, y);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('builder-status')).toHaveText('Checks passed', { timeout: 60_000 });
  await page.waitForTimeout(1500); // LOS coverage shading
  await shot(page, '03-builder');

  // A zone over the asset fails the static checks.
  await page.getByRole('button', { name: 'Draw no-kinetic zone' }).click();
  for (const [x, y] of [
    [0.47, 0.47],
    [0.53, 0.47],
    [0.53, 0.53],
    [0.47, 0.53],
  ] as const)
    await clickMap(page, x, y);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('builder-status')).toContainText('problem', { timeout: 60_000 });
  await shot(page, '04-builder-problems');
});

test('training list with assignments @checkpoint', async ({ page }) => {
  await login(page, 'trainee2@demo');
  await page.goto('/train');
  await expect(page.getByTestId('assigned-badge').first()).toBeVisible();
  await shot(page, '05-train-assigned');
});

test('scoring weights @checkpoint', async ({ page }) => {
  await login(page, 'instructor@demo');
  await page.goto('/instructor/scoring');
  await expect(page.getByTestId('weights')).toBeVisible();
  await page.getByLabel('Report weight').or(page.getByLabel('Contact report weight')).fill('20');
  await shot(page, '06-scoring');
});
