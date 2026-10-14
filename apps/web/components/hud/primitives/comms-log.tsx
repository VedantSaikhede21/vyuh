'use client';

import { useEffect, useRef } from 'react';
import { formatClock } from '@/lib/strings';
import { cn } from '@/lib/utils';

export type CommsStatus = 'info' | 'ok' | 'warn' | 'crit';

export interface CommsLine {
  /** Stable key (event seq, or a local id for an unconfirmed command). */
  id: string;
  tMs: number;
  text: string;
  /** Colour only for outcome status (DESIGN §11.5); plain lines are info. */
  status?: CommsStatus;
  /** Echoed on dispatch, not yet applied by the sim (e.g. while paused). */
  pending?: boolean;
}

const STATUS_CLASS: Record<CommsStatus, string> = {
  info: 'text-text-1',
  ok: 'text-ok',
  warn: 'text-warn',
  crit: 'text-crit',
};

/**
 * Comms log (DESIGN §9): every action and outcome as a timestamped line,
 * newest at the bottom, last `max` lines. Replaces toasts in the sim player.
 */
export function CommsLog({
  lines,
  max = 8,
  className,
  empty = 'No traffic yet. Actions and sensor reports appear here.',
}: {
  lines: readonly CommsLine[];
  max?: number;
  className?: string;
  empty?: string;
}) {
  const shown = lines.slice(-max);
  const list = useRef<HTMLOListElement>(null);
  // Stay on the newest line unless the operator has scrolled up to read.
  const pinned = useRef(true);
  /** Height at the last scroll/resize: a scroll caused by a layout change is not the operator's. */
  const lastH = useRef(0);
  const lastId = shown.at(-1)?.id;
  const hasLines = shown.length > 0;
  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      lastH.current = el.clientHeight;
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasLines]);

  if (shown.length === 0) {
    return <p className={cn('px-3 py-2 text-small text-text-3', className)}>{empty}</p>;
  }
  return (
    <ol
      ref={list}
      aria-label="Comms log"
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.clientHeight !== lastH.current) return;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
      }}
      className={cn('min-h-0 overflow-y-auto px-3 py-1 [overflow-anchor:none]', className)}
    >
      {shown.map((l) => (
        <li key={l.id} className={cn('flex gap-3 py-0.5 text-readout', l.pending && 'opacity-60')}>
          <span className="shrink-0 text-text-3">{formatClock(l.tMs)}</span>
          <span className={cn('min-w-0 break-words', STATUS_CLASS[l.status ?? 'info'])}>
            {l.text}
            {l.pending && <span className="text-text-3"> · QUEUED</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
