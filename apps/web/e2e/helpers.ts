import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

// Shared steps for the E2E specs. They drive the console as a trainee does
// (clicks and shortcuts); only time is controlled, through window.__vyuhE2E
// (lib/e2e/hook.ts, non-production builds only).

export const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
] as const;

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  if ((await page.locator(`#email option[value="${email}"]`).count()) === 0) {
    // Test-only accounts (e2e@demo) are not on the login list: dev-login through
    // the API and store the token where the app keeps it (lib/auth.tsx).
    const api = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';
    const res = await page.request.post(`${api}/auth/dev-login`, { data: { email } });
    expect(res.ok(), await res.text()).toBe(true);
    const { accessToken } = (await res.json()) as { accessToken: string };
    await page.evaluate((t) => window.localStorage.setItem('vyuh.localToken', t), accessToken);
    await page.goto('/train');
    return;
  }
  await page.selectOption('#email', email);
  await page.click('button[type=submit]');
  await page.waitForURL('**/train');
}

/** Open a scenario's briefing page from the training list (/train/scenario/[id]). */
export async function openBriefing(page: Page, code: string): Promise<void> {
  await page.goto('/train');
  await page.getByTestId(`scenario-${code}`).click();
  await expect(page.getByTestId('start-session')).toBeVisible();
}

/** Begin on the briefing page and wait until the test hook holds the session at t ≈ 0. */
export async function beginSession(page: Page): Promise<void> {
  await page.getByTestId('start-session').click();
  await awaitSession(page);
}

/**
 * A session page opened directly (session created through the API) starts by
 * itself; wait for the player and the test hook.
 */
export async function awaitSession(page: Page): Promise<void> {
  await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__vyuhE2E !== undefined);
  // Fonts, terrain and the first frames.
  await page.waitForTimeout(500);
}

export async function stepTo(page: Page, tMs: number): Promise<number> {
  const t = await page.evaluate((target) => window.__vyuhE2E!.stepTo(target), tMs);
  await page.waitForTimeout(150);
  return t;
}

export const tMs = (page: Page) => page.evaluate(() => window.__vyuhE2E!.tMs());

/** Step in 1 s increments until the contact has an active track; returns its id. */
export async function stepUntilTracked(page: Page, contactId: string, limitMs = 300_000) {
  for (let t = await tMs(page); t <= limitMs; t += 1000) {
    await page.evaluate((target) => window.__vyuhE2E!.stepTo(target), t);
    const id = await page.evaluate((c) => window.__vyuhE2E!.trackFor(c), contactId);
    if (id) {
      await page.waitForTimeout(150);
      return id;
    }
  }
  throw new Error(`${contactId} was never tracked`);
}

/** Select a track by clicking its row, then let one tick apply it. */
export async function selectTrack(page: Page, trackId: string): Promise<void> {
  await page.locator(`tr[data-track-id="${trackId}"]`).click();
  await stepTo(page, (await tMs(page)) + 50);
  await expect(page.locator(`tr[data-track-id="${trackId}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/**
 * The WebGL canvas (terrain, models, EO video) is not pixel-stable between runs,
 * so screenshots hide it (the radar PPI, a labelled 2D canvas, stays); every DOM
 * overlay — 3D labels, EO gate and chips — stays in the picture.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';

/**
 * A completed session from a committed sim log (apps/api/tests/fixtures), created
 * as the logged-in user and scored by the API. The mode comes from the log.
 */
export async function sessionFromLog(
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
  const batch = await page.request.post(`${API}/sessions/${sid}/events`, {
    headers,
    data: { batchSeq: 0, events: log },
  });
  expect(batch.ok(), await batch.text()).toBe(true);
  const done = await page.request.post(`${API}/sessions/${sid}/complete`, {
    headers,
    data: { endTMs: log.at(-1)!.tMs, clientMeta: {} },
  });
  expect(done.ok(), await done.text()).toBe(true);
  return sid;
}

export const HIDE_WEBGL =
  '[data-testid=sim-player] canvas:not([aria-label]) { visibility: hidden !important; }';
