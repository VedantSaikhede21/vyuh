import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { FIELD_CLASS } from './input';

/** Native select (keyboard and screen-reader behaviour for free), restyled to the tokens. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(FIELD_CLASS, 'appearance-none pr-8', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={16}
        strokeWidth={1.5}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-2"
      />
    </div>
  );
}
