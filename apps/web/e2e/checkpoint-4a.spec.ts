import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import {
  VIEWPORTS,
  beginSession,
  login,
  openBriefing,
  sessionFromLog,
  selectTrack,
  stepTo,
  stepUntilTracked,
  tMs,
  HIDE_WEBGL,
} from './helpers';

// Phase 4a replay checkpoint captures (tag @checkpoint), written to
// e2e/checkpoint/ (git-ignored):
//  01  S01 played through the UI, replayed: scrubber with markers, kill chain
//  02–05  S06 (dense town) from a recorded sim log: ground truth on / off, a
//      kill-chain stage chosen, the replay help
//  06  the fallback for a session recorded on an older simulator version
//  07–08  the contact report form (S10 swarm), then the Comms acknowledgement
//  09–10  result screen: penalty links (v4), and Replay unavailable with its reason
// The S06 test also prints peak browser memory while the replay loads and plays.

const OUT = 'e2e/checkpoint';
const sh = promisify(exec);

/** Working set and private bytes of the Playwright Chrome processes (Windows), MB. */
async function chromeMemoryMb(): Promise<{ workingSet: number; private: number }> {
  const ps =
    "$p = Get-CimInstance Win32_Process -Filter \\\"Name='chrome.exe'\\\" | Where-Object { $_.CommandLine -match 'playwright' }; " +
    "'{0} {1}' -f ($p | Measure-Object WorkingSetSize -Sum).Sum, ($p | Measure-Object PrivatePageCount -Sum).Sum";
  const { stdout } = await sh(`powershell -NoProfile -Command "${ps}"`);
  const [ws, pr] = stdout.trim().split(/\s+/).map(Number);
  return { workingSet: (ws ?? 0) / 2 ** 20, private: (pr ?? 0) / 2 ** 20 };
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    const shot = async (page: Page, name: string) => {
      await page.addStyleTag({ content: HIDE_WEBGL });
      await page.screenshot({ path: `${OUT}/4a-${vp.name}-${name}.png` });
    };

    test('S01 played and replayed @checkpoint', async ({ page }) => {
      test.setTimeout(300_000);
      await login(page, 'trainee1@demo');
      await openBriefing(page, 'S01');
      await beginSession(page);
      const track = await stepUntilTracked(page, 'c01');
      await selectTrack(page, track);
      await page.keyboard.press('d');
      await page.keyboard.press('c');
      await page.keyboard.press('1');
      await page.keyboard.press('h');
      await page.keyboard.press('Space'); // cue the EO camera
      for (let t = await tMs(page); t < 150_000; t += 2000) {
        await stepTo(page, t);
        const range = await page.evaluate((id) => window.__vyuhE2E!.trackRange(id), track);
        if (range !== null && range < 1000) break;
      }
      await page.keyboard.press('i');
      await page.keyboard.press('Enter');
      await stepTo(page, 3_600_000);
      await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
      await page.getByTestId('open-replay').click();
      await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId('replay-chip')).toBeVisible();
      await page.getByTestId('kc-c01-RESPOND').click();
      await page.waitForTimeout(500);
      await shot(page, '01-S01-scrubber-markers-killchain');
    });

    test('S06 replay: ground truth, kill chain, memory @checkpoint', async ({ page }) => {
      test.setTimeout(300_000);
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text().slice(0, 300));
      });
      await login(page, 'trainee1@demo');
      const sid = await sessionFromLog(page, 'S06', 's06_trainee', 5);

      const before = await chromeMemoryMb();
      let peak = before;
      let sampling = true;
      const sampler = (async () => {
        while (sampling) {
          const m = await chromeMemoryMb();
          if (m.private > peak.private) peak = m;
        }
      })();
      const t0 = Date.now();
      await page.goto(`/aar/session/${sid}`);
      await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
      const readyS = (Date.now() - t0) / 1000;
      // Play at 4× for 5 s, then jump to the ends and back.
      await page.keyboard.press('4');
      await page.keyboard.press('Space');
      await page.waitForTimeout(5000);
      await page.keyboard.press('Space');
      for (const k of ['Home', 'End', 'Home']) await page.keyboard.press(k);
      sampling = false;
      await sampler;
      console.log(
        `S06 replay ${vp.name}: ready in ${readyS.toFixed(1)} s; Chrome private bytes ` +
          `${before.private.toFixed(0)} -> peak ${peak.private.toFixed(0)} MB ` +
          `(working set ${peak.workingSet.toFixed(0)} MB); console errors ${errors.length}: ${errors.join(' || ')}`,
      );

      // 02 / 03: ground truth on and off, mid-scenario.
      await page.keyboard.press('Home');
      // 03:00: the town's tracks, birds and the threat are all up.
      for (let i = 0; i < 18; i++) await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('g');
      await page.waitForTimeout(600);
      await shot(page, '02-S06-ground-truth-on');
      await page.keyboard.press('g');
      await page.waitForTimeout(400);
      await shot(page, '03-S06-ground-truth-off');

      // 04: a kill-chain stage chosen — its detail, and the replay at that moment.
      const cell = page.locator('[data-testid^="kc-"][data-testid$="-RESPOND"]').first();
      await cell.hover();
      await cell.click();
      await page.waitForTimeout(600);
      await shot(page, '04-S06-kill-chain-stage');
      // Non-threats handled correctly fold into one row; opened here.
      await page.getByTestId('kc-cleared-toggle').first().click();
      await page.waitForTimeout(200);
      await shot(page, '04b-S06-kill-chain-non-threats-open');
      await page.getByTestId('kc-cleared-toggle').first().click();

      await page.keyboard.press('?');
      await page.waitForTimeout(200);
      await shot(page, '05-help');
    });

    test('S06 live player memory, for comparison @checkpoint', async ({ page }) => {
      test.setTimeout(300_000);
      await login(page, 'trainee1@demo');
      const before = await chromeMemoryMb();
      let peak = before;
      let sampling = true;
      const sampler = (async () => {
        while (sampling) {
          const m = await chromeMemoryMb();
          if (m.private > peak.private) peak = m;
        }
      })();
      await openBriefing(page, 'S06');
      await beginSession(page);
      for (let t = 10_000; t <= 120_000; t += 10_000) await stepTo(page, t);
      await page.evaluate(() => window.__vyuhE2E!.release());
      await page.waitForTimeout(5000);
      sampling = false;
      await sampler;
      console.log(
        `S06 live ${vp.name}: Chrome private bytes ${before.private.toFixed(0)} -> peak ` +
          `${peak.private.toFixed(0)} MB (working set ${peak.workingSet.toFixed(0)} MB)`,
      );
    });

    test('contact report form @checkpoint', async ({ page }) => {
      test.setTimeout(180_000);
      // S10 (swarm): the form prefilled from a track, with nearby tracks offered.
      await login(page, 'trainee1@demo');
      await openBriefing(page, 'S10');
      await beginSession(page);
      const track = await stepUntilTracked(page, 'c01');
      await stepTo(page, (await tMs(page)) + 4000);
      await selectTrack(page, track);
      await page.keyboard.press('r');
      await expect(page.getByTestId('report-form')).toBeVisible();
      await page.keyboard.press('1');
      await page.waitForTimeout(200);
      await shot(page, '07-report-form');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      await shot(page, '08-report-sent');
    });

    test('result screen: penalty links, replay unavailable @checkpoint', async ({ page }) => {
      test.setTimeout(180_000);
      await login(page, 'trainee1@demo');
      // default_v4 penalties carry their time and link to that moment in the replay.
      const v4 = await sessionFromLog(page, 'S06', 's06_roe_attempts', 5);
      await page.goto(`/train/session/${v4}`);
      await expect(page.getByTestId('penalty-link').first()).toBeVisible({ timeout: 60_000 });
      await shot(page, '09-result-penalty-links');
      // A session the replay cannot reproduce: the button says why, the timeline stays reachable.
      const old = await sessionFromLog(page, 'S01', 's01_defended', 4);
      await page.goto(`/train/session/${old}`);
      await expect(page.getByTestId('open-replay')).toBeDisabled({ timeout: 60_000 });
      await page.getByTestId('open-replay').locator('..').hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await shot(page, '10-result-replay-unavailable');
    });

    test('fallback for an older simulator version @checkpoint', async ({ page }) => {
      await login(page, 'trainee1@demo');
      // The S01 log, as if it had been recorded on SIM_VERSION 4.
      const sid = await sessionFromLog(page, 'S01', 's01_defended', 4);
      await page.goto(`/aar/session/${sid}`);
      await expect(page.getByTestId('replay-fallback')).toBeVisible({ timeout: 60_000 });
      await shot(page, '06-fallback');
    });
  });
}
