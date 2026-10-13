import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider',
  {
    variants: {
      tone: {
        default: 'border-border text-muted-foreground',
        primary: 'border-primary text-primary',
        hostile: 'border-hostile text-hostile',
        friendly: 'border-friendly text-friendly',
        neutral: 'border-neutral text-neutral',
        unknown: 'border-unknown text-unknown',
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
