import type { AiTrustMetrics, SimEvent, TrendPoint } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { aiLabel } from '@/components/hud/ai-chip';
import { ratingAnswer, trustAnswer } from '@/lib/aar/answers';
import { eventLine, type CommsContext } from '@/lib/hud/comms';

const ctx: CommsContext = {
  trackPos: () => null,
  effectorPos: () => null,
  assetName: () => 'Post Alpha',
};

describe('AI-assist wording (SPEC §13.3)', () => {
  it('says it is a suggestion, with confidence', () => {
    const ai = { suggestedClass: 'QUAD_SMALL' as const, confidence: 0.724, decision: null };
    expect(aiLabel(ai)).toBe('AI SUGGESTS · QDS · 72%');
    expect(aiLabel(ai, false)).toBe('AI SUGGESTS · SMALL QUADCOPTER · 72%');
  });

  it('acknowledges shown, accepted and rejected in Comms', () => {
    const p = { suggestedClass: 'BIRD_SMALL', confidence: 0.6 };
    const line = (type: string) =>
      eventLine({ seq: 1, tMs: 1000, type, trackId: 'T002', payload: p } as unknown as SimEvent, ctx)
        ?.text;
    expect(line('AI_SUGGESTION_SHOWN')).toBe(
      'T002 AI SUGGESTS  SMALL BIRD · 60 %  (Y ACCEPT · X REJECT)',
    );
    expect(line('AI_SUGGESTION_ACCEPTED')).toBe('T002 AI SUGGESTION ACCEPTED  SMALL BIRD');
    expect(line('AI_SUGGESTION_REJECTED')).toBe('T002 AI SUGGESTION REJECTED');
  });
});

const trust = (over: Partial<AiTrustMetrics>): AiTrustMetrics => ({
  shown: 4,
  shownCorrect: 3,
  shownWrong: 1,
  acceptedCorrect: 3,
  acceptedWrong: 1,
  rejectedCorrect: 0,
  rejectedWrong: 0,
  overTrust: 1,
  underTrust: 0,
  ...over,
});

describe('trust and rating answers (DESIGN §11.7)', () => {
  it('names over-trust', () => {
    expect(trustAnswer(trust({}))).toBe(
      'Over-trusting: accepted 1 of 1 wrong suggestions, rejected 0 of 3 correct ones. Check the camera before you accept.',
    );
    expect(trustAnswer(trust({ shown: 0, overTrust: null, underTrust: null }))).toMatch(/^No AI/);
    expect(trustAnswer(trust({ acceptedWrong: 0, rejectedWrong: 1, overTrust: 0 }))).toMatch(
      /^Calibrated/,
    );
  });

  it('reads the rating trend', () => {
    const p = (before: number | null, after: number | null) =>
      ({ ratingBefore: before, ratingAfter: after }) as TrendPoint;
    expect(ratingAnswer([], 1000)).toBe('Rating 1000: no rated Assessment session yet.');
    expect(ratingAnswer([p(1000, 1014), p(1014, 1040)], 1040)).toBe(
      'Yes: 1040 now, from 1000 over 2 sessions.',
    );
    expect(ratingAnswer([p(null, null), p(1000, 990)], 990)).toMatch(/complete another/);
  });
});
