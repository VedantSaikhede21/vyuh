import { expect, test, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { login, openBriefing } from './helpers';

// Phase 6B keyboard pass (tag @keyboard): Tab through each 6B screen from the top
// and log every stop — what it is, whether a focus ring is visible, and whether it
// is on screen. Output e2e/checkpoint/6b/keyboard/*.txt for review; the test fails
// on a stop with no visible focus indicator or a stop on a hidden element.

const OUT = 'e2e/checkpoint/6b/keyboard';
mkdirSync(OUT, { recursive: true });

interface Stop {
  tag: string;
  name: string;
  ring: boolean;
  visible: boolean;
}

async function walk(page: Page, screen: string, max = 60): Promise<Stop[]> {
  // Start from the top of the document: focus a temporary first element, then remove it.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const a = document.createElement('button');
    document.body.prepend(a);
    a.focus();
    a.remove();
  });
  const stops: Stop[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring =
        (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
      const r = el.getBoundingClientRect();
      const name = (
        el.getAttribute('aria-label') ??
        el.getAttribute('data-testid') ??
        el.textContent ??
        ''
      )
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 60);
      const key = `${el.tagName}|${name}|${Math.round(r.x)}|${Math.round(r.y + window.scrollY)}`;
      return {
        key,
        tag: `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}`,
        name,
        ring,
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden',
      };
    });
    if (!s) break;
    if (seen.has(s.key)) break; // wrapped round
    seen.add(s.key);
    stops.push({ tag: s.tag, name: s.name, ring: s.ring, visible: s.visible });
  }
  writeFileSync(
    `${OUT}/${screen}.txt`,
    stops
      .map(
        (s, i) =>
          `${String(i + 1).padStart(2)} ${s.ring ? 'ring' : 'NO-RING'} ${s.visible ? '' : 'HIDDEN '}${s.tag} ${s.name}`,
      )
      .join('\n') + '\n',
  );
  appendFileSync(`${OUT}/summary.txt`, `${screen}: ${stops.length} stops\n`);
  return stops;
}

function check(stops: Stop[], screen: string) {
  expect(stops.length, `${screen}: no focusable stops`).toBeGreaterThan(0);
  for (const s of stops) {
    expect.soft(s.ring, `${screen}: no focus ring on ${s.tag} "${s.name}"`).toBe(true);
    expect.soft(s.visible, `${screen}: focus on hidden ${s.tag} "${s.name}"`).toBe(true);
  }
}

test.use({ viewport: { width: 1366, height: 768 } });

test('trainee screens @keyboard', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'trainee1@demo');
  await page.goto('/train');
  await expect(page.getByTestId('scenario-S01')).toBeVisible({ timeout: 60_000 });
  const train = await walk(page, 'train');
  check(train, 'train');
  expect(train[0]!.name).toContain('Skip to content');

  await openBriefing(page, 'S06');
  await expect(page.getByTestId('coverage-status')).toHaveText(/^LOS coverage ·/, {
    timeout: 120_000,
  });
  check(await walk(page, 'briefing'), 'briefing');

  await page.goto('/aar/trends');
  const link = page.locator('a[href^="/aar/session/"]').first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  const sid = (await link.getAttribute('href'))!.split('/').pop()!;
  const trends = await walk(page, 'trends', 80);
  check(trends, 'trends');
  // Charts are labelled images, not tab stops.
  expect(trends.some((x) => x.tag.startsWith('svg'))).toBe(false);

  await page.goto(`/train/session/${sid}`);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  check(await walk(page, 'result', 80), 'result');

  await page.goto(`/aar/session/${sid}`);
  await expect(page.getByTestId('replay-timeline')).toBeVisible({ timeout: 120_000 });
  const aar = await walk(page, 'aar', 80);
  check(aar, 'aar');
  // The kill chain is one stop; arrows move inside it and leave the replay clock alone.
  expect(aar.filter((x) => x.name.includes('Jump to')).length).toBe(1);
  const clock = await page.getByTestId('replay-clock').textContent();
  await page.locator('[data-kc-grid] button[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-cell="1-1"]')).toBeFocused();
  expect(await page.getByTestId('replay-clock').textContent()).toBe(clock);
});

test('instructor screens @keyboard', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'instructor@demo');
  await page.goto('/instructor');
  await expect(page.getByTestId('unit-dashboard')).toBeVisible({ timeout: 60_000 });
  check(await walk(page, 'unit', 80), 'unit');

  await page.goto('/instructor/builder');
  await expect(page.getByTestId('builder-status')).toHaveText('Checks passed', {
    timeout: 120_000,
  });
  check(await walk(page, 'builder', 80), 'builder');

  await page.goto('/instructor/scoring');
  await expect(page.getByTestId('tree-versions')).toBeVisible({ timeout: 60_000 });
  check(await walk(page, 'scoring', 60), 'scoring');

  await page.goto('/instructor/text');
  await expect(page.getByTestId('from-text')).toBeVisible({ timeout: 60_000 });
  check(await walk(page, 'from-text', 40), 'from-text');
});
