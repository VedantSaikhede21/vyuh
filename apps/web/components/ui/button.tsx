import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// DESIGN §2/§5/§9/§12: flat, 1 px border, radius 2 px, Condensed UPPER label.
// Sizes: hud 28 px and sm 32 px for the dense HUD, md 36 px for primary actions
// elsewhere. Pressed = 1 px downward offset. Disabled never uses opacity: every
// variant falls back to the same bg-1 / line-1 / text-2 look (DESIGN §9), so a
// disabled danger control is not drawn in --crit (audit P1-4) and a disabled
// primary is not a muddy bone block (P1-10). `loading` sets aria-busy and blocks
// clicks; the caller's label says what is happening ("Starting…").
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border text-panel-title',
    'transition-[background-color,border-color,color,transform] duration-150 ease-ui',
    'enabled:active:translate-y-px aria-busy:cursor-progress',
    'disabled:cursor-not-allowed disabled:border-line-1 disabled:bg-bg-1 disabled:text-text-2',
  ],
  {
    variants: {
      variant: {
        primary:
          'border-primary-bg bg-primary-bg text-primary-fg hover:border-select hover:bg-select',
        secondary: 'border-line-2 bg-bg-2 text-text-1 hover:border-text-2 hover:bg-bg-3',
        ghost: 'border-transparent bg-transparent text-text-2 hover:bg-bg-2 hover:text-text-1',
        danger: 'border-crit bg-transparent text-crit hover:bg-bg-3',
      },
      size: {
        hud: 'h-7 px-2',
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
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
