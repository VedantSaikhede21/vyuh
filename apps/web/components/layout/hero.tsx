import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { renderFor } from '@/lib/renders';

/**
 * Full-bleed terrain band for Hero pages (DESIGN §5). Breaks out of the page
 * container; text sits on `--scrim` or a card, never on raw imagery. A missing
 * picture leaves the plain ground colour, and the text still reads.
 */
export function HeroBand({
  code,
  preset,
  className,
  children,
  'data-testid': testId,
}: {
  /** Library scenario code, e.g. S05. */
  code?: string | null | undefined;
  /** Terrain preset: the fallback picture for generated scenarios. */
  preset?: string | null | undefined;
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}) {
  const src = renderFor(code, preset);
  return (
    <section
      data-testid={testId}
      className={cn(
        'relative left-1/2 -mt-6 ml-[-50vw] w-screen overflow-hidden bg-bg-1 print:hidden',
        className,
      )}
    >
      <img
        src={src.w1920}
        srcSet={`${src.w640} 640w, ${src.w1920} 1920w`}
        sizes="100vw"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-scrim-1" />
      <div className="relative mx-auto flex h-full w-full max-w-[1280px] flex-col justify-end px-6 pb-8 pt-16 min-[1600px]:max-w-[1440px] min-[1600px]:px-12">
        {children}
      </div>
    </section>
  );
}

export interface FactItem {
  label: string;
  value: ReactNode;
  unit?: string;
  /** No data yet: the value reads as a dash, not a number. */
  muted?: boolean;
}

/** Key figures as large type, not boxes (DESIGN §4, §5). */
export function FactRow({ facts, className }: { facts: readonly FactItem[]; className?: string }) {
  return (
    <dl
      className={cn('grid gap-x-8 gap-y-4', className)}
      style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}
    >
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dd className={cn('text-figure-l', f.muted ? 'text-text-2' : 'text-text-1')}>
            {f.value}
            {f.unit && <span className="ml-1 text-h3 font-normal text-text-2">{f.unit}</span>}
          </dd>
          <dt className="mt-1 truncate text-label">{f.label}</dt>
        </div>
      ))}
    </dl>
  );
}
