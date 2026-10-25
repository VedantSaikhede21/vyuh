import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { SIM_VERSION } from '@vyuh/sim-core';
import {
  beginSession,
  login,
  openBriefing,
  selectTrack,
  sessionFromLog,
  stepTo,
  stepUntilTracked,
  tMs,
} from './helpers';

// Phase 6D Checkpoint D (tags @checkpoint @cp6d): a video of each key
// interaction at 1366×768, written to e2e/checkpoint/6d/ (git-ignored). Needs the
// dev server (the __vyuhE2E time hook). After setup the sim runs live, so the
// videos show the motion as a trainee sees it:
//  01  track selection (3D view eases to each selected track); S14 is staff-only, so 01 and 03 sign in as the instructor
//  02  response order with Comms line entry
//  03  tab switch (Tracks / RF / Spectrogram) and the user menu
//  04  AAR scrub and the kill-chain unfold
//  05  result reveal

const OUT = 'e2e/checkpoint/6d';
mkdirSync(OUT, { recursive: true });
const SIZE = { width: 1366, height: 768 };

test.use({ viewport: SIZE, video: { mode: 'on', size: SIZE } });

/** Close the page so the recording is flushed, then keep it under a readable name. */
async function keep(page: Page, name: string) {
  const video = page.video();
  await page.close();
  await video?.saveAs(`${OUT}/${name}.webm`);
}

const live = (page: Page) => page.evaluate(() => window.__vyuhE2E!.release());
const lastComms = (page: Page) => page.locator('ol[aria-label="Comms log"] li').last();

test('01 track selection @checkpoint @cp6d', async ({ page }) => {
  await login(page, 'instructor@demo');
  await openBriefing(page, 'S14');
  await beginSession(page);
  await stepTo(page, 40_000);
  const ids: string[] = [];
  for (const c of ['c01', 'c02', 'b01']) {
    const id = await page.evaluate((x) => window.__vyuhE2E!.trackFor(x), c);
    if (id) ids.push(id);
  }
  expect(ids.length).toBeGreaterThan(1);
  await live(page);
  for (const id of [...ids, ids[0]!]) {
    await selectTrack(page, id);
    await page.waitForTimeout(1500);
  }
  await keep(page, '01-track-selection');
});

test('02 response order with Comms entry @checkpoint @cp6d', async ({ page }) => {
  await login(page, 'trainee1@demo');
  await openBriefing(page, 'S01');
  await beginSession(page);
  const track = await stepUntilTracked(page, 'c01');
  await live(page);
  await page.locator(`tr[data-track-id="${track}"]`).click();
  await page.waitForTimeout(1000);
  for (const [key, text] of [
    ['d', 'MARKED DETECTED'],
    ['c', null],
    ['1', 'CLASSIFIED'],
    ['h', 'AFFILIATION'],
    ['m', 'MONITOR ORDERED'],
  ] as const) {
    await page.keyboard.press(key);
    if (text) await expect(lastComms(page)).toContainText(text);
    await page.waitForTimeout(900);
  }
  await page.keyboard.press('i');
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await keep(page, '02-response-comms');
});

test('03 tab switch and menu @checkpoint @cp6d', async ({ page }) => {
  await login(page, 'instructor@demo');
  await openBriefing(page, 'S14');
  await beginSession(page);
  await stepTo(page, 40_000);
  await live(page);
  await page.waitForTimeout(800);
  for (const name of [/^RF/, /^Spectrogram/, /^Tracks/]) {
    await page.getByRole('tab', { name }).click();
    await page.waitForTimeout(1200);
  }
  await page.goto('/train');
  await expect(page.getByTestId('scenario-S01')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('user-menu').click();
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await keep(page, '03-tabs-menu');
});

test('04 AAR scrub @checkpoint @cp6d', async ({ page }) => {
  await login(page, 'trainee1@demo');
  const sid = await sessionFromLog(page, 'S04', 's04_reports', SIM_VERSION);
  await page.goto(`/aar/session/${sid}`);
  await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('Home');
  await page.waitForTimeout(800);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(500);
  }
  await page.keyboard.press('End');
  await page.waitForTimeout(1000);
  const unfold = page.getByTestId('kc-cleared-toggle').first();
  if (await unfold.isVisible()) {
    await unfold.click();
    await page.waitForTimeout(1200);
  }
  await keep(page, '04-aar-scrub');
});

test('05 result reveal @checkpoint @cp6d', async ({ page }) => {
  await login(page, 'trainee1@demo');
  await openBriefing(page, 'S01');
  await beginSession(page);
  await stepTo(page, (await tMs(page)) + 1000);
  await page.waitForTimeout(800);
  await stepTo(page, 3_600_000);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  await keep(page, '05-result-reveal');
});

// Not a video: proves each entry runs on the §7 curve and length, and that the
// Settings toggle stops all of them. Every animation in the document is sampled
// once per frame (CSS ones report their curve through the computed style).
async function recordAnimations(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = [];
    const known = new WeakSet<Animation>();
    (window as unknown as { __anims: string[] }).__anims = seen;
    const sample = () => {
      for (const a of document.getAnimations()) {
        if (known.has(a)) continue;
        known.add(a);
        const t = a.effect?.getTiming();
        const el = (a.effect as KeyframeEffect | null)?.target;
        const css = 'animationName' in a;
        const name = css
          ? (a as CSSAnimation).animationName
          : 'transitionProperty' in a
            ? `transition:${(a as CSSTransition).transitionProperty}`
            : 'waapi';
        const easing = css && el ? getComputedStyle(el).animationTimingFunction : t?.easing;
        if (name !== 'acq-pulse') seen.push(`${name} ${t?.duration} ${easing}`);
      }
      requestAnimationFrame(sample);
    };
    sample();
  });
}
const anims = (page: Page) =>
  page.evaluate(() => (window as unknown as { __anims: string[] }).__anims);

for (const reduce of [false, true]) {
  test(`06 motion probe${reduce ? ' (reduced)' : ''} @checkpoint @cp6d`, async ({ page }) => {
    await login(page, 'trainee1@demo');
    if (reduce)
      await page.evaluate(() =>
        localStorage.setItem('vyuh.settings.v1', JSON.stringify({ motion: 'REDUCE' })),
      );
    await openBriefing(page, 'S01');
    await beginSession(page);
    const track = await stepUntilTracked(page, 'c01');
    await recordAnimations(page);
    await page.locator(`tr[data-track-id="${track}"]`).click();
    await stepTo(page, (await tMs(page)) + 50);
    await page.keyboard.press('d');
    await expect(lastComms(page)).toContainText('MARKED DETECTED');
    await page.getByRole('tab', { name: /^RF/ }).click();
    await page.waitForTimeout(300);
    const got = await anims(page);
    console.log(`${reduce ? 'reduced' : 'normal'}: ${JSON.stringify([...new Set(got)])}`);
    const comms = got.filter((a) => a.startsWith('comms-in'));
    if (reduce) {
      for (const a of got) expect(Number(a.split(' ')[1])).toBeLessThan(1);
      expect(got.some((a) => a.startsWith('waapi'))).toBe(false);
    } else {
      expect(comms.length).toBeGreaterThan(0);
      for (const a of comms) expect(a).toBe('comms-in 150 cubic-bezier(0.2, 0, 0, 1)');
      expect(got).toContain('waapi 120 cubic-bezier(0.2, 0, 0, 1)');
    }
  });
}
