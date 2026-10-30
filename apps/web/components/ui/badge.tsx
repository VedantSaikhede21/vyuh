import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Static label with a tone. Status tones only; affiliation is shown with
// AffiliationSymbol (shape + letter), never as a coloured badge.
const badgeVariants = cva(
  'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-label leading-none hud:h-5 hud:rounded-sm hud:px-1.5',
  {
    variants: {
      tone: {
        default: 'border-line-2 text-text-2',
        strong: 'border-text-3 text-text-1',
        ok: 'border-ok text-ok',
        warn: 'border-warn text-warn',
        crit: 'border-crit text-crit',
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
