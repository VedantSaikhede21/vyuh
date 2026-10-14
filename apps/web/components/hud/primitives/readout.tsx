'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A HUD value (DESIGN §4/§8): Plex Mono tabular value, unit in --text-3, label
 * above in the Label role. A meaningful change flashes --bg-3 for 300 ms
 * (DESIGN §7); pass `flash={false}` for values that tick continuously (clocks).
 */
export function Readout({
  label,
  value,
  unit,
  size = 'md',
  flash = true,
  muted = false,
  className,
}: {
  label?: ReactNode;
  value: ReactNode;
  unit?: string | undefined;
  size?: 'md' | 'lg';
  flash?: boolean;
  /** No data yet / not applicable: value in --text-3. */
  muted?: boolean;
  className?: string;
}) {
  const [flashKey, setFlashKey] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (flash && prev.current !== value) setFlashKey((k) => k + 1);
    prev.current = value;
  }, [value, flash]);

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {label !== undefined && <span className="text-label">{label}</span>}
      <span
        key={flashKey}
        className={cn(
          'whitespace-nowrap',
          size === 'lg' ? 'text-readout-lg' : 'text-readout',
          muted ? 'text-text-3' : 'text-text-1',
          flashKey > 0 && 'animate-value-flash',
        )}
      >
        {value}
        {unit && <span className="ml-1 text-text-3">{unit}</span>}
      </span>
    </div>
  );
}
