'use client';

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Kbd } from '@/components/hud/primitives/kbd';
import { cn } from '@/lib/utils';

const OPEN_DELAY_MS = 300;
/** Moving from one control to the next while a tooltip was just open: no delay. */
const FOLLOW_ON_MS = 500;
let lastClosedAt = -Infinity;

const SIDE = { top: 'bottom-full mb-1', bottom: 'top-full mt-1' } as const;
const ALIGN = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
} as const;

export interface TooltipProps {
  /** Tooltip text: what the control does, or why it is disabled. */
  content: ReactNode;
  /** Keyboard shortcut shown after the text ("Jam · J"). */
  shortcut?: string | undefined;
  side?: keyof typeof SIDE;
  align?: keyof typeof ALIGN;
  /** Keep open (design gallery / screenshots). */
  forceOpen?: boolean;
  className?: string;
  children: ReactElement<{ disabled?: boolean; 'aria-describedby'?: string }>;
}

/**
 * In-house tooltip (decision 61): opens on hover and keyboard focus, closes on
 * leave, blur or Escape, and is linked with aria-describedby. A disabled child
 * cannot be hovered or focused, so the wrapper takes both and carries the
 * description instead — the disabled reason stays reachable (DESIGN §9).
 */
export function Tooltip({
  content,
  shortcut,
  side = 'top',
  align = 'center',
  forceOpen = false,
  className,
  children,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  /** Fade in only after the hover delay; focus and follow-on opens are instant (§7). */
  const [fade, setFade] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabled = isValidElement(children) && Boolean(children.props.disabled);

  useEffect(() => () => clear(), []);
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  const show = (immediate: boolean) => {
    clear();
    if (immediate || performance.now() - lastClosedAt < FOLLOW_ON_MS) {
      setFade(false);
      setOpen(true);
    } else
      timer.current = setTimeout(() => {
        setFade(true);
        setOpen(true);
      }, OPEN_DELAY_MS);
  };
  const hide = () => {
    clear();
    setOpen((was) => {
      if (was) lastClosedAt = performance.now();
      return false;
    });
  };

  const child = disabled ? children : cloneElement(children, { 'aria-describedby': id });
  const visible = forceOpen || open;
  return (
    <span
      className={cn('relative inline-flex [&>*:disabled]:pointer-events-none', className)}
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
      {...(disabled ? { tabIndex: 0, 'aria-describedby': id } : {})}
    >
      {child}
      <span
        id={id}
        role="tooltip"
        hidden={!visible}
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-64 rounded-md border border-(--edge-overlay) bg-bg-2 px-2.5 py-1.5 text-small normal-case tracking-normal text-text-1 shadow-overlay',
          fade && !forceOpen && 'animate-fade-in',
          SIDE[side],
          ALIGN[align],
        )}
      >
        {content}
        {shortcut && (
          <>
            <span className="text-text-2"> · </span>
            <Kbd>{shortcut}</Kbd>
          </>
        )}
      </span>
    </span>
  );
}
