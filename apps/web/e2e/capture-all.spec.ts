import { writeFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Capture every screen and time the three journeys (Part 6.0 audit, re-run in 6H).
// Tag @capture: excluded from `pnpm e2e`; run with `pnpm --filter @vyuh/web e2e:capture`.
// Meant for a production build (E2E_BASE_URL, E2E_API_URL) in real time: no
// __vyuhE2E hook. Output in CAPTURE_OUT (default e2e/checkpoint/capture, git-ignored).
// It writes data: practice / assessment sessions on trainee1, 3 and 6 (remove with
// `pnpm seed:reset-demo --yes`) and the builder's default authored scenario.

const OUT = process.env.CAPTURE_OUT ?? 'e2e/checkpoint/capture';
mkdirSync(OUT, { recursive: true });
const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';

const SIZES = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
const PHONE = { name: '390x844', width: 390, height: 844 };

interface Note {
  t: number;
  step: string;
  ok: boolean;
  detail?: string;
}

class Journal {
  start = Date.now();
  clicks = 0;
  keys = 0;
  notes: Note[] = [];
  constructor(public name: string) {}
  mark(step: string, ok = true, detail?: string) {
    this.notes.push({ t: (Date.now() - this.start) / 1000, step, ok, detail });
  }
  save() {
    writeFileSync(
      `${OUT}/journey-${this.name}.json`,
      JSON.stringify({ clicks: this.clicks, keys: this.keys, notes: this.notes }, null, 2),
    );
  }
}

function watchConsole(page: Page, tag: string) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return () => writeFileSync(`${OUT}/console-${tag}.txt`, errors.join('\n'));
}

async function shot(page: Page, name: string, size: string, full = false) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-${size}.png`, fullPage: full });
}

async function overflowX(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function devLogin(page: Page, email: string) {
  const res = await page.request.post(`${API}/auth/dev-login`, { data: { email } });
  expect(res.ok(), await res.text()).toBe(true);
  const { accessToken } = (await res.json()) as { accessToken: string };
  await page.goto('/login');
  await page.evaluate((t) => window.localStorage.setItem('vyuh.localToken', t), accessToken);
}

const overflow: Record<string, number> = {};

// ---------- static screens at every size ----------

for (const s of [...SIZES, PHONE]) {
  test(`public ${s.name} @capture`, async ({ page }) => {
    await page.setViewportSize({ width: s.width, height: s.height });
    const done = watchConsole(page, `public-${s.name}`);
    for (const [name, path] of [
      ['landing', '/'],
      ['login', '/login'],
      ['sources', '/sources'],
      ['404', '/no-such-page'],
    ] as const) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      overflow[`${name}-${s.name}`] = await overflowX(page);
      await shot(page, `pub-${name}`, s.name, true);
      await shot(page, `pub-${name}-fold`, s.name);
    }
    writeFileSync(`${OUT}/overflow-public-${s.name}.json`, JSON.stringify(overflow, null, 2));
    done();
  });
}

for (const s of SIZES) {
  test(`signed-in screens ${s.name} @capture`, async ({ page }) => {
    test.setTimeout(400_000);
    await page.setViewportSize({ width: s.width, height: s.height });
    const done = watchConsole(page, `signed-in-${s.name}`);
    const of: Record<string, number> = {};

    await devLogin(page, 'trainee2@demo');
    await page.goto('/train');
    await expect(page.getByTestId('scenario-S01')).toBeVisible({ timeout: 60_000 });
    of.train = await overflowX(page);
    await shot(page, 'train', s.name);
    await shot(page, 'train-full', s.name, true);

    // Generate panel error / empty: submit nothing special, just capture panel.
    await page.getByTestId('generate-panel').scrollIntoViewIfNeeded();
    await shot(page, 'train-generate', s.name);

    for (const code of ['S15', 'S06']) {
      await page.goto('/train');
      await page.getByTestId(`scenario-${code}`).click();
      await expect(page.getByTestId('start-session')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('briefing-map')).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      of[`briefing-${code}`] = await overflowX(page);
      await shot(page, `briefing-${code}`, s.name);
    }

    await page.goto('/aar/trends');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    of.trends = await overflowX(page);
    await shot(page, 'trends', s.name);
    await shot(page, 'trends-full', s.name, true);

    // A demo AAR (replay) for trainee2.
    const token = await page.evaluate(() => window.localStorage.getItem('vyuh.localToken'));
    const headers = { Authorization: `Bearer ${token}` };
    const me = await (await page.request.get(`${API}/auth/me`, { headers })).json();
    const hist = await page.request.get(`${API}/aar/users/${me.id}/trends`, { headers });
    const body = hist.ok() ? await hist.json() : null;
    const sid: string | undefined =
      body?.sessions?.at(-1)?.sessionId ?? body?.points?.at(-1)?.sessionId;
    if (sid) {
      await page.goto(`/aar/session/${sid}`);
      await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
      await page.waitForTimeout(2000);
      of.aar = await overflowX(page);
      await shot(page, 'aar', s.name);
      await page
        .getByTestId('truth-toggle')
        .click()
        .catch(() => {});
      await shot(page, 'aar-truth', s.name);
      for (const tab of ['debrief', 'ai']) {
        await page
          .getByTestId(`aar-tab-${tab}`)
          .click()
          .catch(() => {});
        await page.waitForTimeout(1500);
        await shot(page, `aar-tab-${tab}`, s.name);
      }
    }

    // Error states.
    await page.goto('/aar/session/00000000-0000-4000-8000-000000000000');
    await page.waitForTimeout(3000);
    await shot(page, 'err-aar-missing', s.name);
    await page.goto('/train/scenario/does-not-exist');
    await page.waitForTimeout(3000);
    await shot(page, 'err-briefing-missing', s.name);

    await devLogin(page, 'instructor@demo');
    for (const [name, path, id] of [
      ['unit', '/instructor', 'unit-dashboard'],
      ['builder', '/instructor/builder', 'builder'],
      ['from-text', '/instructor/text', 'from-text'],
      ['scoring', '/instructor/scoring', 'weights'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByTestId(id).first()).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(2000);
      of[name] = await overflowX(page);
      await shot(page, name, s.name);
      await shot(page, `${name}-full`, s.name, true);
    }
    writeFileSync(`${OUT}/overflow-signed-in-${s.name}.json`, JSON.stringify(of, null, 2));
    done();
  });
}

// ---------- sim player at both sizes (real time) ----------

for (const s of SIZES) {
  test(`player S15 practice ${s.name} @capture`, async ({ page }) => {
    test.setTimeout(400_000);
    await page.setViewportSize({ width: s.width, height: s.height });
    const done = watchConsole(page, `player-${s.name}`);
    await devLogin(page, 'trainee3@demo');
    await page.goto('/train');
    await page.getByTestId('scenario-S15').click();
    await page.getByTestId('mode-practice').click();
    await page.getByTestId('start-session').click();
    await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 60_000 });
    await shot(page, 'player-start', s.name);
    const row = page.locator('tr[data-track-id]').first();
    await expect(row).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(3000);
    await shot(page, 'player-first-track', s.name);
    await row.click();
    await page.waitForTimeout(800);
    await shot(page, 'player-selected', s.name);
    await page.keyboard.press('Space');
    await page.waitForTimeout(3000);
    await shot(page, 'player-eo-cued', s.name);
    await page
      .getByRole('tab', { name: /RF/ })
      .click()
      .catch(() => {});
    await shot(page, 'player-tab-rf', s.name);
    await page
      .getByRole('tab', { name: /Spectrogram/ })
      .click()
      .catch(() => {});
    await shot(page, 'player-tab-spectro', s.name);
    await page
      .getByRole('tab', { name: /Tracks/ })
      .click()
      .catch(() => {});
    await page
      .locator('button:disabled')
      .first()
      .hover({ force: true })
      .catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, 'player-disabled-hover', s.name);
    await page.keyboard.press('r');
    await page.waitForTimeout(400);
    await shot(page, 'player-report', s.name);
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await page.waitForTimeout(400);
    await shot(page, 'player-shortcuts', s.name);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(30_000);
    await shot(page, 'player-later', s.name);
    await page.getByRole('button', { name: 'End session' }).click();
    await shot(page, 'player-end-confirm', s.name);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(4000);
    await shot(page, 'result', s.name);
    await shot(page, 'result-full', s.name, true);
    done();
  });
}

// Below 1280 px: larger-screen notice.
test('player at 1200 px @capture', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await devLogin(page, 'trainee3@demo');
  await page.goto('/train');
  await page.getByTestId('scenario-S01').click();
  await page.getByTestId('start-session').click();
  await page.waitForTimeout(8000);
  await shot(page, 'player-narrow', '1200x800');
});

// ---------- journeys (1366×768, real time) ----------

test('journey judge @capture', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const j = new Journal('judge');
  const done = watchConsole(page, 'journey-judge');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  j.mark('landing loaded');
  const tryDemo = page.getByRole('link', { name: /try (the )?demo/i });
  j.mark('landing has "Try the demo"', (await tryDemo.count()) > 0);
  // Only path in: Sign in to train.
  await page.getByRole('link', { name: 'Sign in to train' }).click();
  j.clicks++;
  await page.waitForURL('**/login');
  j.mark('login page');
  await page.getByRole('button', { name: 'Sign in' }).click();
  j.clicks++;
  await page.waitForURL('**/train', { timeout: 60_000 });
  await expect(page.getByTestId('scenario-S15')).toBeVisible({ timeout: 60_000 });
  j.mark('training list (trainee1 default)');
  await page.getByTestId('scenario-S15').click();
  j.clicks++;
  await expect(page.getByTestId('start-session')).toBeVisible({ timeout: 60_000 });
  j.mark('S15 briefing');
  await page.getByTestId('mode-practice').click();
  j.clicks++;
  await page.getByTestId('start-session').click();
  j.clicks++;
  await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 60_000 });
  j.mark('player visible');
  await expect(page.locator('tr[data-track-id]').first()).toBeVisible({ timeout: 180_000 });
  j.mark('FIRST RADAR TRACK');
  await page.locator('tr[data-track-id]').first().click();
  j.clicks++;
  j.mark('AI chip visible', (await page.getByTestId('ai-chip').count()) > 0);
  await page.waitForTimeout(60_000);
  await page.getByRole('button', { name: 'End session' }).click();
  j.clicks++;
  await page.keyboard.press('Enter');
  j.keys++;
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  j.mark('result screen');
  await expect(page.getByTestId('debrief-source'))
    .toBeVisible({ timeout: 90_000 })
    .catch(() => {});
  j.mark('debrief shown', (await page.getByTestId('debrief-source').count()) > 0);
  await page.getByTestId('open-replay').click();
  j.clicks++;
  await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
  j.mark('AAR replay');
  await page.getByTestId('truth-toggle').click();
  j.clicks++;
  j.mark('ground truth on');
  await page.goto('/aar/trends');
  j.clicks++;
  await page.waitForLoadState('networkidle');
  j.mark('trends');
  // Unit dashboard needs an instructor: sign out, sign in as instructor@demo.
  await page.getByTestId('user-menu').click();
  await page.getByTestId('menu-sign-out').click();
  j.clicks += 2;
  await page.goto('/login');
  await page.selectOption('#email', 'instructor@demo');
  j.clicks += 2;
  await page.getByRole('button', { name: 'Sign in' }).click();
  j.clicks++;
  await page.waitForURL('**/train');
  await page.getByRole('link', { name: 'Unit', exact: true }).click();
  j.clicks++;
  await expect(page.getByTestId('unit-dashboard')).toBeVisible({ timeout: 60_000 });
  j.mark('unit dashboard');
  await page.getByTestId('nav-builder').click();
  await page.getByRole('link', { name: 'From text' }).click();
  j.clicks += 2;
  await expect(page.getByTestId('from-text')).toBeVisible({ timeout: 60_000 });
  j.mark('from text (LLM off in audit stack)');
  await page.goto('/');
  await page.getByRole('link', { name: 'Realism sources' }).first().click();
  j.clicks += 2;
  await page.waitForURL('**/sources');
  j.mark('sources');
  j.save();
  done();
});

test('journey trainee @capture', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const j = new Journal('trainee');
  const done = watchConsole(page, 'journey-trainee');
  await page.goto('/login');
  await page.selectOption('#email', 'trainee6@demo');
  j.clicks += 2;
  await page.getByRole('button', { name: 'Sign in' }).click();
  j.clicks++;
  await page.waitForURL('**/train');
  j.mark('lands on training list (no home, no welcome)');
  await page.getByTestId('scenario-S01').click();
  j.clicks++;
  await expect(page.getByTestId('start-session')).toBeVisible({ timeout: 60_000 });
  j.mark('S01 briefing');
  await page.getByTestId('mode-assessment').click();
  await page.getByTestId('start-session').click();
  j.clicks += 2;
  await expect(page.getByTestId('sim-player')).toBeVisible({ timeout: 60_000 });
  j.mark('player');
  const row = page.locator('tr[data-track-id]').first();
  await expect(row).toBeVisible({ timeout: 180_000 });
  j.mark('first track');
  await row.click();
  j.clicks++;
  for (const k of ['d', 'Space']) {
    await page.keyboard.press(k);
    j.keys++;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(6000);
  await page.keyboard.press('c');
  await page.waitForTimeout(400);
  await shot(page, 'journey-trainee-classify-menu', '1366x768');
  await page.keyboard.press('1');
  await page.keyboard.press('h');
  j.keys += 3;
  await page.waitForTimeout(800);
  await shot(page, 'journey-trainee-after-id', '1366x768');
  await page.keyboard.press('j');
  j.keys++;
  await page.waitForTimeout(800);
  await shot(page, 'journey-trainee-after-jam', '1366x768');
  j.mark('identify + jam attempted');
  // Let the assessment clock run out (180 s scenario).
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 240_000 });
  j.mark('result screen (clock ran out)');
  await expect(page.getByTestId('debrief'))
    .toBeVisible({ timeout: 90_000 })
    .catch(() => {});
  j.mark('debrief read', (await page.getByTestId('debrief').count()) > 0);
  await shot(page, 'journey-trainee-result', '1366x768', true);
  await page.getByTestId('open-replay').click();
  j.clicks++;
  await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
  j.mark('replay');
  j.save();
  done();
});

test('journey instructor @capture', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const j = new Journal('instructor');
  const done = watchConsole(page, 'journey-instructor');
  await page.goto('/login');
  await page.selectOption('#email', 'instructor@demo');
  j.clicks += 2;
  await page.getByRole('button', { name: 'Sign in' }).click();
  j.clicks++;
  await page.waitForURL('**/train');
  j.mark('lands on training list');
  await page.getByRole('link', { name: 'Builder' }).click();
  j.clicks++;
  await expect(page.getByTestId('builder-status')).toHaveText('Checks passed', { timeout: 60_000 });
  j.mark('builder ready, checks passed');
  await page.getByTestId('builder-save').click();
  j.clicks++;
  await page.waitForTimeout(3000);
  await shot(page, 'journey-instructor-saved', '1366x768');
  j.mark('builder saved', true, page.url());
  await page.getByRole('link', { name: 'Unit', exact: true }).click();
  j.clicks++;
  await expect(page.getByTestId('assign-form')).toBeVisible({ timeout: 60_000 });
  j.mark('unit dashboard + assign form');
  const opt = page
    .locator('[data-testid=assign-form] select')
    .first()
    .locator('option', { hasText: 'AUT-' });
  const hasAut = (await opt.count()) > 0;
  j.mark('authored scenario listed in assign form', hasAut);
  await shot(page, 'journey-instructor-unit', '1366x768', true);
  // Do not submit the assignment (keeps demo trainees' lists clean); time to here is recorded.
  const recent = page.getByTestId('unit-recent').locator('a[href^="/aar/session/"]').first();
  if (await recent.count()) {
    await recent.click();
    j.clicks++;
    await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
    j.mark('trainee AAR opened');
  } else j.mark('no recent-session link on unit dashboard', false);
  j.save();
  done();
});
