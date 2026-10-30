import { describe, expect, it } from 'vitest';
import {
  DEMO_STEPS,
  markStep,
  nextStep,
  parseDemoPath,
  stepFromPath,
  stepHref,
  type DemoPathState,
} from '@/lib/demo-path';
import { homeHref, navFor } from '@/lib/nav';
import { TOURS, overlaps, parseTourProgress, placeCard, shouldOpen } from '@/lib/tour';

describe('guest navigation (Phase 6E)', () => {
  it('guests see training, library, after-action, the read-only unit and From text', () => {
    expect(navFor('GUEST').map((n) => n.id)).toEqual([
      'training',
      'library',
      'aar',
      'unit',
      'text',
    ]);
    expect(homeHref('GUEST')).toBe('/train');
    expect(navFor('INSTRUCTOR').map((n) => n.id)).not.toContain('text');
  });
});

describe('demo path (SPEC §20)', () => {
  it('maps pages to steps, keeping the latest session', () => {
    expect(stepFromPath('/train/session/abc')).toEqual({ step: 'play', session: 'abc' });
    expect(stepFromPath('/aar/session/abc')).toEqual({ step: 'replay', session: 'abc' });
    expect(stepFromPath('/instructor')?.step).toBe('unit');
    expect(stepFromPath('/instructor/text')?.step).toBe('text');
    expect(stepFromPath('/sources')?.step).toBe('sources');
    expect(stepFromPath('/train')).toBeNull();
    expect(stepFromPath('/instructor/readiness')).toBeNull();
  });

  it('walks the six steps in order and links the result and replay to the last session', () => {
    let s: DemoPathState = { done: [] };
    expect(nextStep(s)).toBe('play');
    expect(stepHref('result', s)).toBe('/train');
    s = markStep(s, 'play', 's1');
    expect(nextStep(s)).toBe('result');
    expect(stepHref('result', s)).toBe('/train/session/s1');
    expect(stepHref('replay', s)).toBe('/aar/session/s1');
    // Out of order is fine; next is the first not done.
    s = markStep(markStep(s, 'unit'), 'result');
    expect(nextStep(s)).toBe('replay');
    for (const st of DEMO_STEPS) s = markStep(s, st.id);
    expect(nextStep(s)).toBeNull();
    // Marking twice returns the same object (no store write).
    expect(markStep(s, 'unit')).toBe(s);
  });

  it('reads stored progress defensively', () => {
    expect(parseDemoPath(null)).toEqual({ done: [] });
    expect(parseDemoPath('nope')).toEqual({ done: [] });
    expect(parseDemoPath('{"done":["play","bogus"],"lastSession":"x"}')).toEqual({
      done: ['play'],
      lastSession: 'x',
    });
  });
});

describe('guided tour (Phase 6E)', () => {
  const view = { w: 1366, h: 768 };
  const card = { w: 300, h: 190 };
  // Approximate sim-player regions at 1366×768 (player.tsx grid).
  const regions = {
    tactical: { x: 0, y: 40, w: 1046, h: 468 },
    radar: { x: 1046, y: 40, w: 320, h: 330 },
    eo: { x: 0, y: 508, w: 432, h: 260 },
    tracks: { x: 432, y: 508, w: 614, h: 260 },
    actions: { x: 1046, y: 508, w: 320, h: 260 },
    report: { x: 1054, y: 640, w: 304, h: 28 },
    ai: { x: 1250, y: 512, w: 100, h: 20 },
  };

  it('never puts the card over the region it explains, and keeps it on screen', () => {
    for (const [name, r] of Object.entries(regions)) {
      const p = placeCard(r, card, view);
      const box = { x: p.x, y: p.y, w: card.w, h: card.h };
      expect(overlaps(box, r), name).toBe(false);
      expect(p.x >= 0 && p.y >= 0 && p.x + card.w <= view.w && p.y + card.h <= view.h, name).toBe(
        true,
      );
    }
  });

  it('centres the card when the region is not on screen', () => {
    expect(placeCard(null, card, view)).toEqual({ x: 533, y: 289, side: 'center' });
  });

  it('every tour has 3–8 steps; the player tour covers the seven regions of SPEC §20', () => {
    expect(TOURS.player.map((s) => s.target.match(/"(\w+)"/)?.[1])).toEqual([
      'tactical',
      'radar',
      'tracks',
      'eo',
      'views',
      'actions',
      'report',
      'ai',
    ]);
    for (const t of Object.values(TOURS)) {
      expect(t.length).toBeGreaterThanOrEqual(3);
      expect(t.length).toBeLessThanOrEqual(8);
    }
  });

  it('opens by itself only when asked for or never seen with auto, and resumes', () => {
    expect(shouldOpen({}, 'player', true)).toBe(true);
    expect(shouldOpen({}, 'player', false)).toBe(false);
    expect(shouldOpen({ player: { step: 3, status: 'skipped' } }, 'player', true)).toBe(false);
    expect(shouldOpen({ player: { step: 3, status: 'open' } }, 'player', false)).toBe(true);
    expect(parseTourProgress('{"player":{"step":99,"status":"open"},"x":1}')).toEqual({
      player: { step: 7, status: 'open' },
    });
    expect(parseTourProgress('{')).toEqual({});
  });
});
