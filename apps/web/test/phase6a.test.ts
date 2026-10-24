import { ContactClass, ErrorCode } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { SILHOUETTE_FAMILY } from '@/components/hud/primitives/class-silhouette';
import { rovingIndex } from '@/components/ui/tabs';
import { NAV, isActive, navFor } from '@/lib/nav';
import { errorCopy } from '@/lib/strings';

const ids = (role: Parameters<typeof navFor>[0]) => navFor(role).map((n) => n.id);
const item = (id: string) => NAV.find((n) => n.id === id)!;

describe('shell navigation (DESIGN §11.0)', () => {
  it('trainees see Training and After-action only; staff add Unit and Builder', () => {
    expect(ids('TRAINEE')).toEqual(['training', 'aar']);
    expect(ids('INSTRUCTOR')).toEqual(['training', 'aar', 'unit', 'builder']);
    expect(ids('ADMIN')).toEqual(ids('INSTRUCTOR'));
  });

  it('never shows an item whose page does not exist yet', () => {
    for (const role of ['TRAINEE', 'INSTRUCTOR', 'ADMIN'] as const)
      for (const n of navFor(role)) expect(n.ready).toBe(true);
    expect(NAV.filter((n) => !n.ready).map((n) => n.id)).toEqual(['home', 'library', 'record']);
  });

  it('keeps Builder active on both ways of building a scenario', () => {
    expect(isActive(item('builder'), '/instructor/builder')).toBe(true);
    expect(isActive(item('builder'), '/instructor/text')).toBe(true);
    expect(isActive(item('unit'), '/instructor/text')).toBe(false);
    expect(isActive(item('unit'), '/instructor/builder')).toBe(false);
  });

  it('activates Unit on the dashboard and scoring weights, After-action on any AAR page', () => {
    expect(isActive(item('unit'), '/instructor')).toBe(true);
    expect(isActive(item('unit'), '/instructor/scoring')).toBe(true);
    expect(isActive(item('aar'), '/aar/trends')).toBe(true);
    expect(isActive(item('aar'), '/aar/session/abc')).toBe(true);
    expect(isActive(item('training'), '/train/scenario/x')).toBe(true);
  });

  it('matches whole path segments only', () => {
    expect(isActive(item('training'), '/trainer')).toBe(false);
    expect(isActive(item('aar'), '/aardvark')).toBe(false);
  });
});

describe('API error copy (audit P1-8)', () => {
  it('words every API error code without the raw API message', () => {
    for (const code of [...ErrorCode.options, 'NETWORK', 'BAD_RESPONSE', undefined] as const) {
      const c = errorCopy(code, 'session');
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.detail.length).toBeGreaterThan(0);
      expect(`${c.title} ${c.detail}`).not.toMatch(/validation failed|ENV|SPEC|§/i);
    }
  });

  it('treats a missing or invalid item as a neutral notice, not an alarm', () => {
    expect(errorCopy('NOT_FOUND', 'scenario')).toMatchObject({
      title: 'This scenario does not exist.',
      tone: 'neutral',
      retry: false,
    });
    expect(errorCopy('VALIDATION_ERROR', 'scenario').tone).toBe('neutral');
    expect(errorCopy('FORBIDDEN').tone).toBe('neutral');
  });

  it('offers a retry only where trying again can help', () => {
    expect(errorCopy('NETWORK').retry).toBe(true);
    expect(errorCopy('INTERNAL').retry).toBe(true);
    expect(errorCopy('RATE_LIMITED').retry).toBe(true);
    expect(errorCopy('NOT_FOUND').retry).toBe(false);
  });
});

describe('roving keyboard index (Tabs, SegmentedControl, Menu)', () => {
  it('moves with arrows and wraps', () => {
    expect(rovingIndex('ArrowRight', 0, 3)).toBe(1);
    expect(rovingIndex('ArrowDown', 2, 3)).toBe(0);
    expect(rovingIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(rovingIndex('ArrowUp', 1, 3)).toBe(0);
  });

  it('jumps with Home / End and ignores other keys', () => {
    expect(rovingIndex('Home', 2, 3)).toBe(0);
    expect(rovingIndex('End', 0, 3)).toBe(2);
    expect(rovingIndex('Enter', 1, 3)).toBeNull();
    expect(rovingIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('class silhouettes', () => {
  it('draws every contact class', () => {
    for (const cls of ContactClass.options) expect(SILHOUETTE_FAMILY[cls]).toBeDefined();
  });
});
