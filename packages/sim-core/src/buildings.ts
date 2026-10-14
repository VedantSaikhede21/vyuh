import { sampleHeight, type Heightmap } from './terrain.ts';

// Building footprints (SPEC §5): 2D polygons in the scenario frame with a
// height, indexed in a uniform grid so LOS can test a sample point against only
// the buildings in its cell.

/** Grid cell size for the footprint index, metres. */
export const BUILDING_CELL_M = 100;

/** A footprint as read from buildings.geojson: exterior ring [x, z] + height. */
export interface BuildingFootprint {
  readonly ring: readonly (readonly [number, number])[];
  readonly heightM: number;
}

export interface Building extends BuildingFootprint {
  /** Lowest terrain height under the footprint's corners (scenario frame). */
  readonly baseY: number;
  readonly topY: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface BuildingIndex {
  readonly buildings: readonly Building[];
  readonly cellM: number;
  /** Cells per side; the grid covers the heightmap square. */
  readonly cols: number;
  readonly half: number;
  /** cell key → building indices (ascending). */
  readonly cells: ReadonlyMap<number, readonly number[]>;
}

/** Even-odd ray-crossing test; the ring may be open or closed. */
export function pointInRing(ring: readonly (readonly [number, number])[], x: number, z: number) {
  let inside = false;
  let prev = ring[ring.length - 1];
  for (const cur of ring) {
    if (prev === undefined) break;
    const [xi, zi] = cur;
    const [xj, zj] = prev;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    prev = cur;
  }
  return inside;
}

function cellOf(index: Pick<BuildingIndex, 'cellM' | 'cols' | 'half'>, v: number): number {
  return Math.min(Math.max(Math.floor((v + index.half) / index.cellM), 0), index.cols - 1);
}

export function createBuildingIndex(
  footprints: readonly BuildingFootprint[],
  terrain: Heightmap,
  cellM = BUILDING_CELL_M,
): BuildingIndex {
  const half = terrain.sizeM / 2;
  const cols = Math.max(1, Math.ceil(terrain.sizeM / cellM));
  const geo = { cellM, cols, half };
  const buildings: Building[] = [];
  const cells = new Map<number, number[]>();
  for (const fp of footprints) {
    if (fp.ring.length < 3 || !(fp.heightM > 0)) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let baseY = Infinity;
    for (const [x, z] of fp.ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      baseY = Math.min(baseY, sampleHeight(terrain, x, z));
    }
    const i = buildings.length;
    buildings.push({ ...fp, baseY, topY: baseY + fp.heightM, minX, maxX, minZ, maxZ });
    for (let cz = cellOf(geo, minZ); cz <= cellOf(geo, maxZ); cz++) {
      for (let cx = cellOf(geo, minX); cx <= cellOf(geo, maxX); cx++) {
        const key = cz * cols + cx;
        const list = cells.get(key);
        if (list) list.push(i);
        else cells.set(key, [i]);
      }
    }
  }
  return { buildings, cellM, cols, half, cells };
}

/** Highest roof (scenario-frame y) of the buildings covering (x, z), or null. */
export function buildingTopAt(index: BuildingIndex, x: number, z: number): number | null {
  if (index.buildings.length === 0) return null;
  if (Math.abs(x) > index.half || Math.abs(z) > index.half) return null;
  const list = index.cells.get(cellOf(index, z) * index.cols + cellOf(index, x));
  if (list === undefined) return null;
  let top: number | null = null;
  for (const i of list) {
    const b = index.buildings[i];
    if (b === undefined || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (pointInRing(b.ring, x, z) && (top === null || b.topY > top)) top = b.topY;
  }
  return top;
}

/** Parse buildings.geojson (Polygons in local metres, property heightM). */
export function parseBuildingsGeoJson(json: unknown): BuildingFootprint[] {
  const fc = json as { type?: unknown; features?: unknown };
  if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new TypeError('buildings.geojson must be a FeatureCollection');
  }
  const out: BuildingFootprint[] = [];
  for (const f of fc.features as {
    geometry?: { type?: unknown; coordinates?: unknown };
    properties?: { heightM?: unknown };
  }[]) {
    const ring = (f.geometry?.coordinates as unknown[] | undefined)?.[0];
    const heightM = f.properties?.heightM;
    if (f.geometry?.type !== 'Polygon' || !Array.isArray(ring) || typeof heightM !== 'number') {
      throw new TypeError('Each building must be a Polygon with a numeric heightM');
    }
    out.push({
      ring: ring.map((p) => {
        const [x, z] = p as [unknown, unknown];
        if (typeof x !== 'number' || typeof z !== 'number') {
          throw new TypeError('Building coordinates must be [x, z] numbers');
        }
        return [x, z] as const;
      }),
      heightM,
    });
  }
  return out;
}
