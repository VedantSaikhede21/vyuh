import type { ContactClass } from '@vyuh/shared';
import { CLASS_LABEL } from '@/lib/strings';
import { cn } from '@/lib/utils';

/**
 * Top-down silhouette of a contact class (UI-PREP §2: threat library, track
 * list info links, AAR). Five shape families; the drone families vary by rotor
 * count and size so a heavy quad does not read as a small one. Representative
 * outlines only — no real airframe is drawn. Colour comes from the caller
 * (currentColor); affiliation is never implied by a silhouette.
 */
type Shape = 'QUAD' | 'HEXA' | 'FPV' | 'FIXED_WING' | 'LOITERING' | 'BIRD' | 'HELICOPTER';

export const SILHOUETTE_FAMILY: Readonly<Record<ContactClass, Shape>> = {
  QUAD_SMALL: 'QUAD',
  QUAD_HEAVY: 'HEXA',
  FPV: 'FPV',
  FIXED_WING_SMALL: 'FIXED_WING',
  LOITERING_GENERIC: 'LOITERING',
  BIRD_SMALL: 'BIRD',
  BIRD_LARGE: 'BIRD',
  FRIENDLY_QUAD: 'QUAD',
  CIVILIAN_HOBBY: 'QUAD',
  HELICOPTER_FRIENDLY: 'HELICOPTER',
};

const FILL = { fill: 'currentColor', fillOpacity: 0.15 } as const;

function rotors(n: number, r: number, rotor: number, start: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((start + (360 / n) * i) * Math.PI) / 180;
    const x = 24 + r * Math.cos(a);
    const y = 24 + r * Math.sin(a);
    return (
      <g key={i}>
        <line x1={24} y1={24} x2={x} y2={y} />
        <circle cx={x} cy={y} r={rotor} {...FILL} />
      </g>
    );
  });
}

function Body({ shape }: { shape: Shape }) {
  switch (shape) {
    case 'QUAD':
      return (
        <>
          {rotors(4, 14, 6.5, 45)}
          <rect x={19} y={19} width={10} height={10} rx={1} {...FILL} />
        </>
      );
    case 'HEXA':
      return (
        <>
          {rotors(6, 16, 5.5, 30)}
          <circle cx={24} cy={24} r={6} {...FILL} />
        </>
      );
    case 'FPV':
      return (
        <>
          {rotors(4, 11, 5, 45)}
          <rect x={20.5} y={17} width={7} height={14} rx={1} {...FILL} />
          <path d="M21.5 17 L24 12 L26.5 17" />
        </>
      );
    case 'FIXED_WING':
      return (
        <>
          <path d="M24 5 L24 41" />
          <path d="M4 22 L44 22 L44 26 L27 27 L21 27 L4 26 Z" {...FILL} />
          <path d="M16 38 L32 38 L32 41 L16 41 Z" {...FILL} />
          <path d="M22 5 Q24 3 26 5 L26 36 L22 36 Z" {...FILL} />
        </>
      );
    case 'LOITERING':
      return (
        <>
          <path d="M24 4 L43 38 L24 32 L5 38 Z" {...FILL} />
          <path d="M24 4 L24 42" />
          <path d="M20 42 L28 42" />
        </>
      );
    case 'BIRD':
      return (
        <>
          <path d="M3 26 C10 16 17 17 24 24 C31 17 38 16 45 26" />
          <ellipse cx={24} cy={26} rx={2.5} ry={6} {...FILL} />
          <path d="M22 31.5 L24 36 L26 31.5" />
        </>
      );
    case 'HELICOPTER':
      return (
        <>
          <path d="M6 8 L42 32 M42 8 L6 32" />
          <ellipse cx={24} cy={20} rx={5.5} ry={9} {...FILL} />
          <path d="M24 29 L24 44 M19.5 44 L28.5 44" />
        </>
      );
  }
}

export function ClassSilhouette({
  cls,
  size = 32,
  className,
}: {
  cls: ContactClass;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${CLASS_LABEL[cls]} silhouette`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('inline-block shrink-0', className)}
    >
      <Body shape={SILHOUETTE_FAMILY[cls]} />
    </svg>
  );
}
