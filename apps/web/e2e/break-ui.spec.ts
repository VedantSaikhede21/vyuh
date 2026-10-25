import { expect, test, type Page, type Route } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { login } from './helpers';

// break-ui pass for Phase 6B (tag @breakui, out e2e/checkpoint/6b/break/). The data
// changes at the API boundary — real responses rewritten in flight — never in the
// components. States: demo (as served), worst (longest plausible values, mixed
// across rows), empty, one, many (1,000 rows where a list is unpaginated).
// Limits used: scenario name 200 (DB) / 80 (builder form), user and unit names 120,
// scenario code 16 (AUT- ids), debrief lines 300 / summary 800, mistake and
// feedback text unbounded (server strings).

const OUT = 'e2e/checkpoint/6b/break';
mkdirSync(OUT, { recursive: true });
type State = 'demo' | 'worst' | 'empty' | 'one' | 'many';
const STATES: State[] = ['demo', 'worst', 'empty', 'one', 'many'];

type J = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const NAMES = [
  'Aleksandra Wiśniewska-Kowalczyk',
  'Jo',
  'Bartholomew Fitzgerald-Montgomery III',
  'Lt Col Raghavendra Venkatanarasimharajuvaripeta',
];
const SCENARIOS = [
  'Canal Bridge — night approach from the north-east, two decoys and a relay outage',
  'X',
  'Ridge Line Overwatch at Last Light with Civilian Traffic and Two Swarm Axes Converging on Post Alpha',
];
const CODES = ['AUT-3f9a1c0b7d2e', 'S01', null];
const MISTAKE =
  'Civilian hobby drone caught in a jam sector while the hostile quadcopter on the same bearing was still unclassified';
const FEEDBACK =
  'Intercept ordered against T014 (civilian hobby drone, RF 2.4 GHz) inside no-kinetic zone Z3 Market Square while weapons were tight: the sim blocked it, and the ROE breach costs 10 points.';

const pick = <T>(xs: readonly T[], i: number) => xs[i % xs.length]!;

function many<T>(xs: readonly T[], n: number, tweak: (x: T, i: number) => T): T[] {
  if (xs.length === 0) return [];
  return Array.from({ length: n }, (_, i) => tweak(structuredClone(xs[i % xs.length]!), i));
}

function scenarios(j: J, s: State): J {
  const items = j.items as J[];
  if (s === 'empty') return { ...j, items: [] };
  if (s === 'one') return { ...j, items: items.slice(0, 1) };
  const worst = (x: J, i: number): J => ({
    ...x,
    id: s === 'many' ? `${x.id}`.replace(/.{4}$/, String(i).padStart(4, '0')) : x.id,
    name: pick(SCENARIOS, i),
    code: pick(CODES, i),
    tags: i % 3 === 0 ? ['tutorial', 'demo', 'authored', 'night', 'swarm'] : x.tags,
    bestScore: [0, 100, null, 62.5][i % 4],
  });
  return { ...j, items: s === 'many' ? many(items, 1000, worst) : items.map(worst) };
}

function trends(j: J, s: State): J {
  const points = j.points as J[];
  if (s === 'empty') return { ...j, points: [], mistakes: [] };
  if (s === 'one') return { ...j, points: points.slice(-1), mistakes: j.mistakes.slice(0, 1) };
  const worst = (p: J, i: number): J => ({
    ...p,
    scenarioName: pick(SCENARIOS, i),
    scenarioCode: pick(CODES, i),
    total: [0, 100, 37, 99][i % 4],
    ratingAfter: i % 5 === 2 ? null : p.ratingAfter,
    ratingBefore: i % 5 === 2 ? null : p.ratingBefore,
  });
  return {
    ...j,
    points: s === 'many' ? many(points, 200, worst) : points.map(worst),
    mistakes: (j.mistakes as J[]).map((m, i) => ({ ...m, text: i === 0 ? MISTAKE : m.text })),
  };
}

function unit(j: J, s: State): J {
  if (s === 'empty')
    return {
      ...j,
      sessions: 0,
      demoSessions: 0,
      avgTotal: null,
      leaderboard: [],
      mistakes: [],
      assignments: [],
      recent: [],
    };
  const lb = j.leaderboard as J[];
  if (s === 'one')
    return {
      ...j,
      leaderboard: lb.slice(0, 1),
      recent: j.recent.slice(0, 1),
      mistakes: j.mistakes.slice(0, 1),
      assignments: j.assignments.slice(0, 1),
    };
  const n = s === 'many' ? 60 : lb.length;
  return {
    ...j,
    unit: { ...j.unit, name: 'Air Defence Training Wing — Detachment 7 (Northern Sector)' },
    leaderboard: many(lb, n, (r, i) => ({
      ...r,
      name: pick(NAMES, i),
      change: [-27, 3, null, 0][i % 4],
    })),
    recent: many(j.recent as J[], s === 'many' ? 500 : (j.recent as J[]).length, (r, i) => ({
      ...r,
      userName: pick(NAMES, i),
      scenarioName: pick(SCENARIOS, i),
      scenarioCode: pick(CODES, i),
    })),
    mistakes: (j.mistakes as J[]).map((m, i) => ({ ...m, text: i === 0 ? MISTAKE : m.text })),
    assignments: (j.assignments as J[]).map((a, i) => ({
      ...a,
      scenarioName: pick(SCENARIOS, i),
      scenarioCode: pick(CODES, i),
      pending: i === 0 ? NAMES.concat(NAMES, ['Jo']) : a.pending,
    })),
  };
}

function session(j: J, s: State): J {
  const score = j.score as J | null;
  if (!score) return j;
  if (s === 'demo') return j;
  const base = { ...j, scenarioName: s === 'worst' ? SCENARIOS[2] : j.scenarioName };
  if (s === 'empty') return { ...base, score: { ...score, penalties: [], perContact: [] } };
  const pens = score.penalties as J[];
  const pen: J = pens[0] ?? { code: 'ROE_VIOLATION_ATTEMPT', points: -10, tMs: 94_000 };
  const contacts = score.perContact as J[];
  const n = s === 'one' ? 1 : s === 'many' ? 60 : 24;
  return {
    ...base,
    score: {
      ...score,
      penalties: many([pen], n, (p, i) => ({
        ...p,
        tMs: 30_000 + i * 4_000,
        feedback: i % 2 ? FEEDBACK : 'Late report.',
        points: i % 7 === 3 ? 5 : -10,
      })),
      perContact: many(contacts, s === 'one' ? 1 : s === 'many' ? 60 : contacts.length, (c, i) => ({
        ...c,
        trackIds: i % 4 === 0 ? ['T001', 'T014', 'T027', 'T031', 'T044'] : c.trackIds,
        feedback: i % 3 === 0 ? [FEEDBACK, MISTAKE] : c.feedback,
      })),
    },
  };
}

function debrief(j: J, s: State): J {
  if (s === 'demo') return j;
  const c = j.content as J;
  if (s === 'empty') return { ...j, content: { ...c, strengths: [], mistakes: [] } };
  const m0: J = (c.mistakes as J[])[0] ?? {
    tMs: 18_000,
    what: 'x',
    whyItMatters: 'x',
    doInstead: 'x',
  };
  const long = (t: string, n: number) => (t + ' ' + MISTAKE + '. ' + FEEDBACK).slice(0, n);
  return {
    ...j,
    content: {
      summary: long('Score 37 / 100 on S09 Dusk Swarm (difficulty 4, assessment).', 800),
      strengths: Array.from({ length: s === 'one' ? 1 : 5 }, (_, i) =>
        long(`Strength ${i + 1}.`, 300),
      ),
      mistakes: Array.from({ length: s === 'one' ? 1 : 6 }, (_, i) => ({
        ...m0,
        tMs: 18_000 + i * 21_000,
        what: long(`T0${i + 10} STOPPED AT IDENTIFY:`, 300),
        whyItMatters: long('Every second unclassified is a second less to decide.', 300),
        doInstead: long('Cue the camera (Space) and zoom (+) before you classify.', 300),
      })),
      drill: long('Run S06 in Practice and classify every track within 10 s.', 400),
    },
  };
}

async function stub(page: Page, s: State) {
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const shape =
      route.request().method() === 'GET' && path === '/scenarios'
        ? scenarios
        : /^\/aar\/users\/[^/]+\/trends$/.test(path)
          ? trends
          : /^\/aar\/units\/[^/]+$/.test(path)
            ? unit
            : /^\/sessions\/[^/]+$/.test(path)
              ? session
              : /^\/aar\/sessions\/[^/]+\/debrief$/.test(path)
                ? debrief
                : null;
    if (!shape || s === 'demo') return route.continue();
    const res = await route.fetch();
    if (!res.ok()) return route.fulfill({ response: res });
    return route.fulfill({ response: res, json: shape((await res.json()) as J, s) });
  });
}

async function shot(page: Page, name: string, s: State, full = true) {
  await page.waitForTimeout(500);
  const size = page.viewportSize();
  await page.screenshot({
    path: `${OUT}/${name}-${s}-${size?.width}x${size?.height}.png`,
    fullPage: full,
  });
}

/** Horizontal page scroll is a break on every screen (DESIGN: none at 1366); logged, soft. */
async function noHorizontalScroll(page: Page, name: string, s: State) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const size = page.viewportSize();
  appendFileSync(
    `${OUT}/overflow.txt`,
    `${name} ${s} ${size?.width}: ${over}px
`,
  );
  expect.soft(over, `${name} ${s}: horizontal scroll`).toBeLessThanOrEqual(1);
}

for (const width of [1366, 1920]) {
  test.describe(`break-ui ${width}`, () => {
    test.use({ viewport: { width, height: width === 1366 ? 768 : 1080 } });
    for (const s of STATES) {
      test(`trainee screens · ${s} @breakui`, async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, 'trainee1@demo');
        // A completed session id from the real trends, before stubbing.
        await page.goto('/aar/trends');
        const link = page.locator('a[href^="/aar/session/"]').first();
        await expect(link).toBeVisible({ timeout: 60_000 });
        const sid = (await link.getAttribute('href'))!.split('/').pop()!;
        await stub(page, s);

        await page.goto('/train');
        await page.waitForLoadState('networkidle');
        await noHorizontalScroll(page, 'train', s);
        await shot(page, 'train', s, s !== 'many');
        if (s === 'many') {
          // "My generated" pages its 1,000 rows (break-ui 7).
          const rows = page.getByTestId('own-generated-table').locator('tbody tr');
          await expect(rows).toHaveCount(20);
          await page.getByTestId('own-generated-more').click();
          await expect(rows).toHaveCount(40);
        }
        await page.goto('/aar/trends');
        await page.waitForLoadState('networkidle');
        await noHorizontalScroll(page, 'trends', s);
        await shot(page, 'trends', s);
        await page.goto(`/train/session/${sid}`);
        await page.waitForLoadState('networkidle');
        await noHorizontalScroll(page, 'result', s);
        await shot(page, 'result', s);
      });

      test(`unit dashboard · ${s} @breakui`, async ({ page }) => {
        test.setTimeout(120_000);
        await login(page, 'instructor@demo');
        await stub(page, s);
        await page.goto('/instructor');
        await page.waitForLoadState('networkidle');
        await noHorizontalScroll(page, 'unit', s);
        await shot(page, 'unit', s, s !== 'many');
      });
    }
  });
}
