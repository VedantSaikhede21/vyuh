import type { Point2, Zone } from '@vyuh/shared';

// Zone geometry helpers for drawing (3D and PPI). Display only — the sim's
// NO_KINETIC gate lives in sim-core (decision 69).

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
