import { ContactReport } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { reportText } from '@/lib/hud/comms';
import {
  REPORT_NEARBY_M,
  nearbyTracks,
  prefillReport,
  reportPayload,
  toggleReportTrack,
} from '@/lib/hud/report';
import type { HudSnapshot, TrackView } from '@/lib/sim/store';

// Phase 4a Step 9: the contact report prefill uses only operator-known values.

function track(over: Partial<TrackView> = {}): TrackView {
  return {
    id: 'T001',
    sensorId: 'r1',
    status: 'ACTIVE',
    rangeM: 2710,
    bearingDeg: 343.4,
    altitudeAglM: 62,
    headingDeg: 158.6,
    speedMps: 12,
    x: -790,
    z: 2590,
    createdTMs: 0,
    markedDetected: true,
    classifiedAs: 'QUAD_SMALL',
    affiliation: 'HOSTILE',
    rf: null,
    snrDb: 10,
    doppler: 'MULTIROTOR',
    ai: null,
    ...over,
  };
}

function hud(tracks: TrackView[]): HudSnapshot {
  return {
    tMs: 60_000,
    durationMs: 300_000,
    endReason: null,
    roe: 'WEAPONS_TIGHT',
    paused: false,
    tracks,
    rfStrobes: [],
    effectors: [],
    selectedTrackId: tracks[0]?.id ?? null,
    alerts: [],
  };
}

describe('contact report prefill', () => {
  it('fills location, heading, count, class, affiliation and height band; activity unknown', () => {
    const d = prefillReport(hud([track()]), ['T001'])!;
    expect(d).toMatchObject({
      trackIds: ['T001'],
      count: 1,
      class: 'QUAD_SMALL',
      affiliation: 'HOSTILE',
      bearingDeg: 343.4,
      rangeM: 2710,
      fromSensorId: 'r1',
      headingDeg: 159,
      headingKnown: true,
      altitudeBand: 'MEDIUM',
      activity: 'UNKNOWN',
    });
    // The payload is a valid SPEC §4.3 report.
    expect(() => ContactReport.parse(reportPayload(d, 60_000))).not.toThrow();
  });

  it('reports an unclassified track as UNKNOWN type and marks a missing heading', () => {
    const d = prefillReport(hud([track({ classifiedAs: null, headingDeg: null })]), ['T001'])!;
    expect(d.class).toBe('UNKNOWN');
    expect(d.headingDeg).toBe(0);
    expect(d.headingKnown).toBe(false);
  });

  it('uses the estimated height, so the band follows the track, not the truth', () => {
    expect(prefillReport(hud([track({ altitudeAglM: 30 })]), ['T001'])!.altitudeBand).toBe('LOW');
    expect(prefillReport(hud([track({ altitudeAglM: 200 })]), ['T001'])!.altitudeBand).toBe('HIGH');
  });

  it('offers nearby active tracks, closest first, and counts the tracks added', () => {
    const near = track({ id: 'T002', x: -700, z: 2600 });
    const nearer = track({ id: 'T003', x: -780, z: 2590 });
    const far = track({ id: 'T004', x: -790 + REPORT_NEARBY_M + 10, z: 2590 });
    const lost = track({ id: 'T005', status: 'LOST' });
    const h = hud([track(), near, nearer, far, lost]);
    expect(nearbyTracks(h, h.tracks[0]!).map((t) => t.id)).toEqual(['T003', 'T002']);
    const d = toggleReportTrack(h, prefillReport(h, ['T001'])!, 'T002');
    expect(d.trackIds).toEqual(['T001', 'T002']);
    expect(d.count).toBe(2);
    const back = toggleReportTrack(h, d, 'T001');
    // Location now comes from the first track left.
    expect(back.trackIds).toEqual(['T002']);
    expect(back.count).toBe(1);
    // The last track cannot be removed.
    expect(toggleReportTrack(h, back, 'T002')).toBe(back);
  });

  it('acknowledges in Comms with the tracks, count, class and activity', () => {
    const d = { ...prefillReport(hud([track()]), ['T001'])!, activity: 'APPROACHING' as const };
    expect(reportText(reportPayload(d, 0))).toBe(
      'REPORT SENT  T001  1 × SMALL QUADCOPTER · HOSTILE · APPROACHING',
    );
  });
});
