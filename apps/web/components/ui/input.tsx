import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared field styling (input, select): DESIGN §3.1 --bg-3 input surface, 36 px.
 * Disabled is a flat bg-1 field with a text-2 value (no opacity, DESIGN §9);
 * aria-invalid draws the --crit border, with a FieldError under the field.
 */
export const FIELD_CLASS =
  'h-9 w-full rounded-sm border border-line-2 bg-bg-3 px-3 text-body text-text-1 transition-[border-color,background-color] duration-150 ease-ui placeholder:text-text-2 hover:border-text-2 disabled:cursor-not-allowed disabled:border-line-1 disabled:bg-bg-1 disabled:text-text-2 aria-[invalid=true]:border-crit';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(FIELD_CLASS, className)} {...props} />;
}

/**
 * Inline field error (DESIGN §9): cause and fix, right under the field. Give
 * the field `aria-invalid` and `aria-describedby={id}`.
 */
export function FieldError({ id, children, className }: ComponentProps<'p'> & { id: string }) {
  if (!children) return null;
  return (
    <p id={id} className={cn('text-small text-crit', className)}>
      {children}
    </p>
  );
}
