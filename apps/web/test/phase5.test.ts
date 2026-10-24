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
      eventLine(
        { seq: 1, tMs: 1000, type, trackId: 'T002', payload: p } as unknown as SimEvent,
        ctx,
      )?.text;
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

describe('text-to-scenario parameters (SPEC §13.2)', () => {
  it('lists what was parsed and marks the rest as auto', async () => {
    const { parameterRows } = await import('@/lib/ai/from-text');
    const rows = parameterRows({
      terrainPreset: 'PUNJAB_PLAINS',
      difficulty: 4,
      seed: 12,
      timeBand: 'NIGHT',
      swarmSize: 8,
      decoys: 2,
      approachBearingDeg: 0,
    });
    const get = (l: string) => rows.find((r) => r.label === l)!;
    expect(get('Time of day').value).toBe('Night');
    expect([get('Swarm').value, get('Swarm').unit]).toEqual(['8', 'drones']);
    expect(get('Decoys').value).toBe('2');
    expect(get('Main threat axis').value).toBe('000°');
    expect(get('Weather').auto).toBe(true);
  });
});

describe('spectrogram composition (SPEC §6.4)', () => {
  it('noise falls with SNR and is render-only and repeatable', async () => {
    const { composeFrame, noiseAmplitude } = await import('@/lib/hud/spectrogram');
    expect(noiseAmplitude(8)).toBeGreaterThan(noiseAmplitude(20));
    expect(noiseAmplitude(60)).toBe(0.05);
    const w = 8;
    const h = 4;
    const tpl = new Uint8Array(w * h).map((_, i) => (i % w === 0 ? 255 : 0));
    const frame = (snr: number, t: number) => {
      const out = new Uint8ClampedArray(w * h * 4);
      composeFrame(tpl, w, h, { timeSpanS: 0.4 }, snr, t, 7, out);
      return out;
    };
    expect(frame(12, 1000)).toEqual(frame(12, 1000));
    expect(frame(12, 1000)).not.toEqual(frame(12, 1050));
    // Strong returns keep the template's contrast; weak ones drown in noise.
    const contrast = (f: Uint8ClampedArray) => {
      const vals = Array.from({ length: w * h }, (_, i) => f[i * 4]!);
      const lit = vals.filter((_, i) => tpl[i] === 255);
      const dark = vals.filter((_, i) => tpl[i] === 0);
      return (
        lit.reduce((a, b) => a + b, 0) / lit.length - dark.reduce((a, b) => a + b, 0) / dark.length
      );
    };
    expect(contrast(frame(30, 0))).toBeGreaterThan(contrast(frame(8, 0)));
  });
});

describe('committed spectrogram index', () => {
  it('has every family with camelCase axes', async () => {
    const { readFileSync } = await import('node:fs');
    const idx = JSON.parse(
      readFileSync(new URL('../public/signatures/signatures.json', import.meta.url), 'utf8'),
    ) as { families: Record<string, { timeSpanS: number; dopplerMaxHz: number; file: string }> };
    expect(Object.keys(idx.families).sort()).toEqual([
      'BIRD',
      'FIXED_WING',
      'HELICOPTER',
      'MULTIROTOR',
    ]);
    for (const f of Object.values(idx.families)) {
      expect(f.timeSpanS).toBeGreaterThan(0);
      expect(f.dopplerMaxHz).toBeGreaterThan(0);
    }
  });
});
