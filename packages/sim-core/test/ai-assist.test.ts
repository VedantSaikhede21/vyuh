import type { SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { compareLogs, createSim, replaySchedule, replayTo } from '../src/index.ts';
import { loadScripted } from './fixture-logs.ts';
import { presetWorld } from './fixtures.ts';

// AI-assist (SPEC §13.3, SIM_VERSION 6): AI_SUGGESTION_SHOWN on a track's first
// selection, accept / reject only after it was shown and only once, replay exact.

describe('AI-assist suggestions', () => {
  const s15 = loadScripted('S15');
  const world = presetWorld(s15.terrain.preset);

  function untilTrack() {
    const sim = createSim(s15, world);
    while (sim.getState().tracks.length === 0) sim.tick();
    return sim;
  }

  it('is shown once, on the first selection, with the pre-baked suggestion', () => {
    const sim = untilTrack();
    const t = sim.getState().tracks[0]!;
    const spec = s15.contacts.find((c) => c.id === t.contactId)!;
    expect(t.aiShown).toBe(false);
    // Not shown yet: an answer is refused.
    const early = sim.dispatch({
      type: 'AI_SUGGESTION_ACCEPTED',
      trackId: t.id,
      payload: { ...spec.aiSuggestion! },
    });
    expect(early.ok).toBe(false);
    for (let i = 0; i < 2; i++) {
      sim.dispatch({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
      sim.tick();
    }
    const shown = sim.getEvents().filter((e) => e.type === 'AI_SUGGESTION_SHOWN');
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ trackId: t.id, payload: spec.aiSuggestion });
    expect(sim.getState().tracks[0]!.aiShown).toBe(true);

    // A forged payload is refused; the real one once; a second answer is refused.
    const forged = { suggestedClass: 'FPV' as const, confidence: 0.99 };
    expect(
      sim.dispatch({ type: 'AI_SUGGESTION_REJECTED', trackId: t.id, payload: forged }).ok,
    ).toBe(false);
    const payload = { ...spec.aiSuggestion! };
    expect(sim.dispatch({ type: 'AI_SUGGESTION_REJECTED', trackId: t.id, payload }).ok).toBe(true);
    sim.tick();
    expect(sim.getState().tracks[0]!.aiDecision).toBe('REJECTED');
    expect(sim.dispatch({ type: 'AI_SUGGESTION_ACCEPTED', trackId: t.id, payload }).ok).toBe(false);
    // Accepting is an answer only: classification is a separate command.
    expect(sim.getState().tracks[0]!.classifiedAs).toBeNull();
  });

  it('replays exactly', () => {
    const sim = untilTrack();
    const t = sim.getState().tracks[0]!;
    const spec = s15.contacts.find((c) => c.id === t.contactId)!;
    sim.dispatch({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
    sim.tick();
    sim.dispatch({
      type: 'AI_SUGGESTION_ACCEPTED',
      trackId: t.id,
      payload: { ...spec.aiSuggestion! },
    });
    sim.dispatch({
      type: 'CLASSIFIED',
      trackId: t.id,
      payload: { class: spec.aiSuggestion!.suggestedClass },
    });
    for (let i = 0; i < 200; i++) sim.tick();
    const log: readonly SimEvent[] = sim.getEvents();
    const again = createSim(s15, world);
    replayTo(again, replaySchedule(log), sim.getState().clock.tMs);
    expect(compareLogs(log, again.getEvents())).toEqual({ ok: true });
  });
});
