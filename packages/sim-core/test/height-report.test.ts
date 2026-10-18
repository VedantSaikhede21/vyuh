import { ACTIVITY_HOVER_MPS, type SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  createSim,
  heightNoiseSigmaM,
  predictHeight,
  updateHeightFilter,
  createHeightFilter,
} from '../src/index.ts';
import { loadScripted } from './fixture-logs.ts';
import { presetWorld } from './fixtures.ts';
import { playTrainee } from './trainee-policy.ts';

// SIM_VERSION 5 (decisions 104, 108): track height is a noisy, filtered estimate,
// and a contact report is followed by its hidden ground truth.

describe('track height estimate', () => {
  it('filters noisy height and never goes below ground', () => {
    const f = createHeightFilter(40, 0);
    updateHeightFilter(f, 44, 2000);
    expect(predictHeight(f, 2000)).toBe(44);
    expect(predictHeight(f, 3000)).toBe(46); // 2 m/s climb
    const low = createHeightFilter(-12, 0);
    expect(predictHeight(low, 0)).toBe(0);
    expect(heightNoiseSigmaM(0)).toBe(15);
    expect(heightNoiseSigmaM(2000)).toBe(25);
  });

  it.each(['S01', 'S04', 'S06', 'S13'])(
    '%s: track heights are estimates, close to but not the truth',
    (id) => {
      const scenario = loadScripted(id);
      const sim = createSim(scenario, presetWorld(scenario.terrain.preset));
      const errors: number[] = [];
      while (sim.getState().endReason === null) {
        sim.tick();
        const st = sim.getState();
        for (const t of st.tracks) {
          if (t.status !== 'ACTIVE') continue;
          const c = st.contacts.find((x) => x.id === t.contactId)!;
          errors.push(t.altitudeAglM - c.agl);
        }
      }
      expect(errors.length).toBeGreaterThan(50);
      const exact = errors.filter((e) => e === 0).length / errors.length;
      const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
      expect(exact).toBeLessThan(0.01); // never simply the true height
      expect(rms).toBeGreaterThan(2);
      expect(rms).toBeLessThan(40); // still a usable estimate
    },
  );
});

describe('REPORT_TRUTH', () => {
  const scenario = loadScripted('S04');
  const world = presetWorld(scenario.terrain.preset);

  it('follows every report with the truth for the contacts behind its tracks', () => {
    const events = playTrainee(scenario, world).getEvents();
    const reports = events.filter((e) => e.type === 'REPORT_SUBMITTED');
    expect(reports.length).toBeGreaterThan(0);
    const contactOf = new Map(
      events
        .filter((e) => e.type === 'SENSOR_TRACK_CREATED')
        .map((e) => [e.trackId!, e.contactId!] as const),
    );
    for (const r of reports) {
      const truth = events[r.seq + 1] as SimEvent;
      expect(truth.type).toBe('REPORT_TRUTH');
      expect(truth.tMs).toBe(r.tMs);
      if (truth.type !== 'REPORT_TRUTH' || r.type !== 'REPORT_SUBMITTED') continue;
      expect(truth.payload.reportSeq).toBe(r.seq);
      expect(truth.payload.contacts.map((c) => c.contactId)).toEqual(
        [...new Set(r.payload.trackIds.map((t) => contactOf.get(t)!))].sort(),
      );
      expect(truth).not.toHaveProperty('trackId');
      expect(truth).not.toHaveProperty('contactId');
    }
  });

  it('describes the contact as it was when the report was applied', () => {
    const sim = createSim(scenario, world);
    let reported = false;
    while (!reported && sim.getState().endReason === null) {
      const st = sim.getState();
      const t = st.tracks.find((x) => x.status === 'ACTIVE');
      if (t) {
        const c = st.contacts.find((x) => x.id === t.contactId)!;
        const before = { x: c.pos.x, z: c.pos.z, agl: c.agl, speed: c.speedMps };
        sim.dispatch({
          type: 'REPORT_SUBMITTED',
          payload: {
            tMs: st.clock.tMs,
            trackIds: [t.id, t.id],
            count: 1,
            class: 'UNKNOWN',
            affiliation: 'UNKNOWN',
            location: { bearingDeg: 0, rangeM: 1000, fromSensorId: t.sensorId },
            headingDeg: 0,
            altitudeBand: 'LOW',
            activity: 'UNKNOWN',
          },
        });
        sim.tick();
        const ev = sim.getEvents().find((e) => e.type === 'REPORT_TRUTH');
        expect(ev?.type).toBe('REPORT_TRUTH');
        if (ev?.type !== 'REPORT_TRUTH') return;
        expect(ev.payload.contacts).toHaveLength(1); // duplicate track ids: one contact
        const truth = ev.payload.contacts[0]!;
        expect([truth.x, truth.z, truth.aglM, truth.speedMps]).toEqual([
          before.x,
          before.z,
          before.agl,
          before.speed,
        ]);
        if (truth.speedMps < ACTIVITY_HOVER_MPS) expect(truth.activity).toBe('HOVERING');
        reported = true;
      } else {
        sim.tick();
      }
    }
    expect(reported).toBe(true);
  });

  it('rejects a report naming an unknown track', () => {
    const sim = createSim(scenario, world);
    const r = sim.dispatch({
      type: 'REPORT_SUBMITTED',
      payload: {
        tMs: 0,
        trackIds: ['T999'],
        count: 1,
        class: 'UNKNOWN',
        affiliation: 'UNKNOWN',
        location: { bearingDeg: 0, rangeM: 1000, fromSensorId: 'rad1' },
        headingDeg: 0,
        altitudeBand: 'LOW',
        activity: 'UNKNOWN',
      },
    });
    expect(r).toEqual({ ok: false, reason: 'Unknown track T999' });
  });
});
