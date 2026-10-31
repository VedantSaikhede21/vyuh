import { expect, test, type Locator, type Page } from '@playwright/test';
import { SIM_VERSION } from '@vyuh/sim-core';
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

// Visual baselines (DESIGN §12–13) at 1366×768 and 1920×1080. Baselines are
// rendered on Windows and kept local: see e2e/README.md.

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    const shot = async (
      page: Page,
      name: string,
      opts: { fullPage?: boolean; mask?: Locator[] } = {},
    ) => {
      await page.addStyleTag({ content: HIDE_WEBGL });
      // The Next.js dev indicator is not part of the app (as in checkpoint-4b.spec.ts).
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      // The shell's local clock changes every minute (Phase 6A).
      await page.addStyleTag({
        content: '[data-testid=local-time] { visibility: hidden !important; }',
      });
      await expect(page).toHaveScreenshot(`${vp.name}-${name}.png`, opts);
    };

    test('public pages', async ({ page }) => {
      // Reduced motion: the hero video shows its poster, not a playing frame.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      // A full-page picture never scrolls, so lazy images would stay empty.
      const broken = await page.evaluate(async () => {
        const images = [...document.images];
        for (const img of images) img.loading = 'eager';
        await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
        return images.filter((img) => img.naturalWidth === 0).map((img) => img.src);
      });
      expect(broken).toEqual([]);
      await shot(page, 'landing', { fullPage: true });
      await page.goto('/login');
      await shot(page, 'login');
    });

    test('training list, briefing and result', async ({ page }) => {
      // e2e@demo has fixed seeded sessions (apps/api/app/seed/e2e.py), so the
      // best-score column does not depend on what was played on this machine.
      await login(page, 'e2e@demo');
      await expect(page.getByTestId('scenario-S01')).toBeVisible();
      await expect(page.getByTestId('own-generated')).toContainText('No generated scenarios yet');
      // The Generate panel starts with a random seed: masked in the picture, so
      // check here that it renders a valid uint32 seed.
      const seed = page.locator('#gen-seed');
      await expect(seed).toHaveValue(/^\d{1,10}$/);
      expect(Number(await seed.inputValue())).toBeLessThanOrEqual(0xffffffff);
      await shot(page, 'training', { mask: [seed] });
      await login(page, 'trainee1@demo');
      await openBriefing(page, 'S01');
      // The briefing opens in 3D, which is not pixel-stable; the picture is the Map view.
      await page.getByTestId('briefing-view-map').click();
      // The shaded LOS coverage and the status text settle once it is computed.
      await expect(page.getByTestId('coverage-status')).toHaveText(/^LOS coverage ·/, {
        timeout: 120_000,
      });
      await page.waitForTimeout(400);
      await shot(page, 'briefing');
      // No response: the threat leaks and the server scores the run.
      await beginSession(page);
      await stepTo(page, 3_600_000);
      await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
      // e2e runs force the template debrief (playwright.config.ts, decision 148), so
      // its text is the same every run: wait for it and keep it in the picture.
      await expect(page.getByTestId('debrief-source')).toContainText('TEMPLATE', {
        timeout: 60_000,
      });
      await shot(page, 'result', { fullPage: true });
      // After a reload the end reason comes from the stored SESSION_ENDED event.
      const ended = await page.getByTestId('result-ended').textContent();
      await page.reload();
      await expect(page.getByTestId('result-ended')).toHaveText(ended ?? '');
    });

    test('AAR replay with ground truth', async ({ page }) => {
      test.setTimeout(180_000);
      // S06 from the committed sim log, at 03:00 with ground truth on: the truth
      // column (short class codes below 1600 px) and the folded non-threat row.
      await login(page, 'trainee1@demo');
      const sid = await sessionFromLog(page, 'S06', 's06_trainee', SIM_VERSION);
      await page.goto(`/aar/session/${sid}`);
      await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
      // The replay opens at the first track (audit P1-14); count from 00:00.
      await page.keyboard.press('Home');
      for (let i = 0; i < 18; i++) await page.keyboard.press('Shift+ArrowRight');
      await expect(page.getByTestId('replay-clock')).toHaveText(/^03:00/);
      await page.keyboard.press('g');
      await expect(page.getByTestId('kc-cleared-toggle')).toHaveText(
        /8 non-threats correctly left alone/,
      );
      await page.waitForTimeout(600);
      await shot(page, 'aar-replay-truth');
    });

    test('console states', async ({ page }) => {
      // S14 (test scenario, instructor list): threat, friendly, bird flock, RF.
      await login(page, 'instructor@demo');
      await openBriefing(page, 'S14');
      await beginSession(page);

      const threat = await stepUntilTracked(page, 'c01');
      await stepTo(page, (await tMs(page)) + 2000);
      await selectTrack(page, threat);
      await shot(page, 'player-selected');

      const chip = page.locator('[data-eo-state]');
      await page.keyboard.press('Space');
      await stepTo(page, (await tMs(page)) + 50);
      await expect(chip).toHaveText('CUE');
      await shot(page, 'eo-cue');

      await stepTo(page, (await tMs(page)) + 1600);
      await expect(chip).toHaveText('ACQ');
      await shot(page, 'eo-acq');

      // Zoomed in, the video tracker locks once the quad is close enough to see.
      // A radar track can drop and restart under a new id, which ends the lock:
      // then re-cue the threat's current track, as a trainee would. The loop reads
      // the sim's tracker state, not the chip: the chip follows it from the WebGL
      // frame loop and can lag a step, which used to add steps or re-cues and move
      // the screenshot to a different moment.
      const simMode = () => page.evaluate(() => window.__vyuhE2E!.eoSimTrackMode());
      for (let i = 0; i < 4; i++) await page.keyboard.press('Equal');
      for (let i = 0; i < 120 && (await simMode()) !== 'TRACK'; i++) {
        if ((await simMode()) === 'MANUAL') {
          const id = await page.evaluate(() => window.__vyuhE2E!.trackFor('c01'));
          if (id) {
            await selectTrack(page, id);
            await page.keyboard.press('Space');
          }
        }
        await stepTo(page, (await tMs(page)) + 1000);
      }
      // The sim is held, so waiting for the chip does not move the moment.
      await expect(chip).toHaveText('TRK');
      await shot(page, 'eo-trk');

      await page.getByRole('tab', { name: /RF/ }).click();
      await shot(page, 'rf-tab');
      await page.getByRole('tab', { name: /Tracks/ }).click();

      // Undefended, the threat closes on the asset until the leak banner shows.
      const banner = page.getByTestId('sim-player').getByRole('alert');
      for (let i = 0; i < 300 && !(await banner.isVisible()); i++) {
        await stepTo(page, (await tMs(page)) + 1000);
      }
      await expect(banner).toBeVisible();
      await shot(page, 'banner');
    });
  });
}
