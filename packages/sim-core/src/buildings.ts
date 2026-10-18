import { sampleHeight, type Heightmap } from './terrain.ts';

// Building footprints (SPEC §5): 2D polygons in the scenario frame with a
// height, indexed in a uniform grid so LOS can test a sample point against only
// the buildings in its cell. Each cell also keeps its highest roof, so a sample
// above it skips the footprint tests (Phase 3b: dense towns). The early-out
// cannot change a result: a covering building's roof is never above its cells'
// maximum. Footprints with many vertices also keep their edges in horizontal
// bands, so a point test reads only the edges that reach its band: an edge
// outside it cannot change the even-odd count, and the kept edges are tested
// with the same arithmetic, so the answer is identical to pointInRing.

/** Grid cell size for the footprint index, metres. */
export const BUILDING_CELL_M = 25;

/** A footprint as read from buildings.geojson: exterior ring [x, z] + height. */
export interface BuildingFootprint {
  readonly ring: readonly (readonly [number, number])[];
  readonly heightM: number;
}

/** Rings with more vertices than this get edge bands. */
export const BAND_MIN_VERTICES = 16;
/** Target edges per band. */
const BAND_EDGES = 8;
const MAX_BANDS = 64;

/** Ring edges [xi, zi, xj, zj] (cur, prev as in pointInRing) grouped by z band. */
export interface EdgeBands {
  readonly minZ: number;
  readonly bandM: number;
  readonly count: number;
  readonly edges: readonly Float64Array[];
}

export interface Building extends BuildingFootprint {
  /** Lowest terrain height under the footprint's corners (scenario frame). */
  readonly baseY: number;
  readonly topY: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Present for rings with more than BAND_MIN_VERTICES vertices. */
  readonly bands: EdgeBands | null;
}

export interface BuildingIndex {
  readonly buildings: readonly Building[];
  readonly cellM: number;
  /** Cells per side; the grid covers the heightmap square. */
  readonly cols: number;
  readonly half: number;
  /** cell key → building indices (ascending). */
  readonly cells: ReadonlyMap<number, readonly number[]>;
  /** cell key → highest roof (scenario-frame y) of the buildings in it; −Infinity if none. */
  readonly cellTop: Float64Array;
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

function bandOf(b: Pick<EdgeBands, 'minZ' | 'bandM' | 'count'>, z: number): number {
  return Math.min(Math.max(Math.floor((z - b.minZ) / b.bandM), 0), b.count - 1);
}

export function createEdgeBands(
  ring: readonly (readonly [number, number])[],
  minZ: number,
  maxZ: number,
): EdgeBands {
  const count = Math.max(1, Math.min(MAX_BANDS, Math.ceil(ring.length / BAND_EDGES)));
  const bands = { minZ, bandM: Math.max(maxZ - minZ, 1e-9) / count, count };
  const lists: number[][] = Array.from({ length: count }, () => []);
  let prev = ring[ring.length - 1];
  for (const cur of ring) {
    if (prev === undefined) break;
    const [xi, zi] = cur;
    const [xj, zj] = prev;
    // An edge counts for z only when min(zi, zj) <= z < max(zi, zj), and bandOf is
    // monotonic, so the edge is needed in bands bandOf(min) to bandOf(max) alone.
    const hi = bandOf(bands, Math.max(zi, zj));
    for (let k = bandOf(bands, Math.min(zi, zj)); k <= hi; k++) lists[k]?.push(xi, zi, xj, zj);
    prev = cur;
  }
  return { ...bands, edges: lists.map((l) => Float64Array.from(l)) };
}

/** pointInRing over the banded edges; same result, fewer edges. */
export function pointInBands(b: EdgeBands, x: number, z: number): boolean {
  const e = b.edges[bandOf(b, z)];
  if (e === undefined) return false;
  let inside = false;
  for (let k = 0; k < e.length; k += 4) {
    const xi = e[k] ?? 0;
    const zi = e[k + 1] ?? 0;
    const xj = e[k + 2] ?? 0;
    const zj = e[k + 3] ?? 0;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
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
  const cellTop = new Float64Array(cols * cols).fill(-Infinity);
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
    const topY = baseY + fp.heightM;
    const bands = fp.ring.length > BAND_MIN_VERTICES ? createEdgeBands(fp.ring, minZ, maxZ) : null;
    buildings.push({
      ring: fp.ring,
      heightM: fp.heightM,
      baseY,
      topY,
      minX,
      maxX,
      minZ,
      maxZ,
      bands,
    });
    for (let cz = cellOf(geo, minZ); cz <= cellOf(geo, maxZ); cz++) {
      for (let cx = cellOf(geo, minX); cx <= cellOf(geo, maxX); cx++) {
        const key = cz * cols + cx;
        const list = cells.get(key);
        if (list) list.push(i);
        else cells.set(key, [i]);
        if (topY > (cellTop[key] ?? -Infinity)) cellTop[key] = topY;
      }
    }
  }
  return { buildings, cellM, cols, half, cells, cellTop };
}

/** Highest roof of any building in the cell containing (x, z); −Infinity if none or off the map. */
export function cellTopAt(index: BuildingIndex, x: number, z: number): number {
  if (Math.abs(x) > index.half || Math.abs(z) > index.half) return -Infinity;
  return index.cellTop[cellOf(index, z) * index.cols + cellOf(index, x)] ?? -Infinity;
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
    const inside = b.bands ? pointInBands(b.bands, x, z) : pointInRing(b.ring, x, z);
    if (inside && (top === null || b.topY > top)) top = b.topY;
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
