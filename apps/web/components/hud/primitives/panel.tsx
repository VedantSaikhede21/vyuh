import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// DESIGN §5 panel anatomy: 28 px --bg-2 header strip with a Condensed UPPER
// title and an optional status/actions slot, --bg-1 body, 1 px --line-1 border.

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('flex min-h-0 flex-col border border-line-1 bg-bg-1', className)}
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
        'flex h-7 shrink-0 items-center gap-2 border-b border-line-1 bg-bg-2 px-3',
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
  return <div className={cn('min-h-0 flex-1', !flush && 'p-3', className)} {...props} />;
}
