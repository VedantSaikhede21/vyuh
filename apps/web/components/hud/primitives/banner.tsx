import { OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Single-line alert (DESIGN §9/§11.5): leak imminent (crit), friendly in jam
 * sector or connection lost (warn). Never a modal; never more than one line.
 */
export function Banner({
  tone,
  children,
  className,
}: {
  tone: 'warn' | 'crit';
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === 'crit' ? OctagonAlert : TriangleAlert;
  return (
    <div
      role={tone === 'crit' ? 'alert' : 'status'}
      className={cn(
        'flex h-7 min-w-0 items-center gap-2 border border-l-2 bg-bg-2 px-2 text-body',
        tone === 'crit' ? 'border-crit text-crit' : 'border-warn text-warn',
        className,
      )}
    >
      <Icon aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
