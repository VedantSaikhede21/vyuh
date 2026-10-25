import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommsLog } from '@/components/hud/primitives/comms-log';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sweepTrailRad } from '@/lib/motion';

const CSS = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');

describe('motion (Phase 6D)', () => {
  it('drops the radar sweep trail under reduced motion and keeps it otherwise', () => {
    expect(sweepTrailRad(true)).toBe(0);
    expect(sweepTrailRad(false)).toBeGreaterThan(0);
  });

  it('does not animate Comms lines that are already there on first render', () => {
    const html = renderToStaticMarkup(
      createElement(CommsLog, {
        lines: [
          { id: 'a', tMs: 1000, text: 'TRACK T001 SELECTED' },
          { id: 'b', tMs: 2000, text: 'REPORT SENT' },
        ],
      }),
    );
    expect(html).toContain('REPORT SENT');
    expect(html).not.toContain('animate-comms-in');
  });

  it('keeps every entry inside 120–180 ms on the DESIGN §7 curve', () => {
    const entries = [
      ...CSS.matchAll(
        /--animate-(comms-in|fade-in\S*|pop-in\S*|unfold):\s*(\S+)\s+(\d+)ms\s+var\(--ease-ui\)/g,
      ),
    ];
    expect(entries.length).toBeGreaterThanOrEqual(6);
    for (const [, , , ms] of entries) {
      expect(Number(ms)).toBeGreaterThanOrEqual(120);
      expect(Number(ms)).toBeLessThanOrEqual(180);
    }
  });

  it('applies the reduced-motion override for the system and the Settings toggle', () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(CSS).toMatch(/:root\[data-motion='reduce'\] \*/);
  });
});
