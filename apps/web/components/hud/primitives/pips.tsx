import { cn } from '@/lib/utils';

/** Difficulty as a segmented bar (DESIGN §11.3), with a text alternative. */
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
      className={cn('inline-flex items-center gap-[3px]', className)}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-3.5 rounded-xs hud:h-2 hud:w-2',
            i < value ? 'bg-text-1' : 'bg-bg-4',
          )}
        />
      ))}
    </span>
  );
}
