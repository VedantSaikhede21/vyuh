import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Shared field styling (input, select): DESIGN §3.1 --bg-3 input surface, 36 px. */
export const FIELD_CLASS =
  'h-9 w-full rounded-sm border border-line-2 bg-bg-3 px-3 text-body text-text-1 transition-colors duration-150 ease-ui placeholder:text-text-2 hover:border-text-3 disabled:cursor-not-allowed disabled:opacity-40 aria-[invalid=true]:border-crit';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(FIELD_CLASS, className)} {...props} />;
}
