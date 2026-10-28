import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-core';
import { errorCopy } from '@/lib/strings';
import { cn } from '@/lib/utils';

/**
 * Empty state (DESIGN §9): what will appear here and how to get there, with at
 * most one next step.
 */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-2 p-3', className)} data-testid="empty-state">
      <p className="text-body text-text-1">{title}</p>
      {children && <div className="max-w-prose-ui text-small text-text-2">{children}</div>}
      {action}
    </div>
  );
}

/**
 * Error state (DESIGN §8–§9): cause and next step in plain words. Pass the
 * caught `error` to word it from the API code (audit P1-8), or `title` /
 * `children` to word it yourself. A not-found or permission notice is neutral;
 * only failures that need attention use --crit.
 */
export function ErrorState({
  error,
  subject,
  title,
  children,
  tone,
  onRetry,
  action,
  className,
}: {
  error?: unknown;
  /** Overrides the tone the error code implies (a 404 page has no API error). */
  tone?: 'neutral' | 'error';
  /** What was being loaded: "scenario", "session". */
  subject?: string;
  title?: string;
  children?: ReactNode;
  onRetry?: (() => void) | undefined;
  action?: ReactNode;
  className?: string;
}) {
  const copy = errorCopy(error instanceof ApiError ? error.code : undefined, subject);
  const crit = (tone ?? copy.tone) === 'error';
  return (
    <div
      role={crit ? 'alert' : 'status'}
      data-testid="error-state"
      className={cn(
        'flex flex-col items-start gap-2 border-l-2 p-3',
        crit ? 'border-l-crit' : 'border-l-line-2',
        className,
      )}
    >
      <p className={cn('text-body', crit ? 'text-crit' : 'text-text-1')}>{title ?? copy.title}</p>
      <div className="max-w-prose-ui text-small text-text-2">{children ?? copy.detail}</div>
      {((onRetry && copy.retry) || action) && (
        <div className="flex flex-wrap gap-2">
          {onRetry && copy.retry && (
            <Button size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * Below 1280 px the player, AAR replay and builder show this instead of a
 * squeezed console (DESIGN §5): wordmark, the reason, and a way back.
 */
export function LargerScreenNotice({
  what,
  note,
  backHref = '/train',
  backLabel = 'Back to training',
  className,
}: {
  /** "The sim player", "The after-action replay", "The scenario builder". */
  what: string;
  /** One more sentence, e.g. "The session keeps running." */
  note?: string;
  /** null: no way back offered (a running session must not be left by accident). */
  backHref?: string | null;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div
      data-testid="larger-screen-notice"
      className={cn(
        'fixed inset-0 z-50 flex items-center bg-bg-0 px-6 min-[1280px]:hidden',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-md space-y-3 border-t border-line-1 pt-3">
        <p className="text-meta">VYUH · Desktop trainer</p>
        <h1 className="text-h1">Use a larger screen</h1>
        <p className="text-body text-text-body">
          {what} needs a window at least 1280 px wide. Enlarge the window, or open this page on a
          desktop or laptop.{note ? ` ${note}` : ''}
        </p>
        {backHref && (
          <Button asChild variant="secondary" size="md">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Labelled skeleton rows for a table or list that is loading (DESIGN §9: never a bare spinner). */
export function SkeletonRows({
  label,
  rows = 4,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} className={cn('flex flex-col', className)}>
      <span className="text-label px-2 py-2">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-8 items-center gap-3 border-t border-line-1 px-2">
          <span className="h-2 w-16 bg-bg-3" />
          <span className="h-2 flex-1 bg-bg-2" style={{ maxWidth: `${60 - i * 8}%` }} />
        </div>
      ))}
    </div>
  );
}
