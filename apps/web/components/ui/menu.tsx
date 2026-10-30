'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { rovingIndex } from './tabs';

export type MenuItem =
  | { kind: 'link'; label: ReactNode; href: string; testId?: string }
  | { kind: 'action'; label: ReactNode; onSelect: () => void; testId?: string }
  | { kind: 'separator' };

/**
 * Menu button (DESIGN §12, in-house like the tooltip, decision 61): opens on
 * click, Enter, Space or ArrowDown with focus on the first item; arrows / Home /
 * End move; Escape closes and returns focus to the button; Tab or a click
 * outside closes.
 */
export function Menu({
  label,
  items,
  align = 'end',
  buttonClassName,
  buttonTestId,
  defaultOpen = false,
  'aria-label': ariaLabel,
}: {
  /** Button content. */
  label: ReactNode;
  items: readonly MenuItem[];
  align?: 'start' | 'end';
  buttonClassName?: string;
  buttonTestId?: string;
  /** Start open without taking focus (design gallery / screenshots). */
  defaultOpen?: boolean;
  'aria-label'?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  /** Focus moves into the menu only when the user opened it. */
  const takeFocus = useRef(!defaultOpen);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const focusable = items.flatMap((it, i) => (it.kind === 'separator' ? [] : [i]));

  useEffect(() => {
    if (!open) {
      takeFocus.current = true;
      return;
    }
    if (takeFocus.current) itemRefs.current[focusable[0] ?? -1]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
    // focusable is derived from items; opening is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    const at = focusable.indexOf(itemRefs.current.indexOf(document.activeElement as HTMLElement));
    const j = rovingIndex(e.key, Math.max(at, 0), focusable.length);
    if (j === null) return;
    e.preventDefault();
    itemRefs.current[focusable[j] ?? -1]?.focus();
  };

  const itemClass =
    'flex h-9 w-full items-center rounded-sm px-3 text-left text-body text-text-1 outline-none hud:h-8 hud:rounded-none transition-colors duration-150 ease-ui hover:bg-bg-3 focus-visible:bg-bg-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus)';

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={ariaLabel}
        data-testid={buttonTestId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonClassName}
      >
        {label}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          onKeyDown={onListKey}
          className={cn(
            'absolute top-full z-40 mt-1 min-w-48 rounded-lg border border-(--edge-overlay) bg-bg-2 p-1 shadow-overlay hud:rounded-md hud:border-line-2 hud:p-0 hud:py-1',
            // Grows from the button's corner; closing is instant (§7).
            align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            !defaultOpen && 'animate-pop-in',
          )}
        >
          {items.map((it, i) => {
            if (it.kind === 'separator')
              return <div key={i} role="separator" className="my-1 border-t border-line-1" />;
            const ref = (el: HTMLElement | null) => {
              itemRefs.current[i] = el;
            };
            return it.kind === 'link' ? (
              <Link
                key={i}
                ref={ref}
                href={it.href}
                role="menuitem"
                tabIndex={-1}
                data-testid={it.testId}
                onClick={() => close(false)}
                className={itemClass}
              >
                {it.label}
              </Link>
            ) : (
              <button
                key={i}
                ref={ref}
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-testid={it.testId}
                onClick={() => {
                  close(true);
                  it.onSelect();
                }}
                className={itemClass}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
