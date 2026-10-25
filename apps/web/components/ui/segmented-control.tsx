'use client';

import { Fragment, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { rovingIndex } from './tabs';

export interface SegmentItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Tooltip: what choosing it means, or why it is disabled. */
  hint?: string;
  disabled?: boolean;
  testId?: string;
}

/**
 * One-of-n choice as joined buttons (radiogroup): arrows move and select, one
 * tab stop (DESIGN §12). Selected = --select border on --bg-3.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  label,
  size = 'sm',
  className,
}: {
  items: readonly SegmentItem<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name of the group. */
  label: string;
  /** strip 24 px (inside a 28 px panel header), hud 28 px, sm 32 px. */
  size?: 'strip' | 'hud' | 'sm';
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.filter((it) => !it.disabled);
  const onKey = (e: KeyboardEvent, current: T) => {
    const i = enabled.findIndex((it) => it.value === current);
    const j = rovingIndex(e.key, i, enabled.length);
    if (j === null) return;
    e.preventDefault();
    const next = enabled[j];
    if (!next) return;
    onChange(next.value);
    refs.current[items.indexOf(next)]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex', className)}>
      {items.map((it, i) => {
        const on = it.value === value;
        const button = (
          <button
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={it.disabled}
            tabIndex={on ? 0 : -1}
            data-testid={it.testId}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => onKey(e, it.value)}
            className={cn(
              'border text-label font-medium transition-[background-color,border-color,color] duration-150 ease-ui focus-visible:relative focus-visible:z-10',
              // Joined edges: each wrapper sits in the group, so edges come from the index.
              i > 0 && !it.hint && '-ml-px',
              i === 0 && 'rounded-l-sm',
              i === items.length - 1 && 'rounded-r-sm',
              size === 'strip' ? 'h-6 px-2' : size === 'hud' ? 'h-7 px-3' : 'h-8 px-3',
              on
                ? 'relative z-[1] border-select bg-bg-3 text-text-1'
                : 'border-line-2 text-text-2 hover:bg-bg-2 hover:text-text-1',
              'disabled:cursor-not-allowed disabled:border-line-1 disabled:bg-bg-1 disabled:text-text-2',
            )}
          >
            {it.label}
          </button>
        );
        return it.hint ? (
          <Tooltip key={it.value} content={it.hint} side="bottom" className={cn(i > 0 && '-ml-px')}>
            {button}
          </Tooltip>
        ) : (
          <Fragment key={it.value}>{button}</Fragment>
        );
      })}
    </div>
  );
}
