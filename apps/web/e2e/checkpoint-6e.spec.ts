import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Phase 6E Checkpoint E (tags @checkpoint @cp6e): the guest judge path (SPEC §20)
// from the landing page, recorded at 1366×768 with a timer from opening the URL,
// plus captures of every tour step and the guest screens, and a 1920×1080 pass.
// Needs the dev server (the __vyuhE2E time hook) with NEXT_PUBLIC_GUEST_MODE=true
// and the API with GUEST_MODE_ENABLED=true. Output in e2e/checkpoint/6e/ (git-ignored).
// The sim is held during the tour (as for a judge) and runs live until the first
// radar track; the rest of the run is then fast-forwarded and said so in the timings.

const OUT = 'e2e/checkpoint/6e';
// Recorded at 1366×768 (the judge path video); kept only for the path test.
test.use({ video: { mode: 'on', size: { width: 1366, height: 768 } } });
mkdirSync(OUT, { recursive: true });

async function shot(page: Page, name: string) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForTimeout(250);
  const v = page.viewportSize();
  await page.screenshot({ path: `${OUT}/${v?.width}x${v?.height}-${name}.png` });
}

async function walkTour(page: Page, id: string, prefix: string) {
  const card = page.getByTestId('tour-card');
  await expect(page.getByTestId(`tour-${id}`)).toBeVisible({ timeout: 20_000 });
  for (let i = 1; ; i++) {
    await expect(card).toBeVisible();
    await shot(page, `${prefix}-tour-${String(i).padStart(2, '0')}`);
    const last = (await page.getByTestId('tour-next').textContent())?.startsWith('Done');
    await page.keyboard.press('Enter');
    if (last) break;
  }
  await expect(page.getByTestId(`tour-${id}`)).toHaveCount(0);
}

test.describe('1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('guest judge path with timings @checkpoint @cp6e', async ({ page }) => {
    test.setTimeout(600_000);
    const t0 = Date.now();
    const marks: { step: string; s: number }[] = [];
    const mark = (step: string) =>
      marks.push({ step, s: Math.round((Date.now() - t0) / 100) / 10 });

    await page.goto('/');
    await shot(page, '01-landing');
    await page.getByRole('link', { name: 'Try the demo' }).first().click();
    await expect(page.getByTestId('demo-path')).toHaveCount(0); // not a guest yet
    await expect(page.getByTestId('start-demo')).toBeVisible();
    await shot(page, '02-demo-entry');
    await page.getByTestId('start-demo').click();
    await expect(page.getByTestId('scenario-S15')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('demo-path')).toBeVisible();
    mark('guest account, training list');
    await shot(page, '03-training-guest');

    await page.getByTestId('scenario-S15').click();
    await expect(page.getByTestId('start-session')).toBeVisible({ timeout: 60_000 });
    mark('S15 briefing');
    await shot(page, '04-briefing-S15');
    await page.getByTestId('start-session').click();
    await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => window.__vyuhE2E !== undefined);
    mark('player ready');
    await walkTour(page, 'player', '05-player');
    mark('player tour done');

    // Live until the first radar track, as a judge sees it.
    await page.evaluate(() => window.__vyuhE2E!.release());
    await expect(page.locator('tr[data-track-id]').first()).toBeVisible({ timeout: 180_000 });
    mark('first radar track');
    await shot(page, '06-first-track');

    await page.evaluate(() => window.__vyuhE2E!.stepTo(3_600_000));
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
    mark('result (run fast-forwarded after the first track)');
    await walkTour(page, 'result', '07-result');
    await shot(page, '08-result');

    await page.getByTestId('open-replay').click();
    await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
    mark('replay');
    await walkTour(page, 'aar', '09-aar');
    await page.keyboard.press('g');
    await expect(page.getByTestId('truth-labels')).toHaveCount(1);
    await shot(page, '10-aar-truth');

    // From here the demo path strip leads.
    await page.getByRole('link', { name: 'Back to debrief' }).click();
    await expect(page.getByTestId('demo-next')).toContainText('Unit view');
    await page.getByTestId('demo-next').click();
    await expect(page.getByTestId('assign-read-only')).toBeVisible({ timeout: 60_000 });
    mark('unit view (read-only)');
    await shot(page, '11-unit-guest');

    await page.getByTestId('demo-next').click();
    await expect(page.getByTestId('from-text-read')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('from-text-read').click();
    await expect(page.getByTestId('from-text-source')).toBeVisible({ timeout: 60_000 });
    mark('from text parsed');
    await shot(page, '12-from-text');
    await page.getByTestId('from-text-generate').click();
    await expect(page.getByTestId('start-session')).toBeVisible({ timeout: 120_000 });
    mark('generated briefing');
    await shot(page, '13-generated-briefing');

    await page.getByTestId('demo-next').click();
    await expect(page.getByTestId('demo-done')).toBeVisible({ timeout: 60_000 });
    mark('sources, path complete');
    await shot(page, '14-sources-done');

    writeFileSync(`${OUT}/timings.json`, `${JSON.stringify(marks, null, 2)}\n`);
    console.log(marks.map((m) => `${String(m.s).padStart(6)} s  ${m.step}`).join('\n'));
    const video = page.video();
    await page.close();
    await video?.saveAs(`${OUT}/judge-path-1366x768.webm`);
  });
});

test.describe('1920x1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('guest screens and the player tour @checkpoint @cp6e', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/demo');
    await page.getByTestId('start-demo').click();
    await expect(page.getByTestId('scenario-S15')).toBeVisible({ timeout: 60_000 });
    await shot(page, '03-training-guest');
    await page.getByTestId('scenario-S15').click();
    await page.getByTestId('start-session').click();
    await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 60_000 });
    await walkTour(page, 'player', '05-player');
    await page.goto('/instructor');
    await expect(page.getByTestId('assign-read-only')).toBeVisible({ timeout: 60_000 });
    await shot(page, '11-unit-guest');
    await page.goto('/instructor/text');
    await page.getByTestId('from-text-read').click();
    await expect(page.getByTestId('from-text-source')).toBeVisible({ timeout: 60_000 });
    await shot(page, '12-from-text');
  });
});
