import { expect, test } from '@playwright/test';
import { beginSession, login, openBriefing, stepTo, stepUntilTracked, tMs } from './helpers';

// System plan S2: an accidental reload must not lose a run. The sim rebuilds from
// the tab's stored commands, so the session carries on at the same sim time.
test('a reloaded session resumes where it stopped', async ({ page }) => {
  await login(page, 'e2e@demo');
  await openBriefing(page, 'S01');
  await beginSession(page);
  await page.waitForFunction(() => window.__vyuhE2E !== undefined);
  await stepUntilTracked(page, 'c01');
  await page.keyboard.press('Tab');
  await stepTo(page, (await tMs(page)) + 100);
  await page.keyboard.press('d');
  await stepTo(page, (await tMs(page)) + 100);
  const at = await tMs(page);
  await expect(page.getByTestId('sim-player')).toBeVisible();
  // An event batch reaches the server, which makes the session ACTIVE.
  await page.waitForTimeout(3000);

  await page.reload();
  await expect(page.getByTestId('resume-screen')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('resume-session').click();
  await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/MARKED DETECTED/).first()).toBeVisible();
  expect(await tMs(page)).toBeGreaterThanOrEqual(at);
});
