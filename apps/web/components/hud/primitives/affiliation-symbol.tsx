import type { Affiliation } from '@vyuh/shared';
import { AFFILIATION_STYLE, affiliationOutline } from '@/lib/affiliation';
import { cn } from '@/lib/utils';

/**
 * Simplified APP-6 frame + letter (DESIGN §6): shape, letter and colour together,
 * so affiliation reads without colour. Filled once the trainee marks the track
 * detected. The same outline feeds the PPI and 3D markers.
 */
export function AffiliationSymbol({
  affiliation,
  filled = false,
  size = 16,
  className,
}: {
  affiliation: Affiliation;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  const style = AFFILIATION_STYLE[affiliation];
  const points = affiliationOutline(affiliation)
    .map(([x, y]) => `${(x * 10).toFixed(2)},${(-y * 10).toFixed(2)}`)
    .join(' ');
  return (
    <svg
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      role="img"
      aria-label={style.label}
      className={cn('inline-block shrink-0 align-middle', style.textClass, className)}
    >
      <polygon
        points={points}
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.3 : 0}
        stroke="currentColor"
        strokeWidth={1.75}
      />
      <text
        x={0}
        y={4}
        textAnchor="middle"
        fontSize={11}
        fontWeight={500}
        fill="currentColor"
        className="font-mono"
      >
        {style.letter}
      </text>
    </svg>
  );
}
