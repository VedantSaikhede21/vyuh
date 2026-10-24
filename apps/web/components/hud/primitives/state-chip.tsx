import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// A state readout, not a button: ROE, mode, EO MAN/CUE/ACQ/TRK. Pill shape is
// allowed only because it is ≤ 20 px tall (DESIGN §5).
const chipVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-label leading-none',
  {
    variants: {
      tone: {
        neutral: 'border-line-2 text-text-1',
        muted: 'border-line-1 text-text-2',
        active: 'border-select bg-bg-3 text-select',
        cue: 'border-cue text-cue',
        ok: 'border-ok text-ok',
        warn: 'border-warn text-warn',
        crit: 'border-crit text-crit',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function StateChip({
  className,
  tone,
  pulse = false,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof chipVariants> & { pulse?: boolean }) {
  return (
    <span
      className={cn(chipVariants({ tone }), pulse && 'motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}
