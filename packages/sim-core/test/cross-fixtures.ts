import { sampleHeight } from '../src/index.ts';
import { presetWorld } from './fixtures.ts';

// Values the API's Python copies of simple maths must match (decision 73):
// terrain heights now, sun times for the generator's time bands later. Written
// by scripts/export-api-fixtures.ts; a sim-core test fails if they are stale.

export const CROSSCHECK_DIR = new URL(
  '../../../apps/api/tests/fixtures/crosscheck/',
  import.meta.url,
);

export const FILE_PRESETS = ['PUNJAB_PLAINS', 'JK_MOUNTAIN'] as const;

/** [x, z, height] at a 9 × 9 grid, a few off-grid points and clamped out-of-map points. */
function terrainHeights(preset: string): [number, number, number][] {
  const world = presetWorld(preset);
  const half = world.heightmap.sizeM / 2;
  const points: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++)
      points.push([-half + (i * 2 * half) / 8, -half + (j * 2 * half) / 8]);
  }
  points.push([123.4, -567.8], [-2222.2, 3333.3], [0.5, 0.5], [half + 500, 0], [0, -half - 500]);
  return points.map(([x, z]) => [x, z, sampleHeight(world.heightmap, x, z)]);
}

export function recordCrossChecks(): Record<string, unknown> {
  return {
    terrain_heights: Object.fromEntries(FILE_PRESETS.map((p) => [p, terrainHeights(p)])),
  };
}
