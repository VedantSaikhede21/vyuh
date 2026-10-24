'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  testId?: string;
}

/** Arrow / Home / End index for a roving set of `n` items (tabs, radios, menus). */
export function rovingIndex(key: string, i: number, n: number): number | null {
  if (n === 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (i + 1) % n;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (i - 1 + n) % n;
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    default:
      return null;
  }
}

const VARIANT = {
  // Fills a panel header strip: equal cells split by 1 px rules (AAR side panel, player).
  strip: {
    list: 'flex h-7 shrink-0 border-b border-line-1 bg-bg-2',
    tab: 'h-full flex-1 border-r border-line-1 px-2 text-label font-medium last:border-r-0 focus-visible:-outline-offset-2',
    on: 'bg-bg-1 text-text-1',
    off: 'text-text-2 hover:bg-bg-3 hover:text-text-1',
  },
  // Page-level: labels on a hairline with a 2 px --select underline (same as the nav).
  underline: {
    list: 'flex h-8 shrink-0 gap-4 border-b border-line-1',
    tab: '-mb-px h-full border-b-2 text-label font-medium focus-visible:outline-offset-0',
    on: 'border-select text-text-1',
    off: 'border-transparent text-text-2 hover:text-text-1',
  },
} as const;

/**
 * ARIA tablist (DESIGN §12): automatic activation, arrow keys / Home / End move
 * and select, one tab stop. Pair each tab with a `TabPanel` using the same
 * `idBase`.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  idBase,
  variant = 'strip',
  className,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  idBase: string;
  variant?: keyof typeof VARIANT;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const v = VARIANT[variant];
  const onKey = (e: KeyboardEvent, i: number) => {
    const j = rovingIndex(e.key, i, items.length);
    if (j === null) return;
    e.preventDefault();
    const next = items[j];
    if (!next) return;
    onChange(next.id);
    refs.current[j]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn(v.list, className)}>
      {items.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            data-testid={t.testId}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              v.tab,
              'transition-[background-color,border-color,color] duration-150 ease-ui',
              on ? v.on : v.off,
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  id,
  className,
  children,
}: {
  idBase: string;
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${id}`}
      aria-labelledby={`${idBase}-tab-${id}`}
      className={className}
    >
      {children}
    </div>
  );
}
