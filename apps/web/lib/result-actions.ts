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
