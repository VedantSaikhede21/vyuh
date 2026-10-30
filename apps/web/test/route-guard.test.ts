import { describe, expect, it } from 'vitest';
import { guardDecision } from '@/lib/route-guard';
import { shouldReport } from '@/lib/report-error';

describe('route guard (S1)', () => {
  it('leaves public pages alone', () => {
    for (const p of ['/', '/login', '/demo', '/sources', '/status']) {
      expect(guardDecision(p, undefined, undefined)).toEqual({ kind: 'allow' });
    }
  });

  it('sends signed-out visitors to login and keeps where they were going', () => {
    expect(guardDecision('/instructor/builder', undefined, undefined)).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Finstructor%2Fbuilder',
    });
    expect(guardDecision('/settings', undefined, undefined).kind).toBe('redirect');
    expect(guardDecision('/trainee', undefined, undefined).kind).toBe('allow');
  });

  it('lets a signed-in user through, with staff pages for staff only', () => {
    expect(guardDecision('/train', '1', 'TRAINEE')).toEqual({ kind: 'allow' });
    expect(guardDecision('/instructor/builder', '1', 'TRAINEE')).toEqual({
      kind: 'redirect',
      to: '/train',
    });
    expect(guardDecision('/instructor/builder', '1', 'INSTRUCTOR')).toEqual({ kind: 'allow' });
    expect(guardDecision('/instructor', '1', 'GUEST')).toEqual({ kind: 'allow' });
    expect(guardDecision('/instructor/text', '1', 'GUEST')).toEqual({ kind: 'allow' });
  });
});

describe('error reports (S9)', () => {
  it('sends one report per message', () => {
    expect(shouldReport('boom')).toBe(true);
    expect(shouldReport('boom')).toBe(false);
    expect(shouldReport('other')).toBe(true);
  });
});
