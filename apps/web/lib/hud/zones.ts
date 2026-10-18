import type { AreaZone, Point2, Zone } from '@vyuh/shared';
import { pointInPolygon } from '@vyuh/sim-core';

// Zone geometry helpers for drawing (3D and PPI). Display only — the sim's
// NO_KINETIC gate lives in sim-core (decision 69).

/** NO_KINETIC zones with the same name and at most this far apart share one label. */
export const ZONE_GROUP_GAP_M = 500;
/** A grouped zone's id shows while the selected track is this close to it… */
export const ZONE_NEAR_M = 300;
/** …or is predicted (straight line, current speed) to enter it within this time. */
export const ZONE_LOOKAHEAD_S = 30;

/** One label on the tactical view and the PPI: a single zone or a cluster. */
export interface ZoneLabelGroup {
  /** The zone id for a single zone; "group:<first id>" for a cluster. */
  key: string;
  label: string;
  /** PPI text: the id for a single zone, the cluster label otherwise. */
  shortLabel: string;
  zones: AreaZone[];
}

function bbox(polygon: readonly Point2[]) {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** Bounding box of several polygons. */
export function zonesBox(zones: readonly AreaZone[]) {
  return bbox(zones.flatMap((z) => z.polygon));
}

/**
 * NO_KINETIC zones grouped for labelling (Checkpoint B, decision 98): zones with
 * the same name whose bounding boxes are within ZONE_GROUP_GAP_M of each other
 * (single link) share one label, "NO KINETIC · TOWN"; a lone zone keeps its own.
 */
export function groupNoKineticZones(zones: readonly Zone[]): ZoneLabelGroup[] {
  const area = zones.filter((z): z is AreaZone => z.kind === 'NO_KINETIC');
  const boxes = area.map((z) => bbox(z.polygon));
  const near = (i: number, j: number) => {
    const a = boxes[i]!;
    const b = boxes[j]!;
    const gx = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
    const gz = Math.max(0, Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ));
    return Math.hypot(gx, gz) <= ZONE_GROUP_GAP_M;
  };
  const seen = new Set<number>();
  const groups: ZoneLabelGroup[] = [];
  for (let i = 0; i < area.length; i++) {
    if (seen.has(i)) continue;
    seen.add(i);
    const members = [i];
    for (let k = 0; k < members.length; k++) {
      for (let j = 0; j < area.length; j++) {
        if (seen.has(j) || area[j]!.name !== area[i]!.name || !near(members[k]!, j)) continue;
        seen.add(j);
        members.push(j);
      }
    }
    const list = members.sort((a, b) => a - b).map((m) => area[m]!);
    const first = list[0]!;
    const cluster = ['NO KINETIC', first.name?.toUpperCase()].filter(Boolean).join(' · ');
    groups.push(
      list.length === 1
        ? { key: first.id, label: zoneLabel(first), shortLabel: first.id, zones: list }
        : { key: `group:${first.id}`, label: cluster, shortLabel: cluster, zones: list },
    );
  }
  return groups;
}

function distanceToPolygon(polygon: readonly Point2[], x: number, z: number): number {
  if (pointInPolygon(x, z, polygon)) return 0;
  const p = nearestPoint([...polygon, polygon[0]!], [x, z]);
  return Math.hypot(p[0] - x, p[1] - z);
}

/**
 * Ids of the zones the selected track is inside, within ZONE_NEAR_M of, or
 * heading into within ZONE_LOOKAHEAD_S (straight line at its current speed).
 */
export function zonesNearTrack(
  zones: readonly AreaZone[],
  track: { x: number; z: number; headingDeg: number | null; speedMps: number | null },
): Set<string> {
  const out = new Set<string>();
  const a = ((track.headingDeg ?? 0) * Math.PI) / 180;
  const v = track.speedMps ?? 0;
  for (const zone of zones) {
    if (distanceToPolygon(zone.polygon, track.x, track.z) <= ZONE_NEAR_M) {
      out.add(zone.id);
      continue;
    }
    for (let t = 5; v > 0 && t <= ZONE_LOOKAHEAD_S; t += 5) {
      if (
        pointInPolygon(track.x + Math.sin(a) * v * t, track.z + Math.cos(a) * v * t, zone.polygon)
      ) {
        out.add(zone.id);
        break;
      }
    }
  }
  return out;
}

/**
 * Zone ids revealed by the pointer (a hovered cluster label in 3D, a hovered
 * zone on the PPI). Written by the hover handlers, read every frame.
 */
export const hoveredZoneIds = new Set<string>();

/** Upper-case label for a zone: "Z1 · NO KINETIC · VILLAGE", "B1 · BORDER". */
export function zoneLabel(zone: Zone): string {
  const kind = zone.kind === 'NO_KINETIC' ? 'NO KINETIC' : zone.kind.replace(/_/g, ' ');
  const parts =
    zone.kind === 'BORDER_LINE'
      ? [zone.id, (zone.name ?? 'border').toUpperCase()]
      : [zone.id, kind];
  if (zone.kind !== 'BORDER_LINE' && zone.name) parts.push(zone.name.toUpperCase());
  return parts.join(' · ');
}

/** The point on a polyline closest to `to`. */
export function nearestPoint(line: readonly Point2[], to: Point2): Point2 {
  let best: Point2 = line[0] ?? to;
  let bestD = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = Math.min(
      1,
      Math.max(0, ((to[0] - ax) * (bx - ax) + (to[1] - az) * (bz - az)) / len2),
    );
    const p: Point2 = [ax + (bx - ax) * t, az + (bz - az) * t];
    const d = Math.hypot(p[0] - to[0], p[1] - to[1]);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

export function centroid(points: readonly Point2[]): Point2 {
  const n = points.length || 1;
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
}

/** Split a polyline so no segment is longer than `stepM` (to follow the terrain). */
export function densify(points: readonly Point2[], stepM: number, closed = false): Point2[] {
  const ring = closed && points.length > 0 ? [...points, points[0]!] : [...points];
  const out: Point2[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / stepM));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  const last = ring.at(-1);
  if (last) out.push(last);
  return out;
}

/**
 * Diagonal (45°) hatch segments inside a polygon, `spacingM` apart: each line
 * x − z = c is cut by the polygon edges and the inside spans are kept.
 */
export function hatchSegments(polygon: readonly Point2[], spacingM: number): [Point2, Point2][] {
  const ds = polygon.map(([x, z]) => x - z);
  const lo = Math.ceil(Math.min(...ds) / spacingM) * spacingM;
  const hi = Math.max(...ds);
  const out: [Point2, Point2][] = [];
  for (let c = lo; c <= hi; c += spacingM) {
    const xs: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const [ax, az] = polygon[i]!;
      const [bx, bz] = polygon[(i + 1) % polygon.length]!;
      const da = ax - az - c;
      const db = bx - bz - c;
      if ((da < 0 && db >= 0) || (db < 0 && da >= 0)) {
        const t = da / (da - db);
        xs.push(ax + (bx - ax) * t);
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      out.push([
        [xs[i]!, xs[i]! - c],
        [xs[i + 1]!, xs[i + 1]! - c],
      ]);
    }
  }
  return out;
}
