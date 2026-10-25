import { expect, test, type Page, type Route } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { login } from './helpers';

// break-ui pass for Phase 6C (tag @breakui, out e2e/checkpoint/6c/break/). Same
// method as 6B: real API responses rewritten in flight, never the components.
// States: demo (as served), worst (longest plausible values, mixed across rows),
// empty, one, many. Limits: user and unit names 120, scenario name 200, scenario
// code 16 (AUT- ids), remark 500, notices list 50 (API); counts unbounded.

const OUT = 'e2e/checkpoint/6c/break';
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
const UNIT = 'Air Defence Training Wing — Detachment 7 (Northern Sector)';
const SCENARIOS = [
  'Canal Bridge — night approach from the north-east, two decoys and a relay outage',
  'X',
  'Ridge Line Overwatch at Last Light with Civilian Traffic and Two Swarm Axes Converging on Post Alpha',
];
const CODES = ['AUT-3f9a1c0b7d2e', 'S01', null];
const URL_REMARK =
  'Read https://wiki.unit.example/afadt/training/c-uas/sop-14b#reporting-under-weapons-tight-with-civilian-traffic before the next run.';
const LONG_REMARK = (
  'Good discrimination on the birds, but the swarm on the second axis was reported four minutes late and with the wrong count (3 instead of 5). Under weapons tight you must declare hostile before the intercept will release; you tried twice and lost 20 points. Next time: mark detected, cue, classify, then report — in that order — and only then pick the effector. Jamming T014 also caught the civilian hobby drone over the market. ' +
  URL_REMARK
).slice(0, 500);

const pick = <T>(xs: readonly T[], i: number) => xs[i % xs.length]!;

function many<T>(xs: readonly T[], n: number, tweak: (x: T, i: number) => T): T[] {
  if (xs.length === 0) return [];
  return Array.from({ length: n }, (_, i) => tweak(structuredClone(xs[i % xs.length]!), i));
}

const worstNotice = (n: J, i: number): J => ({
  ...n,
  id: `${n.id}-${i}`,
  title:
    i % 3 === 0
      ? `Remark from ${pick(NAMES, i + 3)} on ${pick(CODES, 0)} ${pick(SCENARIOS, i)}`
      : i % 3 === 1
        ? `Assigned: ${pick(SCENARIOS, 2)}`
        : n.title,
  body: i % 2 === 0 ? (i % 4 === 0 ? LONG_REMARK : URL_REMARK) : n.body,
});

function notices(j: J, s: State): J {
  const items = j.items as J[];
  if (s === 'empty') return { items: [], unreadCount: 0 };
  if (s === 'one') return { items: items.slice(0, 1), unreadCount: 1 };
  const n = s === 'many' ? 50 : items.length;
  return { items: many(items, n, worstNotice), unreadCount: s === 'many' ? 1284 : 7 };
}

function criteria(lv: J, big: boolean): J {
  return {
    ...lv,
    criteria: (lv.criteria as J[]).map((c) => ({
      ...c,
      value:
        c.value === null
          ? null
          : big
            ? c.unit === 'S'
              ? 1234.5
              : c.unit === 'PCT'
                ? 100
                : 1284
            : c.value,
    })),
  };
}

function record(j: J, s: State): J {
  if (s === 'demo') return j;
  const worst = s !== 'empty' && s !== 'one';
  return {
    ...j,
    user: {
      ...j.user,
      name: worst ? NAMES[3] : 'Jo',
      unit: s === 'empty' ? null : { ...(j.user.unit ?? { id: j.user.id }), name: UNIT },
    },
    assessments: s === 'empty' ? 0 : s === 'one' ? 1 : 1284,
    demoAssessments: s === 'empty' ? 0 : 1,
    rating: s === 'many' ? 2875 : j.rating,
    levels: (j.levels as J[]).map((lv, i) =>
      criteria(
        {
          ...lv,
          signoff: lv.signoff && worst ? { ...lv.signoff, byName: NAMES[2] } : lv.signoff,
          reviewDue: worst && i === 0 ? true : lv.reviewDue,
        },
        s === 'many',
      ),
    ),
    endorsements: (j.endorsements as J[]).map((e, i) =>
      s === 'empty'
        ? { ...e, earned: false, sessionId: null, scenarioName: null, earnedAt: null }
        : { ...e, scenarioName: e.scenarioName ? pick(SCENARIOS, i) : null },
    ),
  };
}

function home(j: J, s: State): J {
  if (s === 'demo') return j;
  if (s === 'empty')
    return {
      ...j,
      assignment: null,
      openAssignments: 0,
      assessments: 0,
      demoAssessments: 0,
      recent: [],
      notices: [],
      unreadCount: 0,
      stages: (j.stages as J[]).map((x) => ({ ...x, ok: 0, total: 0, rate: null })),
    };
  const a = (j.assignment as J | null) ?? {
    id: '00000000-0000-4000-8000-000000000001',
    scenarioId: '00000000-0000-4000-8000-000000000002',
    unitId: null,
    unitName: null,
    userId: null,
    userName: null,
    createdAt: '2026-09-01T08:00:00Z',
    completed: false,
    completedSessionId: null,
  };
  return {
    ...j,
    assignment: {
      ...a,
      scenarioName: SCENARIOS[2],
      scenarioCode: CODES[0],
      assignedByName: NAMES[3],
      dueAt: '2026-09-02T08:00:00Z',
    },
    openAssignments: s === 'many' ? 1284 : 1,
    assessments: s === 'one' ? 1 : 1284,
    unreadCount: s === 'many' ? 1284 : 3,
    stages: (j.stages as J[]).map((x, i) =>
      s === 'one'
        ? { ...x, ok: i % 2, total: 1, rate: i % 2 }
        : { ...x, ok: 12_840 - i * 1000, total: 12_840, rate: (12_840 - i * 1000) / 12_840 },
    ),
    recent: (j.recent as J[]).map((r, i) => ({
      ...r,
      scenarioName: pick(SCENARIOS, i),
      scenarioCode: pick(CODES, i),
    })),
    notices: (j.notices as J[]).map(worstNotice),
    nextLevel: j.nextLevel ? criteria(j.nextLevel as J, s === 'many') : j.nextLevel,
  };
}

function readiness(j: J, s: State): J {
  const rows = j.rows as J[];
  if (s === 'empty') return { ...j, rows: [] };
  if (s === 'one') return { ...j, rows: rows.slice(0, 1) };
  return {
    ...j,
    unit: { ...j.unit, name: UNIT },
    rows: many(rows, s === 'many' ? 120 : rows.length, (r, i) => ({
      ...r,
      userId: `${r.userId}`.replace(/.{4}$/, String(i).padStart(4, '0')),
      name: pick(NAMES, i),
      assessments: [0, 1284, 7][i % 3],
      lastAssessmentAt: i % 3 === 0 ? null : r.lastAssessmentAt,
      lastTotal: i % 3 === 0 ? null : r.lastTotal,
      weakestStage: i % 3 === 0 ? null : r.weakestStage,
      reviewDue: i % 4 === 1,
      awaitingSignoff: i % 2 ? 'ENGAGEMENT_CONTROLLER' : r.awaitingSignoff,
      overdueAssignments: [0, 12, 1][i % 3],
    })),
  };
}

function live(j: J, s: State): J {
  const base: J = (j.items as J[])[0] ?? {
    sessionId: '00000000-0000-4000-8000-0000000000aa',
    userId: '00000000-0000-4000-8000-0000000000bb',
    userName: 'x',
    scenarioCode: 'S15',
    scenarioName: 'Birds or Drone?',
    mode: 'PRACTICE',
    startedAt: j.polledAt,
    lastBatchAt: j.polledAt,
    simTMs: 0,
  };
  if (s === 'empty') return { ...j, items: [] };
  const n = s === 'one' ? 1 : s === 'many' ? 60 : 4;
  return {
    ...j,
    items: many([base], n, (r, i) => ({
      ...r,
      sessionId: `${r.sessionId}`.replace(/.{4}$/, String(i).padStart(4, '0')),
      userName: pick(NAMES, i),
      scenarioName: pick(SCENARIOS, i),
      scenarioCode: pick(CODES, i),
      mode: i % 2 ? 'ASSESSMENT' : 'PRACTICE',
      simTMs: [0, 3_599_000, 330_000][i % 3],
    })),
  };
}

function aar(j: J, s: State): J {
  if (s === 'demo') return j;
  const r0: J = (j.remarks as J[])[0] ?? {
    id: '00000000-0000-4000-8000-0000000000cc',
    authorName: 'x',
    body: 'x',
    createdAt: '2026-10-01T09:00:00Z',
  };
  if (s === 'empty') return { ...j, remarks: [] };
  return {
    ...j,
    remarks: many([r0], s === 'one' ? 1 : s === 'many' ? 40 : 3, (r, i) => ({
      ...r,
      id: `${r.id}`.replace(/.{4}$/, String(i).padStart(4, '0')),
      authorName: pick(NAMES, i + 2),
      body: [LONG_REMARK, URL_REMARK, 'Ok.'][i % 3],
    })),
  };
}

function status(j: J, s: State): J {
  if (s === 'demo') return j;
  if (s === 'empty')
    return { ...j, components: { api: 'OK', database: 'DOWN', llmEnabled: false } };
  const terrain = Object.fromEntries(
    Array.from({ length: s === 'many' ? 24 : 4 }, (_, i) => [
      i % 2 ? `URBAN_GENERIC_NORTHERN_SECTOR_${i}` : `JK_MOUNTAIN_${i}`,
      i + 1,
    ]),
  );
  return { ...j, versions: { ...j.versions, api: '0.1.0+build.2026-10-25.7d5dbb9', terrain } };
}

const SHAPES: [RegExp, (j: J, s: State) => J][] = [
  [/^\/home$/, home],
  [/^\/notices$/, notices],
  [/^\/notices\/count$/, (j, s) => ({ unreadCount: s === 'many' ? 1284 : j.unreadCount })],
  [/^\/record\/[^/]+$/, record],
  [/^\/units\/[^/]+\/readiness$/, readiness],
  [/^\/sessions\/active$/, live],
  [/^\/aar\/sessions\/[^/]+$/, aar],
  [/^\/status$/, status],
];

async function stub(page: Page, s: State) {
  await page.route('**/api/v1/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, '');
    const shape = SHAPES.find(([re]) => re.test(path))?.[1];
    if (!shape || s === 'demo' || route.request().method() !== 'GET') return route.continue();
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

async function noHorizontalScroll(page: Page, name: string, s: State) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const size = page.viewportSize();
  appendFileSync(`${OUT}/overflow.txt`, `${name} ${s} ${size?.width}: ${over}px\n`);
  expect.soft(over, `${name} ${s}: horizontal scroll`).toBeLessThanOrEqual(1);
}

async function visit(page: Page, path: string, name: string, s: State, full = true) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await noHorizontalScroll(page, name, s);
  await shot(page, name, s, full);
}

for (const width of [1366, 1920]) {
  test.describe(`break-ui 6C ${width}`, () => {
    test.use({ viewport: { width, height: width === 1366 ? 768 : 1080 } });
    for (const s of STATES) {
      test(`trainee pages · ${s} @breakui`, async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, 'trainee1@demo');
        await page.goto('/notices');
        const remark = page.locator('a[href*="?tab=remarks"]').first();
        await expect(remark).toBeVisible({ timeout: 60_000 });
        const aarHref = (await remark.getAttribute('href'))!;
        await stub(page, s);
        await visit(page, '/home', 'home', s);
        await visit(page, '/notices', 'notices', s, s !== 'many');
        await visit(page, '/record', 'record', s);
        await visit(page, aarHref, 'aar-remarks', s, false);
      });

      test(`staff pages · ${s} @breakui`, async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, 'instructor@demo');
        await stub(page, s);
        await visit(page, '/instructor/readiness', 'readiness', s, s !== 'many');
        await visit(page, '/instructor/live', 'live', s);
      });
    }
  });
}

for (const width of [360, 1366]) {
  test.describe(`break-ui 6C public ${width}`, () => {
    test.use({ viewport: { width, height: width === 360 ? 780 : 768 } });
    for (const s of ['demo', 'worst', 'empty', 'many'] as State[]) {
      test(`status · ${s} @breakui`, async ({ page }) => {
        await stub(page, s);
        await visit(page, '/status', 'status', s);
      });
    }
    test(`static public pages @breakui`, async ({ page }) => {
      await visit(page, '/', 'landing', 'demo');
      await visit(page, '/sources', 'sources', 'demo');
      await page.locator('[data-testid=technical-notes] summary').click();
      await noHorizontalScroll(page, 'sources-notes-open', 'demo');
      await visit(page, '/login', 'login', 'demo', false);
    });
  });
}
