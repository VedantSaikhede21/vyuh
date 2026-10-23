'use client';

import type {
  AssignmentItem,
  ScenarioListItem,
  TerrainPresetMeta,
  TimeBandLabel,
} from '@vyuh/shared';
import { timeOfDayAt } from '@vyuh/sim-core';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Panel, PanelHeader, Pips, Skeleton, StatusNotice } from '@/components/hud/primitives';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { assignmentBadge, assignmentFor } from '@/lib/scenario/assignments';
import {
  conditions,
  filterAndSort,
  readQuery,
  shownTags,
  terrainLabel,
  TIME_LABELS,
  visibilityKm,
  writeQuery,
  type ListFilters,
  type SortKey,
} from '@/lib/scenario/library';
import { loadPresetMeta } from '@/lib/terrain/load-world';
import { cn } from '@/lib/utils';

// Training list (DESIGN §11.3, plan Step 11): a dense table, filters and sort
// kept in the URL, arrows + Enter to open a briefing.

const TH = 'h-7 bg-bg-2 px-2 text-left text-label font-medium whitespace-nowrap';
const TD = 'h-8 px-2 whitespace-nowrap';

const TIME_ICON: Record<TimeBandLabel, typeof Sun> = {
  Day: Sun,
  Dawn: Sunrise,
  Dusk: Sunset,
  Night: Moon,
};

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-label" htmlFor={id}>
        {label}
      </label>
      <Select
        id={id}
        className="h-7 w-auto py-0 pr-7 text-small"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Time of day per row, computed from the preset meta (as in the sim); the stored flag until it loads. */
export function useTimeOfDay(items: ScenarioListItem[] | null) {
  const [metas, setMetas] = useState<Record<string, TerrainPresetMeta>>({});
  useEffect(() => {
    if (!items) return;
    let live = true;
    for (const preset of new Set(items.map((s) => s.terrainPreset))) {
      loadPresetMeta(preset)
        .then((meta) => {
          if (live) setMetas((m) => ({ ...m, [preset]: meta }));
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [items]);

  const timeOf = useCallback(
    (s: ScenarioListItem) => {
      const meta = metas[s.terrainPreset];
      return meta ? timeOfDayAt(s.date, s.time, meta) : null;
    },
    [metas],
  );
  const label = useCallback(
    (s: ScenarioListItem): TimeBandLabel => timeOf(s)?.label ?? (s.isNight ? 'Night' : 'Day'),
    [timeOf],
  );
  return { timeOf, label };
}

/** Scenario rows: arrows / Home / End move, Enter or a click opens the briefing. */
export function ScenarioRowsTable({
  rows,
  ariaLabel,
  testId,
  timeOf,
  label,
  assignments = [],
}: {
  rows: ScenarioListItem[];
  ariaLabel: string;
  testId: string;
  /** The trainee's assignments, for the Assigned badge (Phase 4b). */
  assignments?: readonly AssignmentItem[];
} & ReturnType<typeof useTimeOfDay>) {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  // A filter change can shrink the list under the focused row.
  const focused = Math.min(focus, Math.max(rows.length - 1, 0));

  const open = (s: ScenarioListItem) => {
    setOpening(s.id);
    router.push(`/train/scenario/${s.id}`);
  };

  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, i: number) => {
    const move = (to: number) => {
      e.preventDefault();
      const j = Math.min(Math.max(to, 0), rows.length - 1);
      setFocus(j);
      rowRefs.current[j]?.focus();
    };
    if (e.key === 'ArrowDown') move(i + 1);
    else if (e.key === 'ArrowUp') move(i - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(rows.length - 1);
    else if (e.key === 'Enter') {
      e.preventDefault();
      const s = rows[i];
      if (s) open(s);
    }
  };

  return (
    <table className="w-full border-collapse" aria-label={ariaLabel} data-testid={testId}>
      <thead>
        <tr>
          <th className={cn(TH, 'w-[4.5rem]')}>
            <span className="sr-only">Terrain</span>
          </th>
          <th className={cn(TH, 'w-full')}>Scenario</th>
          <th className={TH}>Difficulty</th>
          <th className={TH}>Time</th>
          <th className={TH}>Conditions</th>
          <th className={TH}>Tags</th>
          <th className={cn(TH, 'text-right')}>Duration</th>
          <th className={cn(TH, 'text-right')}>Best</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => {
          const tod = timeOf(s);
          const tl = label(s);
          const Icon = TIME_ICON[tl];
          const cond = conditions(s.weather);
          const assigned = assignmentFor(s.id, assignments);
          const badge = assigned ? assignmentBadge(assigned) : null;
          return (
            <tr
              key={s.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              tabIndex={i === focused ? 0 : -1}
              data-testid={`scenario-${s.code ?? s.id}`}
              aria-label={`${s.code ? `${s.code} ` : ''}${s.name}: open the briefing`}
              onClick={() => open(s)}
              onKeyDown={(e) => onKey(e, i)}
              onFocus={() => setFocus(i)}
              className={cn(
                'cursor-pointer border-t border-line-1 transition-colors duration-150 ease-ui hover:bg-bg-2 focus-visible:bg-bg-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-select',
                opening === s.id && 'bg-bg-3',
              )}
            >
              <td className="h-8 w-[3.25rem] min-w-[3.25rem] py-0 pl-2">
                {/* Decorative: the terrain is named in the row's Conditions tooltip. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/terrain/${s.terrainPreset}/thumb.png`}
                  width={64}
                  height={40}
                  alt=""
                  className="block h-[26px] w-[42px] max-w-none shrink-0 rounded-sm border border-line-1 object-cover"
                />
              </td>
              <td className={cn(TD, 'text-body')}>
                {s.code && <span className="mr-2 text-readout text-text-2">{s.code}</span>}
                <span className="text-text-1">{s.name}</span>
                {badge && (
                  <Badge
                    className="ml-2"
                    tone={
                      badge.state === 'DONE' ? 'ok' : badge.state === 'OVERDUE' ? 'warn' : 'strong'
                    }
                    title={badge.title}
                    data-testid="assigned-badge"
                  >
                    {badge.label}
                  </Badge>
                )}
                {opening === s.id && (
                  <span className="ml-2 text-small text-text-2">Opening briefing…</span>
                )}
              </td>
              <td className={TD}>
                <Pips value={s.difficulty} />
              </td>
              <td className={cn(TD, 'text-body text-text-2')}>
                <span
                  className="flex items-center gap-1.5"
                  title={tod ? `Sun ${tod.sunElDeg.toFixed(1)}° · ${s.date} ${s.time}` : undefined}
                >
                  <Icon size={16} strokeWidth={1.5} aria-hidden />
                  {tl}
                </span>
              </td>
              <td className={cn(TD, 'text-body text-text-2')} title={terrainLabel(s.terrainPreset)}>
                {cond.label}
                <span className="text-readout text-text-1">
                  {' '}
                  {visibilityKm(s.weather.visibilityM)}
                </span>
                <span className="text-text-3"> km</span>
              </td>
              <td className={TD}>
                <span className="flex gap-1">
                  {shownTags(s).map((t) => (
                    <Badge key={t} tone={t === 'test' ? 'default' : 'strong'}>
                      {t}
                    </Badge>
                  ))}
                </span>
              </td>
              <td className={cn(TD, 'text-right text-readout')}>
                {Math.round(s.durationS / 60)}
                <span className="text-text-3"> min</span>
              </td>
              <td className={cn(TD, 'text-right text-readout')} data-testid="best-score">
                {s.bestScore === null ? (
                  <span className="text-text-3">—</span>
                ) : (
                  Math.round(s.bestScore)
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ScenarioTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { filters, sort } = useMemo(
    () => readQuery(new URLSearchParams(params.toString())),
    [params],
  );
  const [items, setItems] = useState<ScenarioListItem[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    // Badges only; the list still works if this fails.
    api
      .myAssignments(ctrl.signal)
      .then((r) => setAssignments(r.items))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const fetchList = useCallback((signal?: AbortSignal) => {
    api
      .listScenarios(signal)
      .then((r) => setItems(r.items))
      .catch((err: unknown) => {
        if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Network error');
      });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchList(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchList]);

  const { timeOf, label } = useTimeOfDay(items);

  const rows = useMemo(
    () =>
      items
        ? filterAndSort(
            items,
            filters,
            sort,
            label,
            (s) => assignmentFor(s.id, assignments) !== null,
          )
        : [],
    [items, filters, sort, label, assignments],
  );

  const setQuery = (next: Partial<ListFilters>, nextSort: SortKey = sort) => {
    router.replace(`${pathname}${writeQuery({ ...filters, ...next }, nextSort)}`, {
      scroll: false,
    });
  };

  const presets = [...new Set(items?.map((s) => s.terrainPreset) ?? [])].sort();
  const tags = [...new Set(items?.flatMap(shownTags) ?? [])].sort();
  const filtered =
    filters.difficulty !== null ||
    filters.terrain ||
    filters.time ||
    filters.tag ||
    filters.assigned;
  const openAssigned = assignments.filter((a) => !a.completed).length;

  return (
    <Panel>
      <PanelHeader title="Scenarios">
        {items && (
          <span className="text-label" data-testid="scenario-count">
            {rows.length} of {items.length}
          </span>
        )}
      </PanelHeader>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-1 px-3 py-2">
        <FilterSelect
          id="f-difficulty"
          label="Difficulty"
          value={filters.difficulty === null ? '' : String(filters.difficulty)}
          onChange={(v) => setQuery({ difficulty: v ? Number(v) : null })}
          options={[
            { value: '', label: 'All' },
            ...[1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: String(d) })),
          ]}
        />
        <FilterSelect
          id="f-terrain"
          label="Terrain"
          value={filters.terrain ?? ''}
          onChange={(v) => setQuery({ terrain: v || null })}
          options={[
            { value: '', label: 'All' },
            ...presets.map((p) => ({ value: p, label: terrainLabel(p) })),
          ]}
        />
        <FilterSelect
          id="f-time"
          label="Time"
          value={filters.time ?? ''}
          onChange={(v) => setQuery({ time: TIME_LABELS.find((t) => t === v) ?? null })}
          options={[
            { value: '', label: 'All' },
            ...TIME_LABELS.map((t) => ({ value: t, label: t })),
          ]}
        />
        <FilterSelect
          id="f-tag"
          label="Tag"
          value={filters.tag ?? ''}
          onChange={(v) => setQuery({ tag: v || null })}
          options={[{ value: '', label: 'All' }, ...tags.map((t) => ({ value: t, label: t }))]}
        />
        <label className="flex items-center gap-2 text-label" htmlFor="f-assigned">
          <input
            id="f-assigned"
            type="checkbox"
            className="size-4 accent-select"
            checked={filters.assigned}
            onChange={(e) => setQuery({ assigned: e.target.checked })}
          />
          Assigned
          <span className="text-readout text-text-2" data-testid="assigned-open">
            {openAssigned}
          </span>
        </label>
        <FilterSelect
          id="f-sort"
          label="Sort"
          value={sort}
          onChange={(v) => setQuery({}, v as SortKey)}
          options={[
            { value: 'difficulty', label: 'Difficulty' },
            { value: 'name', label: 'Name' },
            { value: 'best', label: 'Best score' },
          ]}
        />
      </div>
      {error && (
        <StatusNotice
          tone="error"
          title="Could not load scenarios."
          onRetry={() => {
            setError(null);
            setItems(null);
            fetchList();
          }}
        >
          {error}. Check that the API is running, then retry.
        </StatusNotice>
      )}
      {items === null && !error && <Skeleton label="Loading scenarios" />}
      {items?.length === 0 && (
        <StatusNotice title="No scenarios yet.">
          An administrator seeds them with <code>uv run python -m app.seed.demo</code>.
        </StatusNotice>
      )}
      {items && items.length > 0 && rows.length === 0 && (
        <StatusNotice
          title="No scenario matches these filters."
          action={
            <button
              type="button"
              className="text-label hover:text-text-1"
              onClick={() =>
                setQuery({
                  difficulty: null,
                  terrain: null,
                  time: null,
                  tag: null,
                  assigned: false,
                })
              }
            >
              Clear filters
            </button>
          }
        />
      )}
      {rows.length > 0 && (
        <ScenarioRowsTable
          rows={rows}
          ariaLabel="Scenarios"
          testId="scenario-table"
          timeOf={timeOf}
          label={label}
          assignments={assignments}
        />
      )}
      {filtered && rows.length > 0 && (
        <p className="border-t border-line-1 px-3 py-1.5 text-small text-text-3">
          Filtered: {rows.length} of {items?.length ?? 0} scenarios shown.
        </p>
      )}
    </Panel>
  );
}
