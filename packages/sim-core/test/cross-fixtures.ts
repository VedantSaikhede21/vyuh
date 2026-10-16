import { localInstantMs, sampleHeight, sunPosition, timeOfDayAt } from '../src/index.ts';
import { presetWorld } from './fixtures.ts';

// Values the API's Python copies of simple maths must match (decision 73):
// terrain heights, sun elevations and the shared time-of-day band. Written
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

const SUN_DATES = ['2026-01-15', '2026-04-01', '2026-07-20', '2026-11-20'];
const SUN_TIMES = [
  '05:30',
  '07:00',
  '09:10',
  '12:00',
  '15:40',
  '17:20',
  '18:00',
  '18:40',
  '19:30',
  '22:50',
];

/** [date, time, sun elevation °, time band] at each file preset's origin and UTC offset. */
function sunElevations(preset: string): [string, string, number, string][] {
  const meta = presetWorld(preset).meta;
  if (meta === null) throw new Error(`${preset} has no meta`);
  return SUN_DATES.flatMap((date) =>
    SUN_TIMES.map((time): [string, string, number, string] => [
      date,
      time,
      sunPosition(meta.origin.lat, meta.origin.lon, localInstantMs(date, time, meta.utcOffsetMin))
        .elDeg,
      timeOfDayAt(date, time, meta).band,
    ]),
  );
}

export function recordCrossChecks(): Record<string, unknown> {
  return {
    terrain_heights: Object.fromEntries(FILE_PRESETS.map((p) => [p, terrainHeights(p)])),
    sun_elevations: Object.fromEntries(FILE_PRESETS.map((p) => [p, sunElevations(p)])),
  };
}
