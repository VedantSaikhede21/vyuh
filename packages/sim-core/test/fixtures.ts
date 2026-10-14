import { readFileSync } from 'node:fs';
import { TerrainPresetMeta, type ContactSpec, type Scenario, type SessionMode } from '@vyuh/shared';
import {
  createHeightmap,
  createProceduralTerrain,
  builtinWorld,
  createSim,
  worldFromPreset,
  type Heightmap,
  type Sim,
  type World,
} from '../src/index.ts';

export const flatTerrain: Heightmap = createHeightmap(20_000, 2, new Float32Array(4));
/** A preset's World: built-in, or decoded from apps/web/public/terrain/<NAME>/. */
export function presetWorld(name: string): World {
  const builtin = builtinWorld(name);
  if (builtin) return builtin;
  const dir = new URL(`../../../apps/web/public/terrain/${name}/`, import.meta.url);
  const meta = TerrainPresetMeta.parse(JSON.parse(readFileSync(new URL('meta.json', dir), 'utf8')));
  return worldFromPreset(
    meta,
    readFileSync(new URL(meta.files.heightmap, dir)),
    JSON.parse(readFileSync(new URL(meta.files.buildings, dir), 'utf8')),
  );
}

export const hills: Heightmap = createProceduralTerrain({ seed: 1, resolution: 129 });

export function attackQuad(id: string, from: [number, number], spawnTMs = 0): ContactSpec {
  return {
    id,
    class: 'QUAD_SMALL',
    isThreat: true,
    affiliation: 'HOSTILE',
    controlLink: 'RF_MANUAL',
    behaviour: 'ATTACK_RUN',
    spawnTMs,
    path: [
      { x: from[0], y: 40, z: from[1], speedMps: 16 },
      { x: 0, y: 0, z: 0, speedMps: 16, action: 'DIVE' },
    ],
    emissions: { rfActive: true, rfBand: '2.4GHz' },
  };
}

/** S01-like: one quad from the north, radar + interceptor at the asset. */
export function testScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'T01',
    schemaVersion: 1,
    name: 'Test',
    briefing: '',
    seed: 40417,
    difficulty: 1,
    terrain: { preset: 'PROCEDURAL_HILLS', origin: { lat: 30.9, lon: 74.5 } },
    environment: {
      date: '2026-11-20',
      time: '10:00',
      isNight: false,
      weather: { visibilityM: 10000, rainMmph: 0, windMps: 2, windDirDeg: 0, cloudPct: 10 },
    },
    roe: 'WEAPONS_FREE',
    zones: [],
    assets: [{ id: 'a1', name: 'Post Alpha', x: 0, z: 0, radiusM: 60 }],
    sensors: [{ id: 'rad1', kind: 'RADAR', x: 0, y: 6, z: 0, refRangeM: 3000, scanPeriodS: 2 }],
    effectors: [{ id: 'int1', kind: 'INTERCEPT', x: 0, z: 0, rangeM: 1200, cooldownS: 6, ammo: 4 }],
    contacts: [attackQuad('c01', [300, 2500], 5000)],
    durationS: 180,
    scoringTreeId: 'default_v1',
    ...overrides,
  };
}

/**
 * A scripted trainee: selects, marks, classifies and calls hostile on each new
 * track, then orders an intercept every time the interceptor is ready and the
 * track is within 1100 m. Decisions read only sim state, so they are deterministic.
 */
export function playScripted(
  scenario: Scenario,
  terrain: Heightmap | World,
  mode: SessionMode = 'ASSESSMENT',
): Sim {
  const sim = createSim(scenario, terrain, { mode });
  const handled = new Set<string>();
  while (sim.getState().endReason === null) {
    const s = sim.getState();
    for (const t of s.tracks) {
      if (t.status !== 'ACTIVE') continue;
      if (!handled.has(t.id)) {
        handled.add(t.id);
        sim.dispatch({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
        sim.dispatch({ type: 'MARKED_DETECTED', trackId: t.id, payload: {} });
        sim.dispatch({ type: 'CLASSIFIED', trackId: t.id, payload: { class: 'QUAD_SMALL' } });
        sim.dispatch({
          type: 'AFFILIATION_SET',
          trackId: t.id,
          payload: { affiliation: 'HOSTILE' },
        });
      }
      const eff = s.effectors[0];
      if (eff && s.clock.tMs >= eff.readyAtMs && t.rangeM < 1100 && (eff.ammo ?? 1) > 0) {
        sim.dispatch({
          type: 'RESPONSE_ORDERED',
          trackId: t.id,
          payload: { response: 'INTERCEPT' },
        });
      }
    }
    sim.tick();
  }
  return sim;
}
