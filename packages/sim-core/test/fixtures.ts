import type { ContactSpec, Scenario } from '@vyuh/shared';
import { createHeightmap, createProceduralTerrain, type Heightmap } from '../src/index.ts';

export const flatTerrain: Heightmap = createHeightmap(20_000, 2, new Float32Array(4));
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
