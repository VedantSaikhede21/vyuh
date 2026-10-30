import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Data tables (DESIGN §5, §11.3): --bg-2 header, 1 px row rules, row hover --bg-2,
// selected row --bg-3 with a 2 px left edge (--data, --select in the HUD). 44 px
// rows on pages, 32 px in the HUD.

export const TH_CLASS =
  'h-9 bg-bg-2 px-3 text-left text-label font-medium whitespace-nowrap hud:h-7 hud:px-2';
export const TD_CLASS = 'h-11 px-3 whitespace-nowrap hud:h-8 hud:px-2';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse', className)} {...props} />;
}

export type SortDir = 'asc' | 'desc';

/**
 * Header cell. With `onSort` it becomes a sort button and carries `aria-sort`;
 * `sorted` is this column's current direction (undefined = not the sort column).
 */
export function Th({
  className,
  children,
  onSort,
  sorted,
  align = 'left',
  ...props
}: Omit<ComponentProps<'th'>, 'align'> & {
  onSort?: () => void;
  sorted?: SortDir | undefined;
  align?: 'left' | 'right';
}) {
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={
        onSort
          ? sorted === 'asc'
            ? 'ascending'
            : sorted === 'desc'
              ? 'descending'
              : 'none'
          : undefined
      }
      className={cn(TH_CLASS, align === 'right' && 'text-right', className)}
      {...props}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'inline-flex h-full items-center gap-1 transition-colors hud:uppercase duration-150 ease-ui hover:text-text-1 focus-visible:outline-offset-0',
            align === 'right' && 'flex-row-reverse',
            sorted ? 'text-text-1' : 'text-text-2',
          )}
        >
          {children}
          <Icon aria-hidden size={12} strokeWidth={1.5} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({
  className,
  align = 'left',
  ...props
}: Omit<ComponentProps<'td'>, 'align'> & { align?: 'left' | 'right' }) {
  return <td className={cn(TD_CLASS, align === 'right' && 'text-right', className)} {...props} />;
}

/** Body row. `interactive` adds hover and a focus ring; `selected` the --select edge. */
export function Tr({
  className,
  interactive = false,
  selected = false,
  ...props
}: ComponentProps<'tr'> & { interactive?: boolean; selected?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        'border-t border-line-1',
        interactive &&
          'cursor-pointer transition-colors duration-150 ease-ui hover:bg-bg-2 focus-visible:bg-bg-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus)',
        // A 2 px left rule on every interactive row keeps columns still when selection moves.
        interactive && '[&>:first-child]:border-l-2 [&>:first-child]:border-l-transparent',
        selected &&
          'bg-bg-3 hover:bg-bg-3 [&>:first-child]:border-l-data hud:[&>:first-child]:border-l-select',
        className,
      )}
      {...props}
    />
  );
}

/** A full-width row for an empty or loading table body. */
export function TableNotice({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr className="border-t border-line-1">
      <td colSpan={colSpan} className="px-2 py-3 text-small text-text-2">
        {children}
      </td>
    </tr>
  );
}
