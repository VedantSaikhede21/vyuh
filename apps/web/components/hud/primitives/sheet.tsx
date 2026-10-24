import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const two = (n: number) => String(n).padStart(2, '0');

/**
 * Sheet framing (DESIGN §5 layout devices): a section of a briefing pack — a
 * 1 px rule across the container, a mono reference line with the sheet number
 * on the right, then the content. Landing, briefing and service record only;
 * never inside the HUD.
 */
export function SheetFrame({
  sheet,
  of,
  reference,
  title,
  children,
  className,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & {
  sheet: number;
  of: number;
  /** Left side of the reference line, e.g. "PS 26247 · MOD · DSSC". */
  reference?: ReactNode;
  /** Section heading (H2), under the reference line. */
  title?: ReactNode;
}) {
  return (
    <section className={cn('border-t border-line-1 pt-3', className)} {...props}>
      <div className="flex items-baseline justify-between gap-4 text-meta">
        <span className="min-w-0 truncate">{reference}</span>
        <span className="shrink-0">
          SHEET <span className="text-text-1">{two(sheet)}</span> / {two(of)}
        </span>
      </div>
      {title && <h2 className="mt-2 text-h2 uppercase text-text-1">{title}</h2>}
      <div className={cn(title ? 'mt-4' : 'mt-3')}>{children}</div>
    </section>
  );
}

export interface TelemetryItem {
  /** Short key, e.g. "PRESET", "SUN". Optional for self-describing values. */
  label?: string;
  value: ReactNode;
}

/**
 * Telemetry strip (DESIGN §5): one thin row of mono facts above or below a key
 * visual, items split by 1 px rules. Facts only — never invented values.
 */
export function TelemetryStrip({
  items,
  className,
  'aria-label': ariaLabel,
}: {
  items: readonly TelemetryItem[];
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <dl
      aria-label={ariaLabel}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-y-1 border-y border-line-1 py-1 text-meta',
        className,
      )}
    >
      {items.map((it, i) => (
        <div
          key={i}
          className="flex min-w-0 items-baseline gap-1.5 border-l border-line-1 px-3 first:border-l-0 first:pl-0"
        >
          {it.label && <dt>{it.label}</dt>}
          <dd className="truncate text-text-1">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
