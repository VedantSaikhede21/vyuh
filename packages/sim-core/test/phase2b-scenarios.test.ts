import type { SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { createSim, horizontalRange } from '../src/index.ts';
import { loadScripted, playS14Jam } from './fixture-logs.ts';
import { presetWorld } from './fixtures.ts';

// Phase 2 done-criteria for Part B (SPEC §12): a night scenario where a
// fibre-optic FPV is invisible to RF and a bird flock creates radar tracks
// (S13); jamming toward a hostile also hits a friendly in the sector (S14).

type TrackCreated = Extract<SimEvent, { type: 'SENSOR_TRACK_CREATED' }>;

const tracksOf = (ev: readonly SimEvent[], prefix: string): TrackCreated[] =>
  ev.filter(
    (e): e is TrackCreated => e.type === 'SENSOR_TRACK_CREATED' && e.contactId.startsWith(prefix),
  );

describe('S13 Silent Ridge (JK_MOUNTAIN, night)', () => {
  const s13 = loadScripted('S13');

  function run() {
    const sim = createSim(s13, presetWorld('JK_MOUNTAIN'));
    let strobedFpv = false;
    let strobes = 0;
    while (sim.getState().endReason === null) {
      sim.tick();
      const { rfStrobes } = sim.getState();
      strobes += rfStrobes.length;
      if (rfStrobes.some((r) => r.contactId === 'c01')) strobedFpv = true;
    }
    return { sim, strobedFpv, strobes };
  }

  it('is night, and the fibre-optic FPV never produces an RF strobe', () => {
    const { sim, strobedFpv, strobes } = run();
    expect(sim.getState().environment.isNight).toBe(true);
    expect(s13.contacts.find((c) => c.id === 'c01')?.controlLink).toBe('FIBRE_OPTIC');
    expect(strobedFpv).toBe(false);
    expect(strobes).toBe(0); // nothing in S13 emits RF
  });

  it('the bird flock creates radar tracks', () => {
    const ev = run().sim.getEvents();
    const birds = new Set(tracksOf(ev, 'b').map((e) => e.contactId));
    expect(birds.size).toBeGreaterThanOrEqual(3);
  });

  it('the FPV is first tracked late, close in, after the ridge stops masking it', () => {
    const { sim } = run();
    const ev = sim.getEvents();
    const spawn = ev.find((e) => e.type === 'CONTACT_SPAWNED' && e.contactId === 'c01')!;
    const first = tracksOf(ev, 'c01')[0]!;
    const impact = ev.find((e) => e.type === 'CONTACT_REACHED_ASSET' && e.contactId === 'c01')!;
    expect(first.tMs - spawn.tMs).toBeGreaterThan(120_000); // hidden for most of its flight
    expect(first.payload.rangeM).toBeLessThan(1600);
    expect(impact.tMs - first.tMs).toBeGreaterThanOrEqual(45_000); // still defensible
  });
});

describe('S14 Mixed Sky (PUNJAB_PLAINS, day)', () => {
  it('birds are tracked; RF hears the hostile and the friendly (no ID code)', () => {
    const s14 = loadScripted('S14');
    const sim = createSim(s14, presetWorld('PUNJAB_PLAINS'));
    const heard = new Map<string, string | null>();
    while (sim.getState().endReason === null) {
      sim.tick();
      for (const r of sim.getState().rfStrobes) heard.set(r.contactId, r.friendlyIdCode);
    }
    expect(new Set(tracksOf(sim.getEvents(), 'b').map((e) => e.contactId)).size).toBeGreaterThan(3);
    expect([...heard.keys()].sort()).toEqual(['c01', 'c02']);
    expect(heard.get('c02')).toBeNull();
  });

  it('a jam toward the hostile also takes down the friendly patrol in the sector', () => {
    const sim = playS14Jam();
    const ev = sim.getEvents();
    const outcome = ev.find((e) => e.type === 'RESPONSE_OUTCOME');
    expect(outcome).toMatchObject({
      contactId: 'c01',
      payload: { response: 'EW_JAM', result: 'NEUTRALISED', collateral: { contactIds: ['c02'] } },
    });
    const friendly = sim.getState().contacts.find((c) => c.id === 'c02')!;
    expect(friendly.defeated).toBe(true);
    expect(friendly.control).toBe('RTH');
    expect(ev.some((e) => e.type === 'CONTACT_REACHED_ASSET')).toBe(false);
    // The hostile hovers and lands well short of the post.
    const hostile = sim.getState().contacts.find((c) => c.id === 'c01')!;
    expect(horizontalRange(hostile.pos, { x: 0, y: 0, z: 0 })).toBeGreaterThan(1000);
  });
});
