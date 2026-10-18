'use client';

import { useEffect, useMemo, useRef } from 'react';
import { groupNoKineticZones, hoveredZoneIds, zoneLabel, zonesNearTrack } from '@/lib/hud/zones';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';

/**
 * Where each zone label sits on the tactical view, in normalised device
 * coordinates (−1..1), written every frame by the 3D scene (zone-markers.tsx)
 * and read by the DOM labels below. Zone labels are plain DOM in the main React
 * tree, not drei <Html>: three always-mounted <Html> roots made React tear down
 * extra roots mid-commit ("synchronously unmount a root", "removeChild … not a
 * child of this node" at session end) — decision 84.
 */
export const zoneLabelNdc = new Map<string, { x: number; y: number; on: boolean }>();

/**
 * Zone labels over the tactical view (neutral chrome, DESIGN §3). A cluster of
 * NO_KINETIC zones has one label; its member ids show while the label is
 * hovered or the selected track is in or heading into the zone (decision 98).
 */
export function ZoneLabels({ runtime }: { runtime: SimRuntime }) {
  const layer = useRef<HTMLDivElement>(null);
  const zones = runtime.scenario.zones;
  const groups = useMemo(() => groupNoKineticZones(zones), [zones]);
  const members = useMemo(
    () => groups.flatMap((g) => (g.zones.length > 1 ? g.zones : [])),
    [groups],
  );

  useEffect(() => {
    let raf = 0;
    const place = () => {
      const el = layer.current;
      if (el) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        const hud = useHudStore.getState().hud;
        const selected = hud?.tracks.find(
          (t) => t.id === hud.selectedTrackId && t.status === 'ACTIVE',
        );
        const near = selected ? zonesNearTrack(members, selected) : null;
        for (const child of Array.from(el.children) as HTMLElement[]) {
          const id = child.dataset.zone ?? '';
          const at = zoneLabelNdc.get(id);
          const shown =
            child.dataset.member !== '1' || hoveredZoneIds.has(id) || near?.has(id) === true;
          if (!at?.on || !shown) {
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
    return () => {
      cancelAnimationFrame(raf);
      hoveredZoneIds.clear();
    };
  }, [members]);

  const chip =
    'absolute left-0 top-0 whitespace-nowrap border border-line-2 bg-bg-1 px-1 text-label leading-4 text-text-2';
  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 z-[6]" aria-hidden>
      {zones.map((z) =>
        z.kind === 'BORDER_LINE' ? (
          <div key={z.id} data-zone={z.id} style={{ visibility: 'hidden' }} className={chip}>
            {zoneLabel(z)}
          </div>
        ) : null,
      )}
      {groups.map((g) =>
        g.zones.length === 1 ? (
          <div key={g.key} data-zone={g.key} style={{ visibility: 'hidden' }} className={chip}>
            {g.label}
          </div>
        ) : (
          <div
            key={g.key}
            data-zone={g.key}
            style={{ visibility: 'hidden' }}
            className={`${chip} pointer-events-auto cursor-default`}
            onPointerEnter={() => g.zones.forEach((z) => hoveredZoneIds.add(z.id))}
            onPointerLeave={() => hoveredZoneIds.clear()}
          >
            {g.label}
          </div>
        ),
      )}
      {members.map((z) => (
        <div
          key={z.id}
          data-zone={z.id}
          data-member="1"
          style={{ visibility: 'hidden' }}
          className={chip}
        >
          {z.id}
        </div>
      ))}
    </div>
  );
}
