import type { ScenarioListItem, TimeBandLabel, Weather } from '@vyuh/shared';

// Training list helpers (DESIGN §11.3): conditions, time of day, filters, sort and
// their URL form. Pure, so the table and its tests share them.

export const TERRAIN_LABEL: Record<string, string> = {
  PROCEDURAL_HILLS: 'Training hills',
  PUNJAB_PLAINS: 'Punjab plains',
  JK_MOUNTAIN: 'J&K mountains',
  URBAN_GENERIC: 'Urban town',
};

export const terrainLabel = (preset: string): string =>
  TERRAIN_LABEL[preset] ?? preset.replaceAll('_', ' ').toLowerCase();

export type ConditionsKind = 'CLEAR' | 'HAZE' | 'FOG' | 'RAIN';

/** Below this visibility the list says fog, below HAZE_BELOW_M haze (generator presets: 0.8 / 6 km). */
export const FOG_BELOW_M = 1500;
export const HAZE_BELOW_M = 8000;

export function conditions(w: Weather): { kind: ConditionsKind; label: string } {
  if (w.rainMmph > 0) return { kind: 'RAIN', label: 'Rain' };
  if (w.visibilityM < FOG_BELOW_M) return { kind: 'FOG', label: 'Fog' };
  if (w.visibilityM < HAZE_BELOW_M) return { kind: 'HAZE', label: 'Haze' };
  return { kind: 'CLEAR', label: 'Clear' };
}

/** Visibility for a readout: one decimal under 10 km, whole kilometres above. */
export function visibilityKm(m: number): string {
  const km = m / 1000;
  return km < 10 ? km.toFixed(1) : km.toFixed(0);
}

/** Tags shown on a row; `library` is on every library scenario, so it says nothing. */
export const shownTags = (item: ScenarioListItem): string[] =>
  item.tags.filter((t) => t !== 'library');

export type SortKey = 'difficulty' | 'name' | 'best';
export const SORT_KEYS: readonly SortKey[] = ['difficulty', 'name', 'best'];
export const TIME_LABELS: readonly TimeBandLabel[] = ['Day', 'Dawn', 'Dusk', 'Night'];

export interface ListFilters {
  difficulty: number | null;
  terrain: string | null;
  time: TimeBandLabel | null;
  tag: string | null;
}

export const NO_FILTERS: ListFilters = { difficulty: null, terrain: null, time: null, tag: null };

export function readQuery(params: URLSearchParams): { filters: ListFilters; sort: SortKey } {
  const d = Number(params.get('difficulty'));
  const time = params.get('time');
  const sort = params.get('sort');
  return {
    filters: {
      difficulty: Number.isInteger(d) && d >= 1 && d <= 5 ? d : null,
      terrain: params.get('terrain') || null,
      time: TIME_LABELS.find((t) => t === time) ?? null,
      tag: params.get('tag') || null,
    },
    sort: SORT_KEYS.find((k) => k === sort) ?? 'difficulty',
  };
}

/** Query string for the current state; defaults are left out. */
export function writeQuery(filters: ListFilters, sort: SortKey): string {
  const q = new URLSearchParams();
  if (filters.difficulty !== null) q.set('difficulty', String(filters.difficulty));
  if (filters.terrain) q.set('terrain', filters.terrain);
  if (filters.time) q.set('time', filters.time);
  if (filters.tag) q.set('tag', filters.tag);
  if (sort !== 'difficulty') q.set('sort', sort);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Filtered and sorted rows; `timeOf` gives a row's computed time-of-day label. */
export function filterAndSort(
  items: readonly ScenarioListItem[],
  filters: ListFilters,
  sort: SortKey,
  timeOf: (item: ScenarioListItem) => TimeBandLabel,
): ScenarioListItem[] {
  const rows = items.filter(
    (s) =>
      (filters.difficulty === null || s.difficulty === filters.difficulty) &&
      (filters.terrain === null || s.terrainPreset === filters.terrain) &&
      (filters.time === null || timeOf(s) === filters.time) &&
      (filters.tag === null || s.tags.includes(filters.tag)),
  );
  const code = (s: ScenarioListItem) => s.code ?? '~';
  const byDifficulty = (a: ScenarioListItem, b: ScenarioListItem) =>
    a.difficulty - b.difficulty || code(a).localeCompare(code(b));
  const compare: Record<SortKey, (a: ScenarioListItem, b: ScenarioListItem) => number> = {
    difficulty: byDifficulty,
    name: (a, b) => a.name.localeCompare(b.name) || byDifficulty(a, b),
    // Best first; unplayed last.
    best: (a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1) || byDifficulty(a, b),
  };
  return [...rows].sort(compare[sort]);
}
