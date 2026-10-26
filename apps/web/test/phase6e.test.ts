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
