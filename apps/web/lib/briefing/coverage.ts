import type { Scenario } from '@vyuh/shared';
import { hasLineOfSight, sampleHeight, type World } from '@vyuh/sim-core';

// Briefing LOS coverage (DESIGN §11.4, plan Step 12): for each sensor site, which
// cells of a GRID × GRID grid over the map a contact flying `aglM` above the
// ground could be seen from, using sim-core's own LOS (terrain + buildings).
// Display only; the sim decides detection at runtime.

export const GRID = 64;
/** Briefing altitude choices (m AGL) and the default. */
export const COVERAGE_ALTITUDES = [15, 50, 150] as const;
export type CoverageAltitude = (typeof COVERAGE_ALTITUDES)[number];
export const DEFAULT_ALTITUDE: CoverageAltitude = 50;

/** Cell values. */
export const IN_VIEW = 1;
export const MASKED = 0;
export const OUT_OF_RANGE = 255;

export interface SensorSite {
  readonly x: number;
  readonly z: number;
  /** Mast height above the ground, m. */
  readonly mastM: number;
  /** Coverage is computed out to this horizontal range, m. */
  readonly rangeM: number;
  readonly kinds: readonly string[];
}

/** Distinct radar / EO-IR positions, each with its tallest mast and longest radar range. */
export function sensorSites(scenario: Pick<Scenario, 'sensors'>): SensorSite[] {
  const sites = new Map<string, SensorSite>();
  for (const s of scenario.sensors) {
    if (s.kind !== 'RADAR' && s.kind !== 'EO_IR') continue;
    const key = `${s.x},${s.z}`;
    const prev = sites.get(key);
    // Radar reference range = small quad at Pd 0.5; ×1.5 shows the edge where Pd fades.
    const range = s.kind === 'RADAR' ? s.refRangeM * 1.5 : 0;
    sites.set(key, {
      x: s.x,
      z: s.z,
      mastM: Math.max(prev?.mastM ?? 0, s.y),
      rangeM: Math.max(prev?.rangeM ?? 0, range),
      kinds: [...(prev?.kinds ?? []), s.kind],
    });
  }
  return [...sites.values()];
}

/** Row-major GRID² cells, row 0 = north (image order), for one site and altitude. */
export function coverageGrid(
  world: World,
  site: SensorSite,
  aglM: number,
  grid = GRID,
  onRow?: (row: number) => void,
): Uint8Array {
  const out = new Uint8Array(grid * grid);
  const size = world.heightmap.sizeM;
  const cell = size / grid;
  const from = {
    x: site.x,
    y: sampleHeight(world.heightmap, site.x, site.z) + site.mastM,
    z: site.z,
  };
  for (let row = 0; row < grid; row++) {
    const z = size / 2 - (row + 0.5) * cell;
    for (let col = 0; col < grid; col++) {
      const x = -size / 2 + (col + 0.5) * cell;
      if (Math.hypot(x - site.x, z - site.z) > site.rangeM) {
        out[row * grid + col] = OUT_OF_RANGE;
        continue;
      }
      const to = { x, y: sampleHeight(world.heightmap, x, z) + aglM, z };
      out[row * grid + col] = hasLineOfSight(world, from, to) ? IN_VIEW : MASKED;
    }
    onRow?.(row);
  }
  return out;
}
