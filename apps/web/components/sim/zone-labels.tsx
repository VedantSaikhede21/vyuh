'use client';

import { useEffect, useRef } from 'react';
import { zoneLabel } from '@/lib/hud/zones';
import type { SimRuntime } from '@/lib/sim/runtime';

/**
 * Where each zone label sits on the tactical view, in normalised device
 * coordinates (−1..1), written every frame by the 3D scene (zone-markers.tsx)
 * and read by the DOM labels below. Zone labels are plain DOM in the main React
 * tree, not drei <Html>: three always-mounted <Html> roots made React tear down
 * extra roots mid-commit ("synchronously unmount a root", "removeChild … not a
 * child of this node" at session end) — decision 84.
 */
export const zoneLabelNdc = new Map<string, { x: number; y: number; on: boolean }>();

/** Zone labels over the tactical view (neutral chrome, DESIGN §3). */
export function ZoneLabels({ runtime }: { runtime: SimRuntime }) {
  const layer = useRef<HTMLDivElement>(null);
  const zones = runtime.scenario.zones.filter(
    (z) => z.kind === 'NO_KINETIC' || z.kind === 'BORDER_LINE',
  );

  useEffect(() => {
    let raf = 0;
    const place = () => {
      const el = layer.current;
      if (el) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        for (const child of Array.from(el.children) as HTMLElement[]) {
          const at = zoneLabelNdc.get(child.dataset.zone ?? '');
          if (!at?.on) {
            child.style.visibility = 'hidden';
            continue;
          }
          child.style.visibility = 'visible';
          child.style.transform = `translate(-50%, -50%) translate(${((at.x + 1) / 2) * w}px, ${((1 - at.y) / 2) * h}px)`;
        }
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 z-[6]" aria-hidden>
      {zones.map((z) => (
        <div
          key={z.id}
          data-zone={z.id}
          style={{ visibility: 'hidden' }}
          className="absolute left-0 top-0 whitespace-nowrap border border-line-2 bg-bg-1 px-1 text-label leading-4 text-text-2"
        >
          {zoneLabel(z)}
        </div>
      ))}
    </div>
  );
}
