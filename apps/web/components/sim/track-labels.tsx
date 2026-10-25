'use client';

import { useFrame } from '@react-three/fiber';
import { toThree } from '@vyuh/sim-core';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { AiLabelLine } from '@/components/hud/ai-chip';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import { clampLabel } from '@/lib/sim/framing';
import { useHudStore, type TrackView } from '@/lib/sim/store';
import { cn } from '@/lib/utils';
import { useSimRuntime } from './sim-context';

/** Height of the label anchor above the track (three marker heights, as before). */
const LABEL_LIFT_M = 66;

/**
 * Screen position of each labelled track in normalised device coordinates,
 * written every frame by the 3D scene and read by the DOM labels. Track labels
 * are plain DOM in the main React tree like the zone labels (decision 84), not
 * drei <Html>: per-label React roots logged "synchronously unmount a root" in
 * dev, and a label near the view's edge was clipped (audit P0-6). Here each
 * label is clamped inside the view.
 */
export const trackLabelNdc = new Map<string, { x: number; y: number; on: boolean }>();

/** Only the selected and marked tracks carry a label (each costs layout with bird flocks). */
const labelled = (t: TrackView, selectedId: string | null) =>
  t.status === 'ACTIVE' && (t.id === selectedId || t.markedDetected);

/** In the tactical scene: projects the labelled tracks once a frame. */
export function TrackLabelAnchors() {
  const rt = useSimRuntime();
  const v = useRef(new Vector3());
  useFrame(({ camera }) => {
    const hud = useHudStore.getState().hud;
    trackLabelNdc.clear();
    if (!hud) return;
    for (const t of hud.tracks) {
      if (!labelled(t, hud.selectedTrackId)) continue;
      const ground = rt.groundHeight(t.x, t.z);
      const p = toThree({ x: t.x, y: ground + t.altitudeAglM + LABEL_LIFT_M, z: t.z });
      v.current.set(p.x, p.y, p.z).project(camera);
      // Behind the camera (z ≥ 1) a projection mirrors: hide rather than clamp.
      trackLabelNdc.set(t.id, { x: v.current.x, y: v.current.y, on: v.current.z < 1 });
    }
  });
  return null;
}

/** Over the tactical view: the labels, clamped to stay fully inside it. */
export function TrackLabels() {
  const layer = useRef<HTMLDivElement>(null);
  const tracks = useHudStore(
    useShallow((s) =>
      (s.hud?.tracks ?? []).filter((t) => labelled(t, s.hud?.selectedTrackId ?? null)),
    ),
  );
  const selectedId = useHudStore((s) => s.hud?.selectedTrackId ?? null);

  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    // Label sizes change only when a label's text does: cache them from a
    // ResizeObserver so the per-frame loop never reads layout (decision 150).
    const sizes = new Map<Element, { w: number; h: number }>();
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const box = e.borderBoxSize[0];
        if (box) sizes.set(e.target, { w: box.inlineSize, h: box.blockSize });
      }
    });
    const observeAll = () => {
      for (const c of Array.from(el.children)) ro.observe(c);
    };
    observeAll();
    const mo = new MutationObserver(observeAll);
    mo.observe(el, { childList: true });
    let vw = el.clientWidth;
    let vh = el.clientHeight;
    const lo = new ResizeObserver(() => {
      vw = el.clientWidth;
      vh = el.clientHeight;
    });
    lo.observe(el);

    let raf = 0;
    const place = () => {
      for (const child of Array.from(el.children) as HTMLElement[]) {
        const at = trackLabelNdc.get(child.dataset.track ?? '');
        const size = sizes.get(child);
        if (!at?.on || !size) {
          if (child.style.visibility !== 'hidden') child.style.visibility = 'hidden';
          continue;
        }
        const { left, top } = clampLabel(
          ((at.x + 1) / 2) * vw,
          ((1 - at.y) / 2) * vh,
          size.w,
          size.h,
          vw,
          vh,
        );
        child.style.visibility = 'visible';
        child.style.transform = `translate(${left}px, ${top}px)`;
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      lo.disconnect();
    };
  }, []);

  return (
    <div
      ref={layer}
      className="pointer-events-none absolute inset-0 z-[7] overflow-hidden"
      aria-hidden
      data-testid="track-labels"
    >
      {tracks.map((t) => {
        const style = AFFILIATION_STYLE[t.affiliation];
        const selected = t.id === selectedId;
        return (
          <div
            key={t.id}
            data-track={t.id}
            style={{ visibility: 'hidden' }}
            className="absolute left-0 top-0 flex flex-col items-center"
          >
            <div
              className={cn(
                'whitespace-nowrap border bg-bg-1 px-1 text-readout leading-4',
                style.textClass,
                selected ? 'border-select' : 'border-line-2',
              )}
            >
              {style.letter} {t.id}
            </div>
            {selected && t.ai && <AiLabelLine ai={t.ai} />}
          </div>
        );
      })}
    </div>
  );
}
