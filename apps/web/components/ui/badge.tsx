import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-readout font-semibold uppercase tracking-wider',
  {
    variants: {
      tone: {
        default: 'border-line-1 text-text-2',
        primary: 'border-select text-text-1',
        hostile: 'border-aff-hostile text-aff-hostile',
        friendly: 'border-aff-friendly text-aff-friendly',
        neutral: 'border-ok text-ok',
        unknown: 'border-aff-unknown text-aff-unknown',
      },
    },
    defaultVariants: { tone: 'default' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
