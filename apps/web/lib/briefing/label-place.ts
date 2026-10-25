// Briefing map label placement (audit P2-3): a label takes the first candidate
// position that stays inside the map and clear of the zones and the labels drawn
// before it; if none is clear, the one with the least overlap.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function placeLabel(
  candidates: readonly Rect[],
  obstacles: readonly Rect[],
  size: number,
): Rect {
  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const c of candidates) {
    const outside = c.x < 0 || c.y < 0 || c.x + c.w > size || c.y + c.h > size;
    const cost = obstacles.reduce((s, o) => s + overlap(c, o), 0) + (outside ? 1e6 : 0);
    if (cost === 0) return c;
    if (cost < bestCost) {
      best = c;
      bestCost = cost;
    }
  }
  return best;
}

/** Bounding box of a polygon in screen pixels. */
export function bbox(pts: readonly (readonly [number, number])[]): Rect {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
