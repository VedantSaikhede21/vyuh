import { expect, test, type Page } from '@playwright/test';
import {
  HIDE_WEBGL,
  beginSession,
  login,
  openBriefing,
  selectTrack,
  stepTo,
  stepUntilTracked,
  tMs,
} from './helpers';

// Access and feedback checks (DESIGN §12–13, CLAUDE.md §15) at 1366×768.

declare global {
  interface Window {
    /** Pending Comms acknowledgement time (ms), set by the ack test. */
    __ack?: Promise<number>;
  }
}

test.use({ viewport: { width: 1366, height: 768 } });

const noHorizontalScroll = async (page: Page, what: string) => {
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll, `${what} scrolls horizontally`).toBeLessThanOrEqual(client);
};

const comms = (page: Page) => page.locator('ol[aria-label="Comms log"] li');
const lastComms = (page: Page) => comms(page).last();

test('no horizontal scroll at 1366×768', async ({ page }) => {
  await page.goto('/');
  await noHorizontalScroll(page, 'landing');
  await page.goto('/sources');
  await noHorizontalScroll(page, 'sources');
  await login(page, 'trainee1@demo');
  await noHorizontalScroll(page, 'training');
  await openBriefing(page, 'S01');
  await noHorizontalScroll(page, 'briefing');
  await beginSession(page);
  await noHorizontalScroll(page, 'player');
  await stepTo(page, 3_600_000);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  await noHorizontalScroll(page, 'result');
});

for (const vp of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`action bar shows every effector without scrolling at ${vp.width}×${vp.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    // S14 has all three effectors (interceptor, jammer, spoofer).
    await login(page, 'instructor@demo');
    await openBriefing(page, 'S14');
    await beginSession(page);
    const strip = page.getByLabel('Effectors', { exact: true });
    await expect(strip.getByRole('group')).toHaveCount(3);
    const { overflow, bottom } = await strip.evaluate((el) => {
      const body = el.parentElement!;
      return {
        overflow: body.scrollHeight - body.clientHeight,
        bottom: el.getBoundingClientRect().bottom,
      };
    });
    expect(overflow, 'action bar content overflows').toBeLessThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(vp.height);
  });
}

test('core actions by keyboard alone', async ({ page }) => {
  await login(page, 'trainee1@demo');
  // Open the briefing and begin without the mouse.
  // Rows are focusable (arrows move between them); Enter opens the briefing page.
  await page.getByRole('row', { name: 'S01 First Contact: open the briefing' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('start-session')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('sim-player')).toBeVisible();
  await page.waitForFunction(() => window.__vyuhE2E !== undefined);

  await stepUntilTracked(page, 'c01');
  const step = async () => stepTo(page, (await tMs(page)) + 50);

  await page.keyboard.press('Tab');
  await step();
  await expect(lastComms(page)).toContainText('SELECTED');
  await page.keyboard.press('d');
  await expect(lastComms(page)).toContainText('MARKED DETECTED');
  await page.keyboard.press('c');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('1');
  await expect(lastComms(page)).toContainText('CLASSIFIED  SMALL QUADCOPTER');
  await page.keyboard.press('h');
  await expect(lastComms(page)).toContainText('AFFILIATION  HOSTILE');
  await page.keyboard.press('Space');
  await step();
  await expect(lastComms(page)).toContainText('EO CUED');
  const fov = page.getByText(/^FOV\s+[\d.]+°$/);
  const before = await fov.textContent();
  await page.keyboard.press('=');
  await expect(fov).not.toHaveText(before ?? '');
  await page.keyboard.press('t');
  await expect(lastComms(page)).toContainText('EO THERMAL');
  await page.keyboard.press('m');
  await expect(lastComms(page)).toContainText('MONITOR ORDERED');
  // Intercept needs two keys (DESIGN §9); the answer is either the order or the reason it is off.
  const n = await comms(page).count();
  await page.keyboard.press('i');
  await page.keyboard.press('Enter');
  await expect.poll(() => comms(page).count()).toBeGreaterThan(n);
  await page.keyboard.press('p');
  await expect(lastComms(page)).toContainText('PAUSED');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('every order is acknowledged in Comms within 100 ms', async ({ page }) => {
  await login(page, 'trainee1@demo');
  await openBriefing(page, 'S01');
  await beginSession(page);
  const track = await stepUntilTracked(page, 'c01');
  await page.locator(`tr[data-track-id="${track}"]`).click();
  await page.evaluate(() => window.__vyuhE2E!.release());

  const ackMs = async (key: string, echo: string) => {
    // Time from the keydown event to the echo line being in the Comms log, measured in the page.
    await page.evaluate((text) => {
      window.__ack = new Promise<number>((resolve) => {
        let down = 0;
        window.addEventListener('keydown', (e) => (down = e.timeStamp), {
          capture: true,
          once: true,
        });
        const echoed = () =>
          [...document.querySelectorAll('ol[aria-label="Comms log"] li')].some((li) =>
            li.textContent?.includes(text),
          );
        const obs = new MutationObserver(() => {
          if (!down || !echoed()) return;
          obs.disconnect();
          resolve(performance.now() - down);
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      });
    }, echo);
    await page.keyboard.press(key);
    return page.evaluate(() => window.__ack!);
  };

  const orders: [string, string][] = [
    ['d', 'MARKED DETECTED'],
    ['h', 'AFFILIATION  HOSTILE'],
    ['m', 'MONITOR ORDERED'],
    ['u', 'AFFILIATION  UNKNOWN'],
    ['n', 'AFFILIATION  NEUTRAL'],
  ];
  const times: Record<string, number> = {};
  for (const [key, echo] of orders) times[key] = await ackMs(key, echo);
  test.info().annotations.push({ type: 'ack-ms', description: JSON.stringify(times) });
  for (const [key, ms] of Object.entries(times)) {
    expect(ms, `ack for "${key}"`).toBeLessThanOrEqual(100);
  }
});

test('colour-blind captures for review', async ({ page }) => {
  // Affiliation must read without colour (shape + letter): captured for the §13 review.
  await login(page, 'instructor@demo');
  await openBriefing(page, 'S14');
  await beginSession(page);
  await stepTo(page, 40_000);
  // One of each affiliation on screen: threat hostile, friendly friendly, a bird neutral.
  for (const [contact, key] of [
    ['c01', 'h'],
    ['c02', 'f'],
    ['b01', 'n'],
  ] as const) {
    const id = await page.evaluate((c) => window.__vyuhE2E!.trackFor(c), contact);
    if (!id) continue;
    await selectTrack(page, id);
    await page.keyboard.press(key);
    await stepTo(page, (await tMs(page)) + 50);
  }
  const cdp = await page.context().newCDPSession(page);
  for (const type of ['deuteranopia', 'protanopia'] as const) {
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type });
    await page.addStyleTag({ content: HIDE_WEBGL });
    const path = test.info().outputPath(`vision-${type}.png`);
    await page.screenshot({ path });
    await test.info().attach(`vision-${type}`, { path, contentType: 'image/png' });
  }
  await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
});
