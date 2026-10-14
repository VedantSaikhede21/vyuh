import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A keyboard key hint (DESIGN §10: tooltips and buttons show their shortcut). */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-xs border border-line-2 px-1 font-mono text-[11px] leading-none text-text-2',
        className,
      )}
      {...props}
    />
  );
}
