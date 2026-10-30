import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// DESIGN §5/§9/§12: filled surfaces, radius from the scale (2 px in the HUD).
// Sizes: hud 28 px and sm 32 px for dense places, md 36 px, lg 40 px for the one
// primary action. Pressed = 1 px downward offset. Disabled never uses opacity: every
// variant falls back to the same bg-1 / line-1 / text-2 look (DESIGN §9), so a
// disabled danger control is not drawn in --crit (audit P1-4) and a disabled
// primary is not a muddy bone block (P1-10). `loading` sets aria-busy and blocks
// clicks; the caller's label says what is happening ("Starting…").
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent text-panel-title',
    'transition-[background-color,border-color,color,transform] duration-150 ease-ui',
    'enabled:active:translate-y-px aria-busy:cursor-progress',
    'disabled:cursor-not-allowed disabled:border-line-1 disabled:bg-bg-1 disabled:text-text-2',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary-bg text-primary-fg hover:bg-primary-hover active:bg-primary-pressed',
        secondary:
          'bg-bg-3 text-text-1 hover:bg-bg-4 hud:border-line-2 hud:bg-bg-2 hud:hover:border-text-2 hud:hover:bg-bg-3',
        ghost: 'bg-transparent text-text-2 hover:bg-bg-2 hover:text-text-1',
        danger: 'border-crit bg-transparent text-crit hover:bg-bg-3',
      },
      size: {
        hud: 'h-7 px-2',
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-10 px-5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...(loading ? { 'aria-busy': true } : {})}
      {...props}
    />
  );
}

export { buttonVariants };
