// Greedy label placement for the radar PPI (approved 3.0: bird flocks made
// labels unreadable). Each track label tries right, left, above, below its
// symbol; a label that would overlap another label or symbol, or leave the
// scope, is dropped — except the selected track's, which is always drawn.

export interface LabelRequest {
  id: string;
  /** Symbol centre, px. */
  x: number;
  y: number;
  /** Label size, px. */
  w: number;
  h: number;
  /** Always placed (selected track). */
  keep?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Returns each placed label's top-left corner, by track id. */
export function placeLabels(
  items: readonly LabelRequest[],
  bounds: { w: number; h: number },
  symbolR: number,
  gap = 3,
): Map<string, { x: number; y: number }> {
  const symbols = items.map((i) => ({
    id: i.id,
    rect: { x: i.x - symbolR, y: i.y - symbolR, w: symbolR * 2, h: symbolR * 2 },
  }));
  const order = [...items].sort((a, b) =>
    a.keep === b.keep ? a.id.localeCompare(b.id) : a.keep ? -1 : 1,
  );
  const placed: Rect[] = [];
  const out = new Map<string, { x: number; y: number }>();
  for (const it of order) {
    const d = symbolR + gap;
    const candidates: Rect[] = [
      { x: it.x + d, y: it.y - it.h / 2, w: it.w, h: it.h },
      { x: it.x - d - it.w, y: it.y - it.h / 2, w: it.w, h: it.h },
      { x: it.x - it.w / 2, y: it.y - d - it.h, w: it.w, h: it.h },
      { x: it.x - it.w / 2, y: it.y + d, w: it.w, h: it.h },
    ];
    const fits = (r: Rect) =>
      r.x >= 0 &&
      r.y >= 0 &&
      r.x + r.w <= bounds.w &&
      r.y + r.h <= bounds.h &&
      !placed.some((p) => overlaps(p, r)) &&
      !symbols.some((s) => s.id !== it.id && overlaps(s.rect, r));
    const chosen = candidates.find(fits) ?? (it.keep ? candidates[0] : undefined);
    if (!chosen) continue;
    placed.push(chosen);
    out.set(it.id, { x: chosen.x, y: chosen.y });
  }
  return out;
}
