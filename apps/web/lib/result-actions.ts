/**
 * Which result-screen action is primary (audit P0-3, user 2026-10-24): under 50
 * the trainee retries the same seed (the debrief's drill is offered beside it);
 * from 80 the next scenario; in between nothing is pushed — replay, retry and
 * next stay equal. `total` is the display value (decision 149).
 */
export type PrimaryAction = 'retry' | 'next' | null;

export const RETRY_BELOW = 50;
export const NEXT_FROM = 80;

export function primaryAction(total: number): PrimaryAction {
  if (total < RETRY_BELOW) return 'retry';
  if (total >= NEXT_FROM) return 'next';
  return null;
}

/** "1,024": ratings are shown with a thousands separator. */
export function formatRating(r: number): string {
  return r.toLocaleString('en-GB');
}

/**
 * Why the total is not the sum of the component bars (audit P1-13): the API
 * scales the components a tree scores to 100, then adds penalties and bonuses
 * (`engine.py`). Null when the bars already add up to the total's basis.
 * `components` are the display values (decision 149).
 */
export function scaleNote(
  components: Record<string, number>,
  componentMax: Record<string, number>,
  adjustments: number,
): string | null {
  const scored = Object.keys(componentMax).filter((c) => (componentMax[c] ?? 0) > 0);
  const possible = scored.reduce((s, c) => s + (componentMax[c] ?? 0), 0);
  if (possible === 100 && adjustments === 0) return null;
  const earned = scored.reduce((s, c) => s + (components[c] ?? 0), 0);
  const parts = [
    `Components ${earned.toFixed(1)} of ${possible} points${possible === 100 ? '' : ', scaled to 100'}`,
  ];
  if (adjustments !== 0) {
    parts.push(`${adjustments > 0 ? '+' : '−'}${Math.abs(adjustments)} penalties and bonuses`);
  }
  return `${parts.join(', then ')}.`;
}
