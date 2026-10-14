import { cn } from '@/lib/utils';

/** Difficulty as filled squares (DESIGN §11.3), with a text alternative. */
export function Pips({
  value,
  max = 5,
  label = 'Difficulty',
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${label} ${value} of ${max}`}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2 w-2 rounded-xs border',
            i < value ? 'border-text-1 bg-text-1' : 'border-line-2',
          )}
        />
      ))}
    </span>
  );
}
