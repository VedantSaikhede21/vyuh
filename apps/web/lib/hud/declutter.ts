// Greedy label placement for the radar PPI (approved 3.0: bird flocks made
// labels unreadable). Each track label tries right, left, above, below its
// symbol; a label that would overlap another label or symbol, or leave the
// scope, is dropped — except the selected track's, which is always drawn.
// Fixed obstacles (zone labels, decision 98) are avoided the same way.

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
  obstacles: readonly Rect[] = [],
  /** Symbols of other items (not labelled in this call) that labels must avoid. */
  others: readonly { id: string; x: number; y: number }[] = [],
): Map<string, { x: number; y: number }> {
  const symbols = [...items, ...others.filter((o) => !items.some((i) => i.id === o.id))].map(
    (i) => ({
      id: i.id,
      rect: { x: i.x - symbolR, y: i.y - symbolR, w: symbolR * 2, h: symbolR * 2 },
    }),
  );
  const order = [...items].sort((a, b) =>
    a.keep === b.keep ? a.id.localeCompare(b.id) : a.keep ? -1 : 1,
  );
  const placed: Rect[] = [...obstacles];
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

/** A symbol drawn on the scope (track or asset) whose label is placed beside it. */
export interface SymbolLabel extends LabelRequest {
  /** Placed before zone labels and always drawn (asset, selected track, threat track). */
  priority: boolean;
}

/** A zone label with its candidate boxes in order of preference. */
export interface ZoneLabelRequest {
  key: string;
  candidates: readonly Rect[];
  /** Drawn at its first candidate even with no clear spot (the zone is hovered). */
  forced: boolean;
}

/**
 * PPI label layout by priority (3b close-out): asset, selected-track and
 * threat-track labels first (always drawn, beside their symbol); then zone
 * labels at the first candidate clear of everything placed and of every
 * symbol, or hidden; then the other track labels, dropped when crowded.
 * `inside` limits zone labels to the scope circle.
 */
export function layoutPpiLabels(
  symbols: readonly SymbolLabel[],
  zones: readonly ZoneLabelRequest[],
  bounds: { w: number; h: number },
  symbolR: number,
  inside: (r: Rect) => boolean = () => true,
): {
  symbols: Map<string, { x: number; y: number }>;
  zones: Map<string, { x: number; y: number }>;
} {
  const first = placeLabels(
    symbols.filter((s) => s.priority).map((s) => ({ ...s, keep: true })),
    bounds,
    symbolR,
    3,
    [],
    symbols,
  );
  const placed: Rect[] = symbols.flatMap((s) => {
    const at = first.get(s.id);
    return at ? [{ ...at, w: s.w, h: s.h }] : [];
  });
  const marks = symbols.map((s) => ({
    x: s.x - symbolR,
    y: s.y - symbolR,
    w: symbolR * 2,
    h: symbolR * 2,
  }));
  const zoneOut = new Map<string, { x: number; y: number }>();
  for (const z of zones) {
    const clear = (r: Rect) =>
      r.x >= 0 &&
      r.y >= 0 &&
      r.x + r.w <= bounds.w &&
      r.y + r.h <= bounds.h &&
      inside(r) &&
      ![...placed, ...marks].some((p) => overlaps(p, r));
    const chosen = z.candidates.find(clear) ?? (z.forced ? z.candidates[0] : undefined);
    if (!chosen) continue;
    placed.push(chosen);
    zoneOut.set(z.key, { x: chosen.x, y: chosen.y });
  }
  const rest = placeLabels(
    symbols.filter((s) => !s.priority),
    bounds,
    symbolR,
    3,
    placed,
    symbols,
  );
  return { symbols: new Map([...first, ...rest]), zones: zoneOut };
}
