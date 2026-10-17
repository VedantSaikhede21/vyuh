import { expect, test, type Page } from '@playwright/test';
import { SIM_VERSION } from '@vyuh/sim-core';
import { VIEWPORTS, beginSession, login, selectTrack, stepTo, stepUntilTracked } from './helpers';

// Phase 3a Step 10 checkpoint captures (tag @checkpoint, not part of `pnpm e2e`):
//   pnpm --filter @vyuh/web e2e:checkpoint
// Writes described PNGs to e2e/checkpoint/ for review against DESIGN §13. The
// scenario is generated through the API exactly as a trainee would request it:
// D3, PUNJAB_PLAINS, day, seed 10 — three village NO_KINETIC zones (Z1–Z3), a
// border line, two smugglers (c02, c04). c04's track enters a village zone at ~79 s;
// both payloads drop near 305 s and 319 s when nobody engages.

const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';
const REQUEST = { terrainPreset: 'PUNJAB_PLAINS', difficulty: 3, seed: 10, timeBand: 'DAY' };
const OUT = 'e2e/checkpoint';

/** Generate the scenario and create a practice session as the logged-in trainee. */
async function startGenerated(page: Page): Promise<string> {
  return page.evaluate(
    async ({ api, body, simVersion }) => {
      const token = window.localStorage.getItem('vyuh.localToken');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const gen = await fetch(`${api}/scenarios/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!gen.ok) throw new Error(`generate ${gen.status} ${await gen.text()}`);
      const { scenarioId } = (await gen.json()) as { scenarioId: string };
      const ses = await fetch(`${api}/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ scenarioId, mode: 'PRACTICE', simVersion }),
      });
      if (!ses.ok) throw new Error(`session ${ses.status} ${await ses.text()}`);
      return ((await ses.json()) as { sessionId: string }).sessionId;
    },
    { api: API, body: REQUEST, simVersion: SIM_VERSION },
  );
}

for (const vp of VIEWPORTS) {
  test(`Phase 3a checkpoint at ${vp.name} @checkpoint`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await login(page, 'trainee1@demo');
    const sessionId = await startGenerated(page);
    await page.goto(`/train/session/${sessionId}`);
    // The Next.js dev-tools badge is not part of the product (dev server only).
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await beginSession(page);

    // 1. Generated D3 scenario with its no-kinetic zones (hatched, labelled) in 3D and on the PPI.
    await stepTo(page, 45_000);
    // Dolly the orbit camera in a little so the village zone's hatching reads.
    const view = page.getByLabel('Tactical view');
    const box = (await view.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
    await page.waitForTimeout(1500); // terrain chunks, zone labels, damping
    await expect(page.getByText('Z2 · NO KINETIC · VILLAGE')).toBeVisible();
    await page.screenshot({ path: `${OUT}/3a-01-d3-no-kinetic-zone-${vp.name}.png` });

    // 2. c04 inside zone Z2, classified and declared hostile: intercept disabled, zone named.
    const track = await stepUntilTracked(page, 'c04');
    await stepTo(page, 82_000);
    await selectTrack(page, track);
    await page.keyboard.press('c');
    await page.keyboard.press('2');
    await page.keyboard.press('h');
    await stepTo(page, 82_100);
    const intercept = page.getByRole('button', { name: /Intercept/ });
    await expect(intercept).toBeDisabled();
    await intercept.locator('..').hover();
    const reason = page.getByText(/No kinetic response over the village — zone Z\d/).first();
    await expect(reason).toBeVisible();
    await page.screenshot({ path: `${OUT}/3a-02-intercept-tooltip-zone-${vp.name}.png` });

    // 3. Practice HINT lines in Comms (tracks nobody has selected for 20 s).
    await page.mouse.move(5, vp.height / 2);
    await expect(page.getByText('HINT').first()).toBeVisible();
    await expect(page.getByText(/has not been looked at\. Tab selects it\./).first()).toBeVisible();
    await page.screenshot({ path: `${OUT}/3a-03-practice-hint-${vp.name}.png` });

    // 4. Run to the end without engaging: both smugglers drop; the result screen says when.
    await page.evaluate(() => window.__vyuhE2E!.stepTo(10 * 60_000));
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Payload dropped at/).first()).toBeVisible();
    await page.screenshot({
      path: `${OUT}/3a-04-result-payload-drop-${vp.name}.png`,
      fullPage: true,
    });
  });
}
