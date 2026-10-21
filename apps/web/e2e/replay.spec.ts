import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// AAR replay (Phase 4a): a log recorded by sim-core in Node replays exactly in
// Chrome (decision 111) and can be scrubbed by keyboard; an older sim version
// falls back to the event timeline (decision 109).

const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';

async function sessionFromLog(
  page: Page,
  code: string,
  fixture: string,
  simVersion: number,
): Promise<string> {
  const token = await page.evaluate(() => window.localStorage.getItem('vyuh.localToken'));
  const headers = { Authorization: `Bearer ${token}` };
  const list = await (await page.request.get(`${API}/scenarios`, { headers })).json();
  const scenario = list.items.find((s: { code: string }) => s.code === code);
  const log = JSON.parse(
    readFileSync(new URL(`../../api/tests/fixtures/${fixture}.json`, import.meta.url), 'utf8'),
  ) as { tMs: number; payload: { mode?: string } }[];
  const created = await (
    await page.request.post(`${API}/sessions`, {
      headers,
      data: { scenarioId: scenario.id, mode: log[0]!.payload.mode, simVersion },
    })
  ).json();
  const sid = created.sessionId as string;
  await page.request.post(`${API}/sessions/${sid}/events`, {
    headers,
    data: { batchSeq: 0, events: log },
  });
  const done = await page.request.post(`${API}/sessions/${sid}/complete`, {
    headers,
    data: { endTMs: log.at(-1)!.tMs, clientMeta: {} },
  });
  expect(done.ok(), await done.text()).toBe(true);
  return sid;
}

test('a recorded session replays exactly and scrubs by keyboard', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'trainee1@demo');
  // S04 on PUNJAB_PLAINS (terrain revision 2): reports, camera locks, a jam.
  const sid = await sessionFromLog(page, 'S04', 's04_reports', 5);
  await page.goto(`/aar/session/${sid}`);
  await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('replay-chip')).toBeVisible();
  await expect(page.getByTestId('replay-clock')).toHaveText(/^00:00/);

  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('replay-clock')).toHaveText(/^01:00/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('replay-clock')).toHaveText(/^00:59/);
  await page.keyboard.press('End');
  await expect(page.getByTestId('kill-chain')).toBeVisible();

  // A kill-chain stage jumps the replay to its moment.
  const cell = page.locator('[data-testid^="kc-"][data-testid$="-DETECT"]').first();
  await cell.click();
  await expect(page.getByTestId('kill-chain-detail')).toContainText('Detect');
  await expect(page.getByTestId('replay-clock')).not.toHaveText(/^0[3-9]:/);

  // Ground truth only on request.
  await expect(page.getByTestId('truth-labels')).toHaveCount(0);
  await page.keyboard.press('g');
  await expect(page.getByTestId('truth-labels')).toHaveCount(1);
});

test('a session from an older simulator version falls back to the timeline', async ({ page }) => {
  await login(page, 'trainee1@demo');
  const sid = await sessionFromLog(page, 'S01', 's01_defended', 4);
  await page.goto(`/aar/session/${sid}`);
  await expect(page.getByTestId('replay-fallback')).toContainText(
    'This session used an older simulator version — showing the event timeline only, not a replay.',
  );
  await expect(page.getByTestId('kill-chain')).toBeVisible();
});
