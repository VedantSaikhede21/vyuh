import { expect, test, type Page } from '@playwright/test';
import { SIM_VERSION } from '@vyuh/sim-core';
import {
  awaitSession,
  login,
  openBriefing,
  selectTrack,
  sessionFromLog,
  stepTo,
  stepUntilTracked,
  tMs,
} from './helpers';

// Phase 5 checkpoint captures at 1366×768 (tag @checkpoint), written to
// e2e/checkpoint/ (git-ignored). Two runs, against an API started with the LLM off
// (@cp5-off) and then with LLM_BASE_URL pointing at an OpenAI-compatible server
// (@cp5-on; a local stub on a machine without an OpenRouter key).
//  01  result screen, template debrief (LLM off) and the Elo change
//  02  scenario from text, disabled with its reason (LLM off)
//  03  result screen, LLM debrief
//  04  scenario from text, parsed parameters
//  05  S15: AI chip on the selected bird track (a wrong suggestion)
//  06  S15: spectrogram of a bird
//  07  S15: spectrogram of the quad
//  08  AAR: over-trust insight (wrong suggestion accepted, right one rejected)
//  09  trends: rating and AI trust (trainee1@demo demo history)

const OUT = 'e2e/checkpoint';
test.use({ viewport: { width: 1366, height: 768 } });
// This spec captures the real LLM debrief (@cp5-on): no forced template (decision 148).
test.use({ extraHTTPHeaders: {} });

async function shot(page: Page, name: string, full = false) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.screenshot({ path: `${OUT}/5-1366x768-${name}.png` });
  if (full) await page.screenshot({ path: `${OUT}/5-1366x768-${name}-full.png`, fullPage: true });
}

async function resultWithDebrief(page: Page, name: string, source: 'TEMPLATE' | 'LLM') {
  const sid = await sessionFromLog(page, 'S06', 's06_roe_attempts', SIM_VERSION);
  await page.goto(`/train/session/${sid}`);
  await expect(page.getByTestId('rating-change')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('debrief-source')).toContainText(source, { timeout: 60_000 });
  await page.getByTestId('debrief').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, name, true);
}

test('result + template debrief + Elo @checkpoint @cp5-off', async ({ page }) => {
  await login(page, 'e2e@demo');
  await resultWithDebrief(page, '01-result-template-debrief', 'TEMPLATE');
});

test('from text disabled @checkpoint @cp5-off', async ({ page }) => {
  await login(page, 'instructor@demo');
  await page.goto('/instructor/text');
  await expect(page.getByTestId('from-text-disabled')).toBeVisible({ timeout: 60_000 });
  await shot(page, '02-from-text-disabled');
});

test('result + LLM debrief @checkpoint @cp5-on', async ({ page }) => {
  await login(page, 'e2e@demo');
  await resultWithDebrief(page, '03-result-llm-debrief', 'LLM');
});

test('from text parsed @checkpoint @cp5-on', async ({ page }) => {
  await login(page, 'instructor@demo');
  await page.goto('/instructor/text');
  await page.getByTestId('from-text-read').click();
  await expect(page.getByTestId('from-text-generate')).toBeVisible({ timeout: 60_000 });
  await shot(page, '04-from-text-parsed');
});

async function spectrogramFor(page: Page, contact: string) {
  const track = await stepUntilTracked(page, contact);
  await page.getByRole('tab', { name: /Tracks/ }).click();
  await selectTrack(page, track);
  await page.getByRole('tab', { name: /Spectrogram/ }).click();
  for (let t = await tMs(page); t < 200_000; t += 1000) {
    if (await page.getByTestId('spectrogram').count()) break;
    await stepTo(page, t);
  }
  await expect(page.getByTestId('spectrogram')).toBeVisible();
  return track;
}

test('S15 AI chip, spectrograms, over-trust @checkpoint @cp5-on', async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, 'e2e@demo');
  await openBriefing(page, 'S15');
  await page.getByTestId('mode-assessment').click();
  await page.getByTestId('start-session').click();
  await awaitSession(page);

  // c06 is a bird the AI calls a small quad (74 %).
  const bird = await stepUntilTracked(page, 'c06');
  await selectTrack(page, bird);
  await expect(page.getByTestId('ai-chip')).toBeVisible();
  await shot(page, '05-ai-chip-bird');

  await page.keyboard.press('y'); // over-trust: accept the wrong suggestion
  await stepTo(page, (await tMs(page)) + 100);
  await shot(page, '05b-ai-accepted');

  // A large bird (c02): a small one's return stays below the 8 dB micro-Doppler floor.
  await spectrogramFor(page, 'c02');
  await shot(page, '06-spectrogram-bird');

  await spectrogramFor(page, 'c01');
  await shot(page, '07-spectrogram-quad');
  await page.keyboard.press('x'); // under-trust: reject the right one
  await stepTo(page, (await tMs(page)) + 100);

  await page.getByRole('button', { name: 'End session' }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('open-replay').click();
  await expect(page.getByTestId('aar-tab-ai')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('aar-tab-ai').click();
  await expect(page.getByTestId('trust-metrics')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, '08-aar-over-trust');
});

test('trends rating and trust @checkpoint @cp5-on', async ({ page }) => {
  await login(page, 'trainee1@demo');
  await page.goto('/aar/trends');
  await expect(page.getByTestId('trust-insight')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('chart-rating').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, '09-trends-rating-trust');
});
