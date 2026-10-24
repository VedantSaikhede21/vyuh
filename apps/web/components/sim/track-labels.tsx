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
    let raf = 0;
    const place = () => {
      const el = layer.current;
      if (el) {
        // Read every size first, then write every transform: interleaving them
        // forced a layout per label per frame (decision 150).
        const vw = el.clientWidth;
        const vh = el.clientHeight;
        const kids = Array.from(el.children) as HTMLElement[];
        const sizes = kids.map((c) => [c.offsetWidth, c.offsetHeight] as const);
        kids.forEach((child, i) => {
          const at = trackLabelNdc.get(child.dataset.track ?? '');
          if (!at?.on) {
            child.style.visibility = 'hidden';
            return;
          }
          const [w, h] = sizes[i]!;
          const { left, top } = clampLabel(
            ((at.x + 1) / 2) * vw,
            ((1 - at.y) / 2) * vh,
            w,
            h,
            vw,
            vh,
          );
          child.style.visibility = 'visible';
          child.style.transform = `translate(${left}px, ${top}px)`;
        });
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
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
