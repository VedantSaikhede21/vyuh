import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  /** Omit on the current page (the last crumb). */
  href?: string;
}

/** Breadcrumbs for deep pages, set in the page header's reference line (DESIGN §11.0). */
export function Breadcrumbs({ items, className }: { items: readonly Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex min-w-0 flex-wrap items-center text-small text-text-2">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center">
              {i > 0 && (
                <span aria-hidden className="px-1.5">
                  /
                </span>
              )}
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="underline decoration-line-2 underline-offset-2 transition-colors duration-150 ease-ui hover:text-text-1 hover:decoration-text-2"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="truncate text-text-1">
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface Fact {
  label: string;
  value: ReactNode;
  unit?: string;
  /** No data yet: the value reads as a dash-weight, not a number. */
  muted?: boolean;
}

/**
 * Key facts as a ruled strip of label / value cells (DESIGN §5 ruled grids):
 * 1 px rules come from the gap over --line-1, so they never double up.
 */
export function FactStrip({ facts, className }: { facts: readonly Fact[]; className?: string }) {
  return (
    <dl className={cn('grid auto-cols-fr grid-flow-col gap-2', className)}>
      {facts.map((f) => (
        <div key={f.label} className="flex min-w-0 flex-col gap-1 rounded-md bg-bg-1 px-4 py-2.5">
          <dt className="text-label truncate">{f.label}</dt>
          <dd
            className={cn(
              'text-readout whitespace-nowrap',
              f.muted ? 'text-text-2' : 'text-text-1',
            )}
          >
            {f.value}
            {f.unit && <span className="ml-1 text-text-2">{f.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Every signed-in page starts with this (DESIGN §5 page header): mono
 * reference line (or breadcrumbs) → H1 → one context line on the left; key
 * facts and the page's actions on the right.
 */
export function PageHeader({
  reference,
  crumbs,
  title,
  context,
  facts,
  actions,
  className,
}: {
  /** Mono reference line, e.g. "TRAINING · 14 SCENARIOS". Ignored when crumbs are given. */
  reference?: ReactNode;
  crumbs?: readonly Crumb[];
  title: ReactNode;
  context?: ReactNode;
  facts?: readonly Fact[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn('grid items-end gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto]', className)}
    >
      <div className="min-w-0 space-y-1">
        {crumbs ? (
          <Breadcrumbs items={crumbs} />
        ) : (
          reference && <p className="text-small text-text-2">{reference}</p>
        )}
        <h1 className="text-h1 text-text-1">{title}</h1>
        {context && <p className="max-w-prose-ui text-body text-text-body">{context}</p>}
      </div>
      {(facts || actions) && (
        <div className="flex flex-wrap items-end gap-3">
          {facts && facts.length > 0 && <FactStrip facts={facts} />}
          {actions}
        </div>
      )}
    </header>
  );
}
