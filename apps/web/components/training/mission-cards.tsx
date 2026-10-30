'use client';

import type { AssignmentItem, ScenarioListItem } from '@vyuh/shared';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Pips } from '@/components/hud/primitives';
import { Badge } from '@/components/ui/badge';
import { gridMove } from '@/components/ui/tabs';
import { renderFor } from '@/lib/renders';
import { assignmentBadge, assignmentFor } from '@/lib/scenario/assignments';
import { conditions, visibilityKm } from '@/lib/scenario/library';
import { cn } from '@/lib/utils';
import type { useTimeOfDay } from './scenario-table';

const TIME_ICON = { Day: Sun, Dawn: Sunrise, Dusk: Sunset, Night: Moon } as const;
/** Grid columns: four from 1280 px (see the Tailwind classes below). */
const columnsNow = () =>
  typeof window !== 'undefined' && window.innerWidth >= 1280
    ? 4
    : typeof window !== 'undefined' && window.innerWidth >= 1024
      ? 3
      : 2;

/**
 * Scenarios as a gallery of their own terrain (DESIGN §11.3): a still, the name
 * on a scrim, and the facts that decide the choice. One tab stop; arrows move,
 * Enter or a click opens the briefing, as in the table.
 */
export function MissionCards({
  rows,
  ariaLabel,
  testId,
  label,
  assignments = [],
}: {
  rows: ScenarioListItem[];
  ariaLabel: string;
  testId: string;
  assignments?: readonly AssignmentItem[];
} & Pick<ReturnType<typeof useTimeOfDay>, 'label'>) {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focused = Math.min(focus, Math.max(rows.length - 1, 0));

  const open = (s: ScenarioListItem) => {
    setOpening(s.id);
    router.push(`/train/scenario/${s.id}`);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const cols = columnsNow();
    const rowsCount = Math.ceil(rows.length / cols);
    const to = gridMove(e.key, e.ctrlKey, Math.floor(i / cols), i % cols, rowsCount, cols);
    if (!to) return;
    e.preventDefault();
    const j = Math.min(to[0] * cols + to[1], rows.length - 1);
    setFocus(j);
    refs.current[j]?.focus();
  };

  return (
    <ul
      aria-label={ariaLabel}
      data-testid={testId}
      className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((s, i) => {
        const src = renderFor(s.code, s.terrainPreset);
        const tl = label(s);
        const Icon = TIME_ICON[tl];
        const cond = conditions(s.weather);
        const assigned = assignmentFor(s.id, assignments);
        const badge = assigned ? assignmentBadge(assigned) : null;
        return (
          <li key={s.id} className="min-w-0">
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focused ? 0 : -1}
              data-testid={`scenario-${s.code ?? s.id}`}
              aria-label={`${s.code ? `${s.code} ` : ''}${s.name}: open the briefing`}
              onClick={() => open(s)}
              onKeyDown={(e) => onKey(e, i)}
              onFocus={() => setFocus(i)}
              className={cn(
                'group flex w-full flex-col overflow-hidden rounded-lg bg-bg-1 text-left transition-transform duration-180 ease-ui hover:-translate-y-0.5',
                opening === s.id && 'bg-bg-3',
              )}
            >
              <span className="relative block aspect-video w-full overflow-hidden bg-bg-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src.w640}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-180 ease-ui group-hover:scale-[1.03]"
                />
                {badge && (
                  <Badge
                    className="absolute right-2 top-2 border-transparent bg-bg-0"
                    tone={
                      badge.state === 'DONE' ? 'ok' : badge.state === 'OVERDUE' ? 'warn' : 'strong'
                    }
                    title={badge.title}
                    data-testid="assigned-badge"
                  >
                    {badge.label}
                  </Badge>
                )}
              </span>
              <span className="flex flex-col gap-1.5 p-3">
                <span className="line-clamp-2 min-h-12 text-h3 text-text-1" title={s.name}>
                  {s.code && (
                    <span className="mr-2 font-mono text-[14px] font-normal text-text-2">
                      {s.code}
                    </span>
                  )}
                  {s.name}
                </span>
                <span className="flex items-center justify-between gap-2 text-small text-text-2">
                  <Pips value={s.difficulty} />
                  <span className="flex items-center gap-1.5">
                    <Icon size={16} strokeWidth={1.5} aria-hidden />
                    {tl}
                  </span>
                  <span className="whitespace-nowrap">
                    {cond.label} {visibilityKm(s.weather.visibilityM)} km
                  </span>
                </span>
                <span className="flex justify-between text-small text-text-2">
                  <span>{Math.round(s.durationS / 60)} min</span>
                  <span>
                    {opening === s.id ? (
                      'Opening briefing…'
                    ) : (
                      <>
                        Best{' '}
                        <span className="tnum text-text-1" data-testid="best-score">
                          {s.bestScore === null ? '—' : Math.round(s.bestScore)}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
