import { cn } from '@/lib/utils';

/** Stable hue for a person: anyone listed together differs by id, not by name. */
export function avatarHue(id: string): number {
  let h = 0;
  for (const ch of id) h = (Math.imul(h, 31) + ch.codePointAt(0)!) >>> 0;
  return h % 360;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]!;
  const last = words.length > 1 ? words[words.length - 1]! : '';
  return `${[...first][0] ?? ''}${[...last][0] ?? ''}`.toUpperCase();
}

/** Initials on a pale tint. Decorative: the name is always beside it or in a label. */
export function Avatar({ name, id, className }: { name: string; id: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] leading-none font-semibold text-primary-fg',
        className,
      )}
      style={{ background: `hsl(${avatarHue(id)} 32% 78%)` }}
    >
      {initials(name)}
    </span>
  );
}
