import type { Affiliation } from '@vyuh/shared';
import { AFFILIATION_HEX } from '@/lib/theme/scene-colours';

// APP-6 affiliation colours (DESIGN §3.3; `hex` for canvas/WebGL, `textClass`
// for DOM) plus a letter, so colour is never the only cue (DESIGN §10).
export const AFFILIATION_STYLE: Record<
  Affiliation,
  { hex: string; textClass: string; letter: string; label: string }
> = {
  HOSTILE: {
    hex: AFFILIATION_HEX.HOSTILE,
    textClass: 'text-aff-hostile',
    letter: 'H',
    label: 'Hostile',
  },
  FRIENDLY: {
    hex: AFFILIATION_HEX.FRIENDLY,
    textClass: 'text-aff-friendly',
    letter: 'F',
    label: 'Friendly',
  },
  NEUTRAL: {
    hex: AFFILIATION_HEX.NEUTRAL,
    textClass: 'text-aff-neutral',
    letter: 'N',
    label: 'Neutral',
  },
  UNKNOWN: {
    hex: AFFILIATION_HEX.UNKNOWN,
    textClass: 'text-aff-unknown',
    letter: 'U',
    label: 'Unknown',
  },
};

/**
 * Simplified APP-6 frame outline for an affiliation, as a closed polygon in a
 * unit box (x right, y up, |x|, |y| ≤ 1): hostile diamond, friendly circle,
 * neutral square, unknown quatrefoil. One source for the track list (SVG), the
 * PPI (canvas) and the 3D track markers.
 */
export function affiliationOutline(aff: Affiliation): readonly (readonly [number, number])[] {
  switch (aff) {
    case 'HOSTILE':
      return [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ];
    case 'NEUTRAL':
      return [
        [-0.8, 0.8],
        [0.8, 0.8],
        [0.8, -0.8],
        [-0.8, -0.8],
      ];
    case 'FRIENDLY':
      return polar(() => 0.9, 32);
    case 'UNKNOWN':
      // Four lobes on the axes.
      return polar((t) => 0.75 + 0.25 * Math.cos(4 * t), 48);
  }
}

function polar(r: (theta: number) => number, n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [r(t) * Math.cos(t), r(t) * Math.sin(t)] as [number, number];
  });
}

/** Trace the outline on a canvas, centred at (x, y) with half-size r (canvas y is down). */
export function traceAffiliation(
  ctx: CanvasRenderingContext2D,
  aff: Affiliation,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  affiliationOutline(aff).forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(x + px * r, y - py * r);
    else ctx.lineTo(x + px * r, y - py * r);
  });
  ctx.closePath();
}
