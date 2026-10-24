import type { Point2, SimEvent, Zone } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { eventLine, type CommsContext } from '@/lib/hud/comms';
import { actionStates, zoneBlocksIntercept } from '@/lib/hud/derive';
import { HINT_CUE_MS, HINT_UNSEEN_MS, dueHints, weaponsTightHint } from '@/lib/hud/hints';
import { centroid, densify, hatchSegments, zoneLabel } from '@/lib/hud/zones';
import { useUiStore } from '@/lib/sim/ui-store';
import type { HudSnapshot, TrackView } from '@/lib/sim/store';

// Phase 3a Step 10: no-kinetic zones in the HUD, payload release in Comms,
// practice hints. Everything shown must be operator-known (decision 66).

function track(over: Partial<TrackView> = {}): TrackView {
  return {
    id: 'T004',
    sensorId: 'r1',
    status: 'ACTIVE',
    rangeM: 1000,
    bearingDeg: 0,
    altitudeAglM: 60,
    headingDeg: 180,
    speedMps: 10,
    x: 0,
    z: 1000,
    createdTMs: 0,
    markedDetected: false,
    classifiedAs: 'QUAD_SMALL',
    affiliation: 'HOSTILE',
    rf: null,
    snrDb: 10,
    doppler: 'MULTIROTOR',
    ai: null,
    ...over,
  };
}

const square: Point2[] = [
  [-100, 900],
  [100, 900],
  [100, 1100],
  [-100, 1100],
];
const ZONES: Zone[] = [
  { id: 'Z1', kind: 'NO_KINETIC', name: 'village', polygon: square.map(([x, z]) => [x + 5000, z]) },
  { id: 'Z2', kind: 'NO_KINETIC', name: 'village', polygon: square },
  {
    id: 'B1',
    kind: 'BORDER_LINE',
    name: 'border',
    polyline: [
      [-3000, 2000],
      [3000, 2000],
    ],
  },
];

describe('no-kinetic zone in the intercept reason', () => {
  const int = {
    view: {
      id: 'int1',
      kind: 'INTERCEPT' as const,
      rangeM: 1500,
      ammo: 3,
      readyAtMs: 0,
      cooldownMs: 6000,
    },
    x: 0,
    z: 0,
  };
  const hud = (t: TrackView, roe: HudSnapshot['roe'] = 'WEAPONS_TIGHT'): HudSnapshot => ({
    tMs: 10_000,
    durationMs: 300_000,
    endReason: null,
    roe,
    paused: false,
    tracks: [t],
    rfStrobes: [],
    effectors: [],
    selectedTrackId: t.id,
    alerts: [],
  });

  it('names the zone the track estimate is in', () => {
    expect(zoneBlocksIntercept(ZONES, track())).toBe(
      'No kinetic response over the village — zone Z2',
    );
    const s = actionStates(hud(track()), { INTERCEPT: int }, ZONES).INTERCEPT;
    expect(s).toEqual({
      enabled: false,
      reason: 'No kinetic response over the village — zone Z2',
    });
  });

  it('is allowed outside the zone, and an unnamed zone still has an id', () => {
    expect(actionStates(hud(track({ z: 600 })), { INTERCEPT: int }, ZONES).INTERCEPT.enabled).toBe(
      true,
    );
    const unnamed: Zone[] = [{ id: 'Z9', kind: 'NO_KINETIC', polygon: square }];
    expect(zoneBlocksIntercept(unnamed, track())).toBe(
      'No kinetic response over this area — zone Z9',
    );
  });

  it('reports the ROE first, as the sim does', () => {
    const s = actionStates(hud(track(), 'WEAPONS_HOLD'), { INTERCEPT: int }, ZONES).INTERCEPT;
    expect(s.reason).toBe('ROE: weapons hold — no intercept');
  });
});

describe('payload release in Comms', () => {
  const ctx: CommsContext = {
    trackPos: () => null,
    effectorPos: () => null,
    assetName: () => 'Post Alpha',
  };
  const drop = (extra: Record<string, unknown>) =>
    ({
      seq: 9,
      tMs: 161_000,
      type: 'CONTACT_DROPPED',
      contactId: 'c03',
      payload: { x: 120, z: 640 },
      ...extra,
    }) as unknown as SimEvent;

  it('is a line only when the EO tracker held the track (TRK)', () => {
    expect(eventLine(drop({ trackId: 'T004' }), ctx)).toEqual({
      tMs: 161_000,
      text: 'T004 PAYLOAD RELEASE OBSERVED',
      status: 'crit',
    });
  });

  it('is silent otherwise, and never shows the contact id or position', () => {
    expect(eventLine(drop({}), ctx)).toBeNull();
    const line = eventLine(drop({ trackId: 'T004' }), ctx);
    expect(line?.text).not.toMatch(/c03|120|640/);
  });
});

describe('practice hints', () => {
  const base = {
    tMs: 30_000,
    selectedEver: new Set<string>(),
    eo: { trackMode: 'MANUAL' as const, lockTrackId: null, cueSinceTMs: null },
  };

  it('flags a track nobody has looked at after 20 s', () => {
    const fresh = track({ id: 'T002', createdTMs: 30_000 - HINT_UNSEEN_MS + 1 });
    const old = track({ id: 'T003', createdTMs: 30_000 - HINT_UNSEEN_MS });
    const lost = track({ id: 'T005', createdTMs: 0, status: 'LOST' });
    const hints = dueHints({ ...base, tracks: [fresh, old, lost] });
    expect(hints).toEqual([
      { key: 'unseen:T003', text: 'T003 has not been looked at. Tab selects it.' },
    ]);
    const seen = dueHints({ ...base, tracks: [old], selectedEver: new Set(['T003']) });
    expect(seen).toEqual([]);
  });

  it('suggests zooming after 10 s of CUE without a lock', () => {
    const eo = (since: number) => ({
      trackMode: 'CUE' as const,
      lockTrackId: 'T004',
      cueSinceTMs: since,
    });
    expect(dueHints({ ...base, tracks: [], eo: eo(30_000 - HINT_CUE_MS + 1) })).toEqual([]);
    expect(dueHints({ ...base, tracks: [], eo: eo(30_000 - HINT_CUE_MS) })).toEqual([
      { key: 'cue:T004', text: 'Zoom in (+) or wait for the range to close.' },
    ]);
    const trk = { trackMode: 'TRACK' as const, lockTrackId: 'T004', cueSinceTMs: 0 };
    expect(dueHints({ ...base, tracks: [], eo: trk })).toEqual([]);
  });

  it('never uses ground truth: hint text only names track ids', () => {
    const all = [
      ...dueHints({
        ...base,
        tracks: [track({ id: 'T003', classifiedAs: null, affiliation: 'UNKNOWN' })],
        eo: { trackMode: 'CUE', lockTrackId: 'T003', cueSinceTMs: 0 },
      }),
      weaponsTightHint('T003'),
    ];
    for (const h of all) expect(h.text).not.toMatch(/c\d\d|QUAD|FPV|BIRD|HOSTILE track|contact/i);
  });

  it('shows each hint once, tagged HINT', () => {
    const ui = useUiStore.getState();
    ui.reset({
      azDeg: 0,
      elDeg: 0,
      hfovDeg: 30,
      lockTrackId: null,
      mode: 'DAY',
      trackMode: 'MANUAL',
    });
    ui.hint(1000, 'unseen:T003', 'T003 has not been looked at. Tab selects it.');
    useUiStore.getState().hint(2000, 'unseen:T003', 'again');
    const lines = useUiStore.getState().local;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ tag: 'HINT', status: 'info', tMs: 1000 });
  });
});

describe('zone drawing helpers', () => {
  it('labels zones in upper case with id, kind and name', () => {
    expect(zoneLabel(ZONES[1]!)).toBe('Z2 · NO KINETIC · VILLAGE');
    expect(zoneLabel(ZONES[2]!)).toBe('B1 · BORDER');
  });

  it('densifies a closed ring and hatches only inside the polygon', () => {
    const ring = densify(square, 25, true);
    expect(ring[0]).toEqual(ring.at(-1));
    expect(ring.length).toBe(4 * 8 + 1);
    const segs = hatchSegments(square, 60);
    expect(segs.length).toBeGreaterThan(3);
    for (const [a, b] of segs) {
      for (const [x, z] of [a, b]) {
        expect(Math.abs(x)).toBeLessThanOrEqual(100 + 1e-6);
        expect(z).toBeGreaterThanOrEqual(900 - 1e-6);
        expect(z).toBeLessThanOrEqual(1100 + 1e-6);
      }
      expect(a[0] - a[1]).toBeCloseTo(b[0] - b[1]); // 45° lines
    }
    expect(centroid(square)).toEqual([0, 1000]);
  });
});
