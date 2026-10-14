/**
 * Effector cooldown as a ring: the --warn arc is the time still to wait
 * (1 = just fired, 0 = ready). Decorative — the remaining seconds are always
 * given in text next to it or in the control's tooltip.
 */
export function CooldownRing({ remaining, size = 16 }: { remaining: number; size?: number }) {
  const f = Math.min(1, Math.max(0, remaining));
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <circle cx={8} cy={8} r={r} fill="none" stroke="var(--line-2)" strokeWidth={2} />
      {f > 0 && (
        <circle
          cx={8}
          cy={8}
          r={r}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={2}
          strokeDasharray={`${f * c} ${c}`}
          transform="rotate(-90 8 8)"
        />
      )}
    </svg>
  );
}
