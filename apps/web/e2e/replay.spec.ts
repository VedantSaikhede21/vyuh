import { expect, test } from '@playwright/test';
import { SIM_VERSION } from '@vyuh/sim-core';
import { login, sessionFromLog } from './helpers';

// AAR replay (Phase 4a): a log recorded by sim-core in Node replays exactly in
// Chrome (decision 111) and can be scrubbed by keyboard; an older sim version
// falls back to the event timeline (decision 109).

test('a recorded session replays exactly and scrubs by keyboard', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'trainee1@demo');
  // S04 on PUNJAB_PLAINS (terrain revision 2): reports, camera locks, a jam.
  const sid = await sessionFromLog(page, 'S04', 's04_reports', SIM_VERSION);
  await page.goto(`/aar/session/${sid}`);
  await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('replay-chip')).toBeVisible();
  // Opens at the first radar track, not on an empty scene (audit P1-14).
  await expect(page.locator('tr[data-track-id]').first()).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('replay-clock')).toHaveText(/^00:00/);

  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('replay-clock')).toHaveText(/^01:00/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('replay-clock')).toHaveText(/^00:59/);
  await page.keyboard.press('End');
  await expect(page.getByTestId('kill-chain')).toBeVisible();

  // A kill-chain stage jumps the replay to its moment.
  const cell = page.locator('[data-testid^="kc-"][data-testid$="-DETECT"]').first();
  await cell.click();
  await expect(page.getByTestId('kill-chain-detail')).toContainText('Detect');
  await expect(page.getByTestId('replay-clock')).not.toHaveText(/^0[3-9]:/);

  // Ground truth only on request.
  await expect(page.getByTestId('truth-labels')).toHaveCount(0);
  await expect(page.getByTestId('truth-toggle')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('g');
  await expect(page.getByTestId('truth-labels')).toHaveCount(1);
  await expect(page.getByTestId('truth-toggle')).toHaveAttribute('aria-checked', 'true');
});

test('a session from an older simulator version falls back to the timeline', async ({ page }) => {
  await login(page, 'trainee1@demo');
  const sid = await sessionFromLog(page, 'S01', 's01_defended', 4);
  await page.goto(`/aar/session/${sid}`);
  await expect(page.getByTestId('replay-fallback')).toContainText(
    'This session used an older simulator version — showing the event timeline only, not a replay.',
  );
  await expect(page.getByTestId('kill-chain')).toBeVisible();
});

test('result-screen penalties open the replay at their moment', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'trainee1@demo');
  // S06 Assessment (default_v4): intercepts blocked for the ROE and the town, each timed.
  const sid = await sessionFromLog(page, 'S06', 's06_roe_attempts', SIM_VERSION);
  await page.goto(`/train/session/${sid}`);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  const link = page.getByTestId('penalty-link').first();
  const when = (await link.textContent())!.trim();
  expect(when).toMatch(/^\d\d:\d\d$/);
  await link.click();
  await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('replay-clock')).toHaveText(new RegExp(`^${when}`));
});

test('the result screen explains why an old session cannot be replayed', async ({ page }) => {
  await login(page, 'trainee1@demo');
  const sid = await sessionFromLog(page, 'S01', 's01_defended', 4);
  await page.goto(`/train/session/${sid}`);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('open-replay')).toBeDisabled();
  // A disabled button gets no pointer events: its tooltip wrapper does.
  await page.getByTestId('open-replay').locator('..').hover();
  await expect(page.getByRole('tooltip')).toContainText('Recorded on simulator version 4');
  await page.getByTestId('open-timeline').click();
  await expect(page.getByTestId('replay-fallback')).toBeVisible();
});
