import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm border text-readout font-semibold uppercase tracking-wider transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-select bg-primary-bg text-primary-fg hover:bg-primary-bg/85',
        outline: 'border-line-1 bg-transparent text-text-1 hover:border-select hover:text-text-1',
        ghost: 'border-transparent bg-transparent text-text-2 hover:text-text-1',
        destructive: 'border-crit bg-crit text-bg-0 hover:bg-crit/85',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-small',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
