import { describe, expect, it } from 'vitest';
import { AFFILIATION_STYLE, affiliationOutline } from '../lib/affiliation';

describe('APP-6 affiliation frames (SPEC §15.2)', () => {
  it('gives each affiliation its own shape inside the unit box, with a letter', () => {
    const shapes = (['HOSTILE', 'FRIENDLY', 'NEUTRAL', 'UNKNOWN'] as const).map((a) => {
      const pts = affiliationOutline(a);
      for (const [x, y] of pts) {
        expect(Math.abs(x)).toBeLessThanOrEqual(1);
        expect(Math.abs(y)).toBeLessThanOrEqual(1);
      }
      expect(AFFILIATION_STYLE[a].letter).toMatch(/^[HFNU]$/);
      return JSON.stringify(pts);
    });
    expect(new Set(shapes).size).toBe(4);
    // Hostile is a diamond (points on the axes), neutral a square (corners).
    expect(affiliationOutline('HOSTILE')).toContainEqual([0, 1]);
    expect(affiliationOutline('NEUTRAL')).toContainEqual([0.8, 0.8]);
  });
});
