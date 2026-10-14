import { describe, expect, it } from 'vitest';
import {
  ACQ_AFTER_MS,
  actionStates,
  altitudeBand,
  angleDiffDeg,
  eoChip,
  friendlyInJamSector,
  leakImminent,
} from '@/lib/hud/derive';
import type { EffectorView, HudSnapshot, RfStrobeView, TrackView } from '@/lib/sim/store';

function track(over: Partial<TrackView> = {}): TrackView {
  return {
    id: 'T001',
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
    classifiedAs: null,
    affiliation: 'UNKNOWN',
    rf: null,
    ...over,
  };
}

const jammer: EffectorView = {
  id: 'jam1',
  kind: 'EW_JAM',
  rangeM: 2000,
  ammo: null,
  readyAtMs: 0,
  cooldownMs: 10_000,
};

function hud(over: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    tMs: 10_000,
    durationMs: 300_000,
    endReason: null,
    roe: 'WEAPONS_TIGHT',
    paused: false,
    tracks: [track()],
    rfStrobes: [],
    effectors: [],
    selectedTrackId: 'T001',
    alerts: [],
    ...over,
  };
}

describe('altitudeBand (SPEC §4.3)', () => {
  it.each([
    [0, 'LOW'],
    [49.9, 'LOW'],
    [50, 'MEDIUM'],
    [150, 'MEDIUM'],
    [150.1, 'HIGH'],
  ] as const)('%d m AGL is %s', (agl, band) => {
    expect(altitudeBand(agl)).toBe(band);
  });
});

describe('angleDiffDeg', () => {
  it('wraps across north', () => {
    expect(angleDiffDeg(355, 5)).toBe(-10);
    expect(angleDiffDeg(5, 355)).toBe(10);
    expect(angleDiffDeg(180, 0)).toBe(180);
  });
});

describe('leakImminent', () => {
  const assets = [{ id: 'a1', name: 'Post Alpha', x: 0, z: 0, radiusM: 150 }];

  it('warns for a closing track near an asset', () => {
    const b = leakImminent([track({ z: 700, headingDeg: 180 })], assets);
    expect(b).toEqual({
      tone: 'crit',
      text: 'LEAK IMMINENT — T001 0.55 km from Post Alpha, closing',
    });
  });

  it('ignores tracks that are opening, far, friendly or neutral', () => {
    expect(leakImminent([track({ z: 700, headingDeg: 0 })], assets)).toBeNull();
    expect(leakImminent([track({ z: 2000 })], assets)).toBeNull();
    expect(leakImminent([track({ z: 700, affiliation: 'FRIENDLY' })], assets)).toBeNull();
    expect(leakImminent([track({ z: 700, affiliation: 'NEUTRAL' })], assets)).toBeNull();
  });
});

describe('friendlyInJamSector', () => {
  const pos = { x: 0, z: 0 };

  it('warns when a trainee-marked friendly is within ±10° of the jam bearing', () => {
    const sel = track({ id: 'T001', x: 0, z: 1000 }); // bearing 000
    const friend = track({ id: 'T002', x: 120, z: 900, affiliation: 'FRIENDLY' }); // ~008
    const b = friendlyInJamSector(sel, [sel, friend], [], jammer, pos);
    expect(b?.text).toBe('FRIENDLY IN JAM SECTOR — T002 marked friendly at 008°');
  });

  it('handles the 0° wrap (target 355°, friendly 004°)', () => {
    const sel = track({ id: 'T001', x: -87, z: 996 });
    const friend = track({ id: 'T002', x: 70, z: 998, affiliation: 'FRIENDLY' });
    expect(friendlyInJamSector(sel, [sel, friend], [], jammer, pos)).not.toBeNull();
  });

  it('uses friendly ID strobes, and ignores unmarked tracks or tracks outside the sector', () => {
    const sel = track({ x: 0, z: 1000 });
    const strobe: RfStrobeView = {
      id: 'E01',
      sensorId: 'rf1',
      bearingDeg: 6,
      band: '2.4GHz',
      friendlyIdCode: 'B1',
      ageMs: 0,
    };
    expect(friendlyInJamSector(sel, [sel], [strobe], jammer, pos)?.text).toBe(
      'FRIENDLY IN JAM SECTOR — friendly ID B1 heard at 006°',
    );
    const unknown = track({ id: 'T002', x: 50, z: 900 });
    const wide = track({ id: 'T003', x: 600, z: 800, affiliation: 'FRIENDLY' });
    expect(friendlyInJamSector(sel, [sel, unknown, wide], [], jammer, pos)).toBeNull();
    expect(friendlyInJamSector(sel, [sel], [strobe], null, null)).toBeNull();
  });
});

describe('actionStates', () => {
  const sites = { EW_JAM: { view: jammer, x: 0, z: 0 } };

  it('explains why everything is disabled without a selection', () => {
    const s = actionStates(hud({ selectedTrackId: null }), sites);
    expect(s.MARK).toEqual({ enabled: false, reason: 'Select a track first (Tab or click)' });
  });

  it('gates intercept on ROE using the trainee call, and reports missing effectors', () => {
    const s = actionStates(hud(), sites);
    expect(s.INTERCEPT.reason).toBe('No interceptor in this scenario');
    const int = {
      view: { ...jammer, id: 'int1', kind: 'INTERCEPT' as const, ammo: 2 },
      x: 0,
      z: 0,
    };
    expect(actionStates(hud(), { INTERCEPT: int }).INTERCEPT.reason).toBe(
      'ROE: weapons tight — declare the track HOSTILE first (H)',
    );
    const hostile = hud({ tracks: [track({ affiliation: 'HOSTILE' })] });
    expect(actionStates(hostile, { INTERCEPT: int }).INTERCEPT.enabled).toBe(true);
    expect(actionStates(hud({ roe: 'WEAPONS_HOLD' }), { INTERCEPT: int }).INTERCEPT.reason).toBe(
      'ROE: weapons hold — no intercept',
    );
  });

  it('reports cooldown, ammo and estimated range', () => {
    const cooling = { view: { ...jammer, readyAtMs: 14_200 }, x: 0, z: 0 };
    expect(actionStates(hud(), { EW_JAM: cooling }).EW_JAM.reason).toBe('Jammer reloading — 4.2 s');
    const far = hud({ tracks: [track({ z: 2400, altitudeAglM: 0 })] });
    expect(actionStates(far, sites).EW_JAM.reason).toBe('Out of range — 2.40 km > 2.00 km');
    const empty = { view: { ...jammer, kind: 'INTERCEPT' as const, ammo: 0 }, x: 0, z: 0 };
    const hostile = hud({ roe: 'WEAPONS_FREE' });
    expect(actionStates(hostile, { INTERCEPT: empty }).INTERCEPT.reason).toBe(
      'No interceptor rounds left',
    );
  });
});

describe('eoChip', () => {
  it('shows ACQ only after CUE has been held without a lock', () => {
    expect(eoChip('MANUAL', null, 0)).toBe('MAN');
    expect(eoChip('CUE', 1000, 1000 + ACQ_AFTER_MS - 50)).toBe('CUE');
    expect(eoChip('CUE', 1000, 1000 + ACQ_AFTER_MS)).toBe('ACQ');
    expect(eoChip('TRACK', 1000, 99_000)).toBe('TRK');
  });
});
