import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// DESIGN §5: a --bg-1 surface with a title row and an optional status/actions
// slot. In the HUD: 1 px border and a 28 px --bg-2 header strip.

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col rounded-md bg-bg-1 hud:rounded-none hud:border hud:border-line-1',
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  children,
  className,
  titleId,
}: {
  title: ReactNode;
  /** Right-hand slot: status chip, counts, actions. */
  children?: ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 rounded-t-md border-b border-line-1 px-4 hud:h-7 hud:rounded-none hud:bg-bg-2 hud:px-3',
        className,
      )}
    >
      <h2 id={titleId} className="min-w-0 flex-1 truncate text-panel-title text-text-1">
        {title}
      </h2>
      {children}
    </header>
  );
}

export function PanelBody({
  className,
  flush = false,
  ...props
}: ComponentProps<'div'> & { flush?: boolean }) {
  return <div className={cn('min-h-0 flex-1', !flush && 'p-4 hud:p-3', className)} {...props} />;
}
