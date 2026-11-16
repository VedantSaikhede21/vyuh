import { readFileSync } from 'node:fs';
import { CLASS_PROFILES, Scenario, TerrainPresetMeta, type SimEvent } from '@vyuh/shared';
import {
  builtinWorld,
  createSim,
  pointingTo,
  sampleHeight,
  worldFromPreset,
  type SimSnapshot,
  type World,
} from '@vyuh/sim-core';
import { describe, expect, it } from 'vitest';
import { pickStep, searchFovDeg } from '@/lib/hud/cue-zoom';
import { eoFovSteps } from '@/lib/sim/commands';

// Cue lock times (eo-haze plan §5.1). For every radar track a scenario makes with
// no trainee input, restore the sim at the tick the track appears, cue the camera
// on it the way the player does (Space: lock + the cue's field of view), and time
// how long the EO tracker takes to reach TRACK. One track at a time, so tracks do
// not compete for the camera.
//
//   CUE_LOCK_REPORT=1 pnpm --filter @vyuh/web exec vitest run test/cue-lock.test.ts

const REPO = new URL('../../../', import.meta.url);
/** Give up on a cue after this long without a lock (sim ms). */
const LOCK_TIMEOUT_MS = 60_000;

export type CueRule = (steps: readonly number[], rangeM: number) => number;

/** The cue rule of decision 176: narrowest step that covers the p95 pointing error. */
export const pointingFloorRule: CueRule = (steps, rangeM) => pickStep(steps, searchFovDeg(rangeM));

function loadScenario(id: string): Scenario {
  const url = new URL(`apps/api/app/seed/scenarios/${id}.json`, REPO);
  return Scenario.parse(JSON.parse(readFileSync(url, 'utf8')));
}

const worlds = new Map<string, World>();
function presetWorld(name: string): World {
  const builtin = builtinWorld(name);
  if (builtin) return builtin;
  const cached = worlds.get(name);
  if (cached) return cached;
  const dir = new URL(`apps/web/public/terrain/${name}/`, REPO);
  const meta = TerrainPresetMeta.parse(JSON.parse(readFileSync(new URL('meta.json', dir), 'utf8')));
  const world = worldFromPreset(
    meta,
    readFileSync(new URL(meta.files.heightmap, dir)),
    JSON.parse(readFileSync(new URL(meta.files.buildings, dir), 'utf8')),
  );
  worlds.set(name, world);
  return world;
}

export interface LockResult {
  trackId: string;
  category: string;
  cls: string;
  /** Field of view the cue opened at (deg). */
  hfovDeg: number;
  cueRangeM: number;
  /** Time from cue to TRACK (s); null = no lock before the track ended or the timeout. */
  lockS: number | null;
  lockRangeM: number | null;
  outcome: 'LOCK' | 'TIMEOUT' | 'TRACK_LOST' | 'END';
}

export function measureLocks(id: string, rule: CueRule): LockResult[] {
  const scenario = loadScenario(id);
  const world = presetWorld(scenario.terrain.preset);
  const eo = scenario.sensors.find((s) => s.kind === 'EO_IR');
  if (!eo) return [];
  const steps = eoFovSteps(eo.fovDegMax, eo.fovDegMin);
  const classOf = new Map(scenario.contacts.map((c) => [c.id, c.class]));

  // Baseline run: a snapshot at the tick each track first appears.
  const base = createSim(scenario, world, { mode: 'PRACTICE' });
  const starts: { trackId: string; snap: SimSnapshot; events: SimEvent[] }[] = [];
  const seen = new Set<string>();
  while (base.getState().endReason === null) {
    base.tick();
    for (const t of base.getState().tracks) {
      if (seen.has(t.id) || t.status !== 'ACTIVE') continue;
      seen.add(t.id);
      starts.push({ trackId: t.id, snap: base.snapshot(), events: [...base.getEvents()] });
    }
  }

  const out: LockResult[] = [];
  for (const start of starts) {
    const sim = createSim(scenario, world, { mode: 'PRACTICE' });
    sim.restore(start.snap, start.events);
    const st = sim.getState();
    const track = st.tracks.find((t) => t.id === start.trackId)!;
    const mast = st.sensorPositions[eo.id]!;
    const aim = pointingTo(mast, {
      x: track.pos.x,
      y: sampleHeight(world.heightmap, track.pos.x, track.pos.z) + track.altitudeAglM,
      z: track.pos.z,
    });
    const cueRangeM = track.rangeM;
    const hfov = rule(steps, cueRangeM);
    sim.dispatch({
      type: 'CAMERA_SLEWED',
      trackId: track.id,
      payload: { azDeg: aim.azDeg, elDeg: aim.elDeg, zoom: eo.fovDegMax / hfov, mode: 'DAY' },
    });
    const t0 = st.clock.tMs;
    let lockS: number | null = null;
    let lockRangeM: number | null = null;
    let outcome: LockResult['outcome'] = 'TIMEOUT';
    while (sim.getState().clock.tMs - t0 < LOCK_TIMEOUT_MS) {
      if (sim.getState().endReason !== null) {
        outcome = 'END';
        break;
      }
      sim.tick();
      const s = sim.getState();
      const live = s.tracks.find((t) => t.id === start.trackId);
      if (s.camera.trackMode === 'TRACK') {
        lockS = (s.clock.tMs - t0) / 1000;
        lockRangeM = live?.rangeM ?? null;
        outcome = 'LOCK';
        break;
      }
      if (!live || live.status !== 'ACTIVE' || s.camera.lockTrackId !== start.trackId) {
        outcome = 'TRACK_LOST';
        break;
      }
    }
    const cls = classOf.get(track.contactId);
    out.push({
      trackId: track.id,
      category: cls ? CLASS_PROFILES[cls].category : 'UNKNOWN',
      cls: cls ?? 'UNKNOWN',
      hfovDeg: hfov,
      cueRangeM,
      lockS,
      lockRangeM,
      outcome,
    });
  }
  return out;
}

const median = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function summarise(rs: readonly LockResult[]): string {
  const rows: string[] = [];
  for (const cat of ['ALL', 'DRONE', 'BIRD', 'MANNED_AIRCRAFT']) {
    const r = cat === 'ALL' ? rs : rs.filter((x) => x.category === cat);
    if (r.length === 0) continue;
    const locked = r.filter((x) => x.lockS !== null);
    rows.push(
      `${cat.padEnd(15)} tracks ${String(r.length).padStart(3)}  locked ${String(locked.length).padStart(3)}` +
        `  median lock ${median(locked.map((x) => x.lockS!))
          .toFixed(1)
          .padStart(5)} s` +
        `  median cue range ${Math.round(median(r.map((x) => x.cueRangeM)))
          .toString()
          .padStart(5)} m` +
        `  median lock range ${Math.round(median(locked.map((x) => x.lockRangeM ?? NaN)))
          .toString()
          .padStart(5)} m`,
    );
  }
  for (const x of rs.filter((r) => r.category === 'DRONE')) {
    rows.push(
      `  ${x.trackId} ${x.cls.padEnd(16)} cue ${Math.round(x.cueRangeM).toString().padStart(5)} m at ` +
        `${x.hfovDeg.toFixed(1).padStart(4)}°  → ${x.outcome}` +
        (x.lockS !== null
          ? ` after ${x.lockS.toFixed(1)} s at ${Math.round(x.lockRangeM ?? NaN)} m`
          : ''),
    );
  }
  return rows.join('\n');
}

describe.runIf(process.env.CUE_LOCK_REPORT === '1')('cue lock report', () => {
  for (const id of ['S15', 'S06', 'S05']) {
    it(`${id}`, () => {
      const rs = measureLocks(id, pointingFloorRule);
      console.log(`\n${id} — pointing-floor rule\n${summarise(rs)}`);
      expect(rs.length).toBeGreaterThan(0);
    }, 600_000);
  }
});
