import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// A state readout, not a button: ROE, mode, EO MAN/CUE/ACQ/TRK. Chips are the
// one full-round shape (DESIGN §5): 24 px on pages, 20 px in the HUD.
const chipVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-label leading-none hud:h-5 hud:px-2',
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
      className={cn(chipVariants({ tone }), pulse && 'animate-acq-pulse', className)}
      {...props}
    />
  );
}
