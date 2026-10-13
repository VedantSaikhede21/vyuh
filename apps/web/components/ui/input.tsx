import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-input bg-muted px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
