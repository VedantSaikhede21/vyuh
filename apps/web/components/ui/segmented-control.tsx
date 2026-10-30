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
 * tab stop (DESIGN §12). A pill track with a raised selected cell; in the HUD,
 * joined cells with a --select border.
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
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex gap-1 rounded-full bg-bg-2 p-1 hud:flex hud:gap-0 hud:rounded-none hud:bg-transparent hud:p-0',
        className,
      )}
    >
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
              'rounded-full text-label font-medium transition-[background-color,border-color,color] duration-150 ease-ui focus-visible:relative focus-visible:z-10 hud:rounded-none hud:border',
              // Joined edges: each wrapper sits in the group, so edges come from the index.
              i > 0 && !it.hint && 'hud:-ml-px',
              i === 0 && 'hud:rounded-l-sm',
              i === items.length - 1 && 'hud:rounded-r-sm',
              size === 'strip' ? 'h-6 px-2' : size === 'hud' ? 'h-7 px-3' : 'h-8 px-3',
              on
                ? 'relative z-[1] bg-bg-4 text-text-1 hud:border-select hud:bg-bg-3'
                : 'text-text-2 hover:text-text-1 hud:border-line-2 hud:hover:bg-bg-2',
              'disabled:cursor-not-allowed disabled:text-text-2 hud:disabled:border-line-1 hud:disabled:bg-bg-1',
            )}
          >
            {it.label}
          </button>
        );
        return it.hint ? (
          <Tooltip
            key={it.value}
            content={it.hint}
            side="bottom"
            className={cn(i > 0 && 'hud:-ml-px')}
          >
            {button}
          </Tooltip>
        ) : (
          <Fragment key={it.value}>{button}</Fragment>
        );
      })}
    </div>
  );
}
