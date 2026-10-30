'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Modal dialog on the native <dialog> element: focus is trapped and Escape
 * closes it for free; a click on the backdrop closes too. Only for irreversible
 * or high-cost confirmations and reference sheets — never in the HUD, where an
 * inline confirm is used (DESIGN §9).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Actions, right-aligned: secondary first, the primary last. */
  footer?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'm-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-(--edge-overlay) bg-bg-2 p-0 text-text-1 shadow-overlay backdrop:bg-bg-0/80',
        // Opens centred in 180 ms (a modal is not anchored to its trigger); closes at once (§7).
        'open:animate-pop-in-slow backdrop:animate-fade-in-slow',
        className,
      )}
    >
      <div className="flex h-12 items-center gap-2 border-b border-line-1 pl-5 pr-2 hud:h-9 hud:bg-bg-2 hud:pl-4 hud:pr-1">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-panel-title">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-text-2 transition-colors duration-150 ease-ui hover:bg-bg-3 hover:text-text-1"
        >
          <X aria-hidden size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4 text-body">{children}</div>
      {footer && (
        <div className="flex justify-end gap-2 border-t border-line-1 px-4 py-3">{footer}</div>
      )}
    </dialog>
  );
}
