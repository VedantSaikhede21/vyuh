import { readFileSync } from 'node:fs';
import { Scenario, type EoIrSensor, type RadarSensor } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  BEARING_SIGMA_DEG,
  CLUTTER_FACTOR,
  RANGE_SIGMA_M,
  angleDiffDeg,
  bearingDeg,
  clutterFactor,
  createContactState,
  createRng,
  createSim,
  createTrackFilter,
  gaussian,
  headingVector,
  inEoFrustum,
  predictFilter,
  radarPd,
  radarScan,
  rainLossDb,
  slantRange,
  updateTrackFilter,
  type ContactState,
  type TrackFilter,
  type Vec3,
} from '../src/index.ts';
import { presetWorld, testScenario } from './fixtures.ts';

// Phase 2B radar model (SPEC §6.1, decision 50) and α-β track filter (decision 51).

const load = (id: string) =>
  Scenario.parse(
    JSON.parse(
      readFileSync(
        new URL(`../../../apps/api/app/seed/scenarios/${id}.json`, import.meta.url),
        'utf8',
      ),
    ),
  );

describe('clutter and rain (SPEC §6.1)', () => {
  it('applies clutter only below 15 m AGL and inside 2 km horizontal range', () => {
    expect(clutterFactor(14.9, 1999)).toBe(CLUTTER_FACTOR);
    expect(clutterFactor(15, 1000)).toBe(1);
    expect(clutterFactor(5, 2000)).toBe(1);
    expect(clutterFactor(40, 500)).toBe(1);
  });

  it('rain loss is two-way, grows with range and with rain rate, and is zero when dry', () => {
    expect(rainLossDb(0, 5000)).toBe(0);
    // γ(10 mm/h) = 0.0101 · 10^1.276 ≈ 0.191 dB/km; two-way over 3 km ≈ 1.14 dB.
    expect(rainLossDb(10, 3000)).toBeCloseTo(1.144, 2);
    expect(rainLossDb(10, 6000)).toBeCloseTo(2 * rainLossDb(10, 3000), 10);
    expect(rainLossDb(30, 3000)).toBeGreaterThan(rainLossDb(10, 3000));
    expect(radarPd(3000, 0.01, 3000, 20)).toBeLessThan(radarPd(3000, 0.01, 3000));
    expect(radarPd(3000, 0.01, 3000, 0)).toBeCloseTo(0.5, 10);
  });

  const scenario = testScenario();
  const radar = scenario.sensors[0] as RadarSensor;
  const spec = scenario.contacts[0]!;
  const specs = new Map([[spec.id, spec]]);
  const contactAt = (pos: Vec3, agl: number): ContactState => ({
    ...createContactState(spec),
    status: 'ACTIVE',
    pos,
    agl,
  });
  const radarPos = { x: 0, y: 6, z: 0 };

  it('clutter cuts the hit rate of a low, close contact to 0.4 × Pd', () => {
    const contact = contactAt({ x: 0, y: 10, z: 1500 }, 10);
    const stream = createRng(3).stream('radar:rad1');
    const expected = CLUTTER_FACTOR * radarPd(3000, 0.01, slantRange(radarPos, contact.pos));
    let hits = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (radarScan(radar, radarPos, [contact], specs, stream)[0]!.hit) hits++;
    }
    expect(hits / n).toBeCloseTo(expected, 1);
  });

  it('draws exactly five numbers per contact whatever clutter, rain or LOS do', () => {
    const a = createRng(9).stream('radar:rad1');
    const b = createRng(9).stream('radar:rad1');
    radarScan(radar, radarPos, [contactAt({ x: 0, y: 8, z: 900 }, 8)], specs, a, () => false, 40);
    radarScan(radar, radarPos, [contactAt({ x: 0, y: 80, z: 2500 }, 80)], specs, b);
    expect(a.next()).toBe(b.next());
  });

  it('a rainy scenario replays identically', () => {
    const wet = testScenario({
      environment: {
        ...scenario.environment,
        weather: { ...scenario.environment.weather, rainMmph: 12 },
      },
    });
    const run = () => {
      const sim = createSim(wet, presetWorld('PROCEDURAL_HILLS'));
      while (sim.getState().endReason === null) sim.tick();
      return JSON.stringify(sim.getEvents());
    };
    expect(run()).toBe(run());
  });
});

/** A radar measurement converted to x/z the way the sim does (true height difference). */
function measure(radarPos: Vec3, truth: Vec3, noise: () => number): { x: number; z: number } {
  const range = slantRange(radarPos, truth) + noise() * RANGE_SIGMA_M;
  const bearing = bearingDeg(radarPos, truth) + noise() * BEARING_SIGMA_DEG;
  const dh = truth.y - radarPos.y;
  const horiz = Math.sqrt(Math.max(range * range - dh * dh, 0));
  const [e, n] = headingVector(bearing);
  return { x: radarPos.x + e * horiz, z: radarPos.z + n * horiz };
}

describe('alpha-beta track filter (decision 51)', () => {
  const radarPos = { x: 0, y: 6, z: 0 };
  const vx = 5;
  const vz = -15;
  const truthAt = (tMs: number): Vec3 => ({
    x: (vx * tMs) / 1000,
    y: 60,
    z: 3000 + (vz * tMs) / 1000,
  });

  /** 80 scans 2 s apart on a constant-velocity target; per-scan raw and filtered errors. */
  function runCv(seed: number) {
    const s = createRng(seed).stream('test');
    const noise = () => gaussian(s);
    let f: TrackFilter | null = null;
    const rows: { raw: number; filt: number; velErr: number }[] = [];
    for (let k = 0; k < 80; k++) {
      const tMs = k * 2000;
      const truth = truthAt(tMs);
      const m = measure(radarPos, truth, noise);
      if (f === null) f = createTrackFilter(m.x, m.z, tMs);
      else updateTrackFilter(f, m.x, m.z, tMs);
      rows.push({
        raw: Math.hypot(m.x - truth.x, m.z - truth.z),
        filt: Math.hypot(f.x - truth.x, f.z - truth.z),
        velErr: f.hasVelocity ? Math.hypot(f.vx - vx, f.vz - vz) : Infinity,
      });
    }
    return rows;
  }
  const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);

  it('has a lower position error than the raw measurements', () => {
    for (const seed of [1, 2, 3]) {
      const rows = runCv(seed).slice(5);
      expect(rms(rows.map((r) => r.filt))).toBeLessThan(0.85 * rms(rows.map((r) => r.raw)));
    }
  });

  it('converges on a constant-velocity target', () => {
    for (const seed of [1, 2, 3]) {
      const rows = runCv(seed);
      const early = rms(rows.slice(1, 6).map((r) => r.velErr));
      const late = rms(rows.slice(40).map((r) => r.velErr));
      expect(late).toBeLessThan(early);
      expect(late).toBeLessThan(4); // m/s, vs a 15.8 m/s target
    }
  });

  it('predicts pos + vel·Δt between updates', () => {
    const f = createTrackFilter(0, 1000, 0);
    updateTrackFilter(f, 20, 980, 2000);
    expect([f.vx, f.vz]).toEqual([10, -10]);
    expect(predictFilter(f, 3000)).toEqual({ x: 30, z: 970 });
  });

  it('the sim extrapolates live tracks every tick between scans', () => {
    const sim = createSim(testScenario(), presetWorld('PROCEDURAL_HILLS'));
    let checked = 0;
    while (sim.getState().endReason === null && checked < 20) {
      sim.tick();
      const { tracks, clock } = sim.getState();
      const t = tracks.find((x) => x.status === 'ACTIVE' && x.filter.hasVelocity);
      if (t === undefined || t.lastUpdateTMs === clock.tMs) continue;
      const p = predictFilter(t.filter, clock.tMs);
      expect(t.pos.x).toBeCloseTo(p.x, 9);
      expect(t.pos.z).toBeCloseTo(p.z, 9);
      expect(t.pos.x).not.toBe(t.filter.x);
      expect(t.speedMps).toBeCloseTo(Math.hypot(t.filter.vx, t.filter.vz), 9);
      checked++;
    }
    expect(checked).toBe(20);
  });
});

describe('EO lock on the filtered estimate (decision 51)', () => {
  const s11 = load('S11');
  const eo = s11.sensors.find((x): x is EoIrSensor => x.kind === 'EO_IR')!;
  const radar = s11.sensors.find((x): x is RadarSensor => x.kind === 'RADAR')!;
  const HALF_FOV_DEG = eo.fovDegMin / 2;

  it('keeps S11 in a 1.5° frame more often than aiming at the raw measurement', () => {
    // Same truth path, same noise model; aim either at the last raw measurement
    // (held between scans) or at the filtered, predicted estimate.
    const sim = createSim(s11, presetWorld('JK_MOUNTAIN'));
    const { sensorPositions } = sim.getState();
    const radarPos = sensorPositions[radar.id]!;
    const eoPos = sensorPositions[eo.id]!;
    const s = createRng(11).stream('test');
    const noise = () => gaussian(s);
    const scanMs = radar.scanPeriodS * 1000;
    let f: TrackFilter | null = null;
    let raw: { x: number; z: number } | null = null;
    let updates = 0;
    let inRaw = 0;
    let inFilt = 0;
    let n = 0;
    while (sim.getState().endReason === null) {
      sim.tick();
      const { clock, contacts } = sim.getState();
      const c = contacts.find((x) => x.id === 'c01')!;
      if (c.status !== 'ACTIVE') continue;
      if (clock.tMs % scanMs === 0) {
        raw = measure(radarPos, c.pos, noise);
        if (f === null) f = createTrackFilter(raw.x, raw.z, clock.tMs);
        else updateTrackFilter(f, raw.x, raw.z, clock.tMs);
        updates++;
      }
      if (f === null || raw === null || updates < 3) continue;
      const truthBrg = bearingDeg(eoPos, c.pos);
      const p = predictFilter(f, clock.tMs);
      const off = (q: { x: number; z: number }) =>
        Math.abs(angleDiffDeg(bearingDeg(eoPos, { x: q.x, y: 0, z: q.z }), truthBrg));
      n++;
      if (off(raw) <= HALF_FOV_DEG) inRaw++;
      if (off(p) <= HALF_FOV_DEG) inFilt++;
    }
    expect(n).toBeGreaterThan(1000);
    expect(inFilt / n).toBeGreaterThan(inRaw / n + 0.05);
  });

  it('a locked, fully zoomed camera has S11 in frame on at least half the ticks', () => {
    // Measured 2026-10-14: 56 % with the filter vs 43 % on the Part A raw estimate.
    const sim = createSim(s11, presetWorld('JK_MOUNTAIN'));
    let lockT = -1;
    let inFrame = 0;
    let n = 0;
    while (sim.getState().endReason === null) {
      const st = sim.getState();
      const t = st.tracks.find((x) => x.status === 'ACTIVE');
      if (t && st.camera.lockTrackId === null) {
        sim.dispatch({
          type: 'CAMERA_SLEWED',
          trackId: t.id,
          payload: { azDeg: t.bearingDeg, elDeg: 0, zoom: 20 },
        });
        lockT = st.clock.tMs;
      }
      sim.tick();
      const s2 = sim.getState();
      if (s2.camera.lockTrackId === null || s2.clock.tMs <= lockT + 3000) continue;
      const tr = s2.tracks.find((x) => x.id === s2.camera.lockTrackId)!;
      const c = s2.contacts.find((x) => x.id === tr.contactId)!;
      if (c.status !== 'ACTIVE') continue;
      n++;
      if (inEoFrustum(eo, s2.camera, s2.sensorPositions[eo.id]!, c.pos)) inFrame++;
    }
    expect(n).toBeGreaterThan(1000);
    expect(inFrame / n).toBeGreaterThanOrEqual(0.5);
  });
});
