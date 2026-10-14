import { expect, type Page } from '@playwright/test';

// Shared steps for the E2E specs. They drive the console as a trainee does
// (clicks and shortcuts); only time is controlled, through window.__vyuhE2E
// (lib/e2e/hook.ts, non-production builds only).

export const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
] as const;

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.selectOption('#email', email);
  await page.click('button[type=submit]');
  await page.waitForURL('**/train');
}

/** Open a scenario's briefing from the training list. */
export async function openBriefing(page: Page, code: string): Promise<void> {
  await page.goto('/train');
  await page.getByTestId(`scenario-${code}`).click();
  await expect(page.getByTestId('start-session')).toBeVisible();
}

/** Start the session and wait until the test hook holds it at t ≈ 0. */
export async function beginSession(page: Page): Promise<void> {
  await page.getByTestId('start-session').click();
  await expect(page.getByTestId('sim-player')).toBeVisible();
  await page.waitForFunction(() => window.__vyuhE2E !== undefined);
  // Fonts, terrain and the first frames.
  await page.waitForTimeout(500);
}

export async function stepTo(page: Page, tMs: number): Promise<number> {
  const t = await page.evaluate((target) => window.__vyuhE2E!.stepTo(target), tMs);
  await page.waitForTimeout(150);
  return t;
}

export const tMs = (page: Page) => page.evaluate(() => window.__vyuhE2E!.tMs());

/** Step in 1 s increments until the contact has an active track; returns its id. */
export async function stepUntilTracked(page: Page, contactId: string, limitMs = 300_000) {
  for (let t = await tMs(page); t <= limitMs; t += 1000) {
    await page.evaluate((target) => window.__vyuhE2E!.stepTo(target), t);
    const id = await page.evaluate((c) => window.__vyuhE2E!.trackFor(c), contactId);
    if (id) {
      await page.waitForTimeout(150);
      return id;
    }
  }
  throw new Error(`${contactId} was never tracked`);
}

/** Select a track by clicking its row, then let one tick apply it. */
export async function selectTrack(page: Page, trackId: string): Promise<void> {
  await page.locator(`tr[data-track-id="${trackId}"]`).click();
  await stepTo(page, (await tMs(page)) + 50);
  await expect(page.locator(`tr[data-track-id="${trackId}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/**
 * The WebGL canvas (terrain, models, EO video) is not pixel-stable between runs,
 * so screenshots hide it (the radar PPI, a labelled 2D canvas, stays); every DOM
 * overlay — 3D labels, EO gate and chips — stays in the picture.
 */
export const HIDE_WEBGL =
  '[data-testid=sim-player] canvas:not([aria-label]) { visibility: hidden !important; }';
