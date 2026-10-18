import { expect, test, type Page } from '@playwright/test';
import {
  VIEWPORTS,
  beginSession,
  login,
  openBriefing,
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

    const shot = async (page: Page, name: string, opts: { fullPage?: boolean } = {}) => {
      await page.addStyleTag({ content: HIDE_WEBGL });
      await expect(page).toHaveScreenshot(`${vp.name}-${name}.png`, opts);
    };

    test('public pages', async ({ page }) => {
      // Reduced motion: the hero video shows its poster, not a playing frame.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
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
      await shot(page, 'training');
      await login(page, 'trainee1@demo');
      await openBriefing(page, 'S01');
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
      await shot(page, 'result', { fullPage: true });
      // After a reload the end reason comes from the stored SESSION_ENDED event.
      const ended = await page.getByTestId('result-ended').textContent();
      await page.reload();
      await expect(page.getByTestId('result-ended')).toHaveText(ended ?? '');
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
      // then re-cue the threat's current track, as a trainee would.
      for (let i = 0; i < 4; i++) await page.keyboard.press('Equal');
      for (let i = 0; i < 120 && (await chip.textContent()) !== 'TRK'; i++) {
        if ((await chip.textContent()) === 'MAN') {
          const id = await page.evaluate(() => window.__vyuhE2E!.trackFor('c01'));
          if (id) {
            await selectTrack(page, id);
            await page.keyboard.press('Space');
          }
        }
        await stepTo(page, (await tMs(page)) + 1000);
      }
      await expect(chip).toHaveText('TRK');
      await shot(page, 'eo-trk');

      await page.locator('#tab-RF').click();
      await shot(page, 'rf-tab');
      await page.locator('#tab-TRACKS').click();

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
