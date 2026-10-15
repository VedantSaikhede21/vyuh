'use client';

import { Html, Line } from '@react-three/drei';
import type { Point2, Zone } from '@vyuh/shared';
import { toThree } from '@vyuh/sim-core';
import { useMemo, type RefObject } from 'react';
import { centroid, densify, hatchSegments, nearestPoint, zoneLabel } from '@/lib/hud/zones';
import { ZONES } from '@/lib/theme/scene-colours';
import { useSimRuntime } from './sim-context';

/** Ground-following lines are split every this many metres. */
const STEP_M = 25;
/** Hatch spacing and how far above the ground zone lines sit. */
const HATCH_M = 60;
const LIFT_M = 3;

type V3 = [number, number, number];

function useGround() {
  const rt = useSimRuntime();
  return (p: Point2, lift = LIFT_M): V3 => {
    const v = toThree({ x: p[0], y: rt.groundHeight(p[0], p[1]) + lift, z: p[1] });
    return [v.x, v.y, v.z];
  };
}

function Label({
  at,
  text,
  portal,
}: {
  at: V3;
  text: string;
  portal?: RefObject<HTMLElement | null>;
}) {
  return (
    <Html
      position={at}
      center
      // Above the WebGL canvas (z-index 5), below near track labels (up to 10).
      zIndexRange={[7, 6]}
      {...(portal ? { portal: portal as RefObject<HTMLElement> } : {})}
    >
      <div className="pointer-events-none whitespace-nowrap border border-line-2 bg-bg-1 px-1 text-label leading-4 text-text-2">
        {text}
      </div>
    </Html>
  );
}

function NoKineticZone({
  zone,
  portal,
}: {
  zone: Extract<Zone, { polygon: Point2[] }>;
  portal?: RefObject<HTMLElement | null>;
}) {
  const ground = useGround();
  const { outline, hatch, label } = useMemo(() => {
    const ring = densify(zone.polygon, STEP_M, true).map((p) => ground(p));
    const segs = hatchSegments(zone.polygon, HATCH_M).flatMap(([a, b]) => {
      const pts = densify([a, b], STEP_M).map((p) => ground(p, LIFT_M - 1));
      return pts.slice(1).flatMap((p, i) => [pts[i]!, p]);
    });
    // Label just beyond the zone's north edge, so it does not cover the zone.
    const [cx] = centroid(zone.polygon);
    const north = Math.max(...zone.polygon.map((p) => p[1]));
    return { outline: ring, hatch: segs, label: ground([cx, north + 40], 25) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);
  return (
    <group>
      <Line points={outline} color={ZONES.outline} lineWidth={2} />
      {hatch.length > 0 && (
        <Line points={hatch} segments color={ZONES.hatchTerrain} lineWidth={1} />
      )}
      <Label at={label} text={zoneLabel(zone)} portal={portal} />
    </group>
  );
}

function BorderLine({
  zone,
  portal,
}: {
  zone: Extract<Zone, { kind: 'BORDER_LINE' }>;
  portal?: RefObject<HTMLElement | null>;
}) {
  const ground = useGround();
  const rt = useSimRuntime();
  const { line, label } = useMemo(
    () => ({
      line: densify(zone.polyline, STEP_M).map((p) => ground(p)),
      // Label where the line passes closest to the defended asset.
      label: ground(
        nearestPoint(zone.polyline, [rt.scenario.assets[0]?.x ?? 0, rt.scenario.assets[0]?.z ?? 0]),
        25,
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zone],
  );
  return (
    <group>
      <Line points={line} color={ZONES.border} lineWidth={1.5} dashed dashSize={60} gapSize={40} />
      <Label at={label} text={zoneLabel(zone)} portal={portal} />
    </group>
  );
}

/**
 * NO_KINETIC zones (outlined, hatched) and border lines (dashed) on the terrain,
 * in neutral chrome with a label each (Step 10). Not affiliation colours.
 */
export function ZoneMarkers({ labelPortal }: { labelPortal?: RefObject<HTMLElement | null> }) {
  const rt = useSimRuntime();
  return (
    <>
      {rt.scenario.zones.map((z) =>
        z.kind === 'BORDER_LINE' ? (
          <BorderLine key={z.id} zone={z} portal={labelPortal} />
        ) : z.kind === 'NO_KINETIC' ? (
          <NoKineticZone key={z.id} zone={z} portal={labelPortal} />
        ) : null,
      )}
    </>
  );
}
