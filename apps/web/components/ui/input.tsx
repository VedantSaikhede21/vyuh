import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-sm border border-line-2 bg-bg-3 px-3 text-readout text-text-1 placeholder:text-text-2 focus-visible:border-select disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
