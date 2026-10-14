import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// DESIGN §2/§5/§12: flat, 1 px border, radius 2 px, Condensed UPPER label.
// Sizes: hud 28 px and sm 32 px for the dense HUD, md 36 px for primary actions
// elsewhere. Danger is outlined: --crit is reserved for genuinely critical moments.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border text-panel-title transition-colors duration-150 ease-ui disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      variant: {
        primary:
          'border-primary-bg bg-primary-bg text-primary-fg hover:bg-select hover:border-select',
        secondary: 'border-line-2 bg-bg-2 text-text-1 hover:border-text-3 hover:bg-bg-3',
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
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
