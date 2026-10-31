import { expect, test, type Page } from '@playwright/test';
import { awaitSession, login, openBriefing, stepTo } from './helpers';

// A run the trainee ends early is never a final score (decision 173).

async function endEarly(page: Page, mode: 'Practice' | 'Assessment') {
  await login(page, 'e2e@demo');
  await openBriefing(page, 'S01');
  await page.getByRole('radio', { name: mode }).click();
  await page.getByTestId('start-session').click();
  await awaitSession(page);
  await stepTo(page, 1000);
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: /Confirm end/ }).click();
}

test('an Assessment ended early says it is not scored, also after a reload', async ({ page }) => {
  await endEarly(page, 'Assessment');
  await expect(page.getByTestId('not-scored')).toContainText('not scored');
  await expect(page.getByTestId('score-total')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('not-scored')).toBeVisible();
});

test('a Practice run ended early shows feedback and no total', async ({ page }) => {
  await endEarly(page, 'Practice');
  await expect(page.getByTestId('partial-run')).toBeVisible();
  await expect(page.getByTestId('score-total')).toHaveCount(0);
  await expect(page.getByTestId('debrief-source')).toContainText('Run ended early');
});
