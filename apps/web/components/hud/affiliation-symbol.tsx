import type { Affiliation } from '@vyuh/shared';
import { AFFILIATION_STYLE, affiliationOutline } from '@/lib/affiliation';

/** Simplified APP-6 frame with the affiliation letter; filled once marked detected. */
export function AffiliationSymbol({
  affiliation,
  filled = false,
  size = 18,
}: {
  affiliation: Affiliation;
  filled?: boolean;
  size?: number;
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
      className="inline-block align-middle"
    >
      <polygon
        points={points}
        fill={filled ? style.hex : 'none'}
        fillOpacity={filled ? 0.35 : 0}
        stroke={style.hex}
        strokeWidth={2}
      />
      <text
        x={0}
        y={4}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fontFamily="monospace"
        fill={style.hex}
      >
        {style.letter}
      </text>
    </svg>
  );
}
