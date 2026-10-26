'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Kbd } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import {
  TOURS,
  placeCard,
  saveTour,
  shouldOpen,
  useTourProgress,
  type Rect,
  type TourId,
} from '@/lib/tour';

const CARD_W = 300;

function measure(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * A guided tour (SPEC §20 step 2, Phase 6E, in-house): the explained region stays
 * clear with a --select ring, everything else is dimmed, and a step card sits
 * beside it, never over it. Enter or → next, ← back, Esc skips; progress is kept,
 * so a closed tour resumes where it stopped. `auto`: open by itself when never
 * seen (guests). `onOpenChange` lets the player hold its Practice clock.
 */
export function GuidedTour({
  id,
  auto,
  enabled = true,
  onOpenChange,
}: {
  id: TourId;
  auto: boolean;
  /** False until the page's regions exist (e.g. the player still loading). */
  enabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const steps = TOURS[id];
  const progress = useTourProgress();
  const record = progress[id];
  const wanted = enabled && shouldOpen(progress, id, auto);
  const [step, setStep] = useState(record?.step ?? 0);
  // Opening waits a moment for layout (fonts, panels) to settle.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, [wanted]);
  const open = wanted && ready;

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  const close = useCallback(
    (status: 'done' | 'skipped') => {
      saveTour(id, { step, status });
      setReady(false);
    },
    [id, step],
  );
  const go = useCallback(
    (to: number) => {
      if (to >= steps.length) return close('done');
      const s = Math.max(0, to);
      setStep(s);
      saveTour(id, { step: s, status: 'open' });
    },
    [close, id, steps.length],
  );

  // Target rectangle: on step change, resize, scroll, and when the target resizes.
  const current = steps[Math.min(step, steps.length - 1)]!;
  const [rect, setRect] = useState<Rect | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const el = document.querySelector(current.target);
    // Off screen on a long page: bring it into view at once (no smooth scroll, §7).
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight || r.top < 0) el.scrollIntoView({ block: 'center' });
    }
    const update = () => {
      setRect(measure(current.target));
      setView({ w: window.innerWidth, h: window.innerHeight });
    };
    update();
    const ro = el ? new ResizeObserver(update) : null;
    if (el) ro?.observe(el);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, current.target]);

  // Keys: the tour's own, and nothing reaches the page behind it.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const inCard = card.current?.contains(e.target as Node) ?? false;
      if (e.key === 'Tab') return;
      // A focused button in the card keeps Enter / Space for itself (Back, Skip).
      const onButton = inCard && (e.target as HTMLElement).tagName === 'BUTTON';
      if (onButton && (e.key === 'Enter' || e.key === ' ')) {
        e.stopImmediatePropagation();
        return;
      }
      e.stopImmediatePropagation();
      if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        go(step + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(step - 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close('skipped');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, step, go, close]);

  // Focus moves to the card and back to where it was when the tour closes.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    card.current?.querySelector<HTMLElement>('[data-tour-next]')?.focus();
    return () => before?.focus?.();
  }, [open]);

  const [cardH, setCardH] = useState(180);
  useLayoutEffect(() => {
    if (open && card.current) setCardH(card.current.offsetHeight);
  }, [open, step]);

  if (!open) return null;
  const pos = placeCard(rect, { w: CARD_W, h: cardH }, view);
  const pad = 4;
  const hole = rect && {
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
  const last = step === steps.length - 1;
  const scrim = 'fixed bg-bg-0/75';
  return (
    <div className="fixed inset-0 z-[60]" data-testid={`tour-${id}`}>
      {hole ? (
        <>
          <div
            className={scrim}
            style={{ left: 0, top: 0, right: 0, height: Math.max(0, hole.y) }}
          />
          <div className={scrim} style={{ left: 0, top: hole.y + hole.h, right: 0, bottom: 0 }} />
          <div
            className={scrim}
            style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }}
          />
          <div
            className={scrim}
            style={{ left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed rounded-sm border-2 border-select"
            style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
          />
        </>
      ) : (
        <div className={`${scrim} inset-0`} />
      )}
      <div
        ref={card}
        key={step}
        role="dialog"
        aria-labelledby={`tour-${id}-title`}
        aria-describedby={`tour-${id}-body`}
        className="fixed animate-fade-in rounded-md border border-line-2 bg-bg-2 shadow-overlay"
        style={{ left: pos.x, top: pos.y, width: CARD_W }}
        data-testid="tour-card"
        data-side={pos.side}
      >
        <div className="flex h-8 items-center justify-between border-b border-line-1 px-3">
          <span className="text-label text-text-2">
            Tour · <span className="font-mono tnum">{step + 1}</span> of{' '}
            <span className="font-mono tnum">{steps.length}</span>
          </span>
          <button
            type="button"
            onClick={() => close('skipped')}
            className="text-label text-text-2 hover:text-text-1 focus-visible:outline-2 focus-visible:outline-select"
            data-testid="tour-skip"
          >
            Skip tour <Kbd>Esc</Kbd>
          </button>
        </div>
        <div className="space-y-1.5 px-3 py-2.5">
          <h2 id={`tour-${id}-title`} className="text-panel-title text-text-1">
            {current.title}
          </h2>
          <p id={`tour-${id}-body`} className="text-small text-text-body">
            {current.body}
          </p>
          {!rect && <p className="text-small text-text-2">This part is not on screen right now.</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line-1 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={() => go(step - 1)}
            data-testid="tour-back"
          >
            Back
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => go(step + 1)}
            data-tour-next=""
            data-testid="tour-next"
          >
            {last ? 'Done' : 'Next'} <Kbd>Enter</Kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
