// Difficulty constants shared by the Python generator and the sim-core validator
// (SPEC §7.1). Python reads them from apps/api/app/seed/generated/difficulty.json,
// written by `pnpm gen:schemas` (same pattern as class profiles, decision 49).

/**
 * Minimum warning (s) from a threat's first radar track to its critical point
 * (reaching an asset or dropping; for a threat that does neither, coming within
 * 1 km of an asset). The generator targets it; the validator enforces it.
 */
/** At D1–D2 the first threat gets a radar track within this many seconds of the start. */
export const FIRST_TRACK_MAX_S = 30;
/** Difficulties the FIRST_TRACK_MAX_S pacing target applies to. */
export const FIRST_TRACK_MAX_DIFFICULTY = 2;

export const MIN_WARNING_S: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: 60,
  2: 50,
  3: 45,
  4: 40,
  5: 30,
};
