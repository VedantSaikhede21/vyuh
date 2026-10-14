import { describe, expect, it } from 'vitest';
import { humaniseFeedback } from '@/lib/hud/feedback';

describe('humaniseFeedback', () => {
  it('replaces class enums with HUD labels', () => {
    expect(humaniseFeedback('Non-threat (BIRD_LARGE) was left alone.')).toBe(
      'Non-threat (large bird) was left alone.',
    );
    expect(humaniseFeedback('Misclassified as QUAD_SMALL; it was a FPV.')).toBe(
      'Misclassified as small quadcopter; it was a FPV drone.',
    );
  });

  it('replaces response results and any other UPPER_SNAKE token', () => {
    expect(humaniseFeedback('never took effect (last result: OUT_OF_RANGE).')).toBe(
      'never took effect (last result: out of range).',
    );
    expect(humaniseFeedback('it was a SOME_NEW_THING')).toBe('it was a some new thing');
  });

  it('leaves plain sentences and single capitalised words alone', () => {
    const s = 'Fast detection: acted 3.2 s after the track appeared. Check EO/IR and ROE.';
    expect(humaniseFeedback(s)).toBe(s);
  });
});
