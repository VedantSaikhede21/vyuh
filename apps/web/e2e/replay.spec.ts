import { expect, test } from '@playwright/test';
import { login, sessionFromLog } from './helpers';

// AAR replay (Phase 4a): a log recorded by sim-core in Node replays exactly in
// Chrome (decision 111) and can be scrubbed by keyboard; an older sim version
// falls back to the event timeline (decision 109).

test('a recorded session replays exactly and scrubs by keyboard', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'trainee1@demo');
  // S04 on PUNJAB_PLAINS (terrain revision 2): reports, camera locks, a jam.
  const sid = await sessionFromLog(page, 'S04', 's04_reports', 5);
  await page.goto(`/aar/session/${sid}`);
  await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('replay-chip')).toBeVisible();
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
  await page.keyboard.press('g');
  await expect(page.getByTestId('truth-labels')).toHaveCount(1);
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
