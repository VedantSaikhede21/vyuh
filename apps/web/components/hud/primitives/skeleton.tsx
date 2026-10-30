import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Labelled loading state (DESIGN §9): never a bare spinner. `progress` 0..1
 * shows a percentage and bar; null = indeterminate (label only).
 */
export function Skeleton({
  label,
  progress = null,
  className,
}: {
  /** e.g. "LOADING TERRAIN · JK_MOUNTAIN" */
  label: string;
  progress?: number | null;
  className?: string;
}) {
  const pct = progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(pct !== null ? { 'aria-valuenow': pct } : {})}
      className={cn('flex flex-col gap-2 p-3', className)}
    >
      <span className="text-label">
        {label}
        {pct !== null && <span className="tnum"> · {pct}%</span>}
      </span>
      <div className="h-0.5 w-full max-w-80 bg-line-1">
        {/* Determinate: scaleX, not width, so the fill stays on the compositor (§7 progress). */}
        <div
          className={cn(
            'h-full bg-data hud:bg-text-2',
            pct === null
              ? 'w-1/4 motion-safe:animate-pulse'
              : 'w-full origin-left transition-transform duration-150 ease-ui',
          )}
          style={pct !== null ? { transform: `scaleX(${pct / 100})` } : undefined}
        />
      </div>
    </div>
  );
}

/**
 * Worded empty or error state (DESIGN §9): what will appear / what went wrong,
 * and the next step.
 */
export function StatusNotice({
  tone = 'empty',
  title,
  children,
  onRetry,
  action,
  className,
}: {
  tone?: 'empty' | 'error';
  title: string;
  children?: ReactNode;
  onRetry?: (() => void) | undefined;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn('flex flex-col items-start gap-2 p-3', className)}
    >
      <p className={cn('text-body', tone === 'error' ? 'text-crit' : 'text-text-1')}>{title}</p>
      {children && <div className="text-small text-text-2">{children}</div>}
      {(onRetry || action) && (
        <div className="flex gap-2">
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
