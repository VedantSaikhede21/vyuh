'use client';

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { AreaZone, Point2, Zone } from '@vyuh/shared';
import { toThree } from '@vyuh/sim-core';
import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import {
  centroid,
  densify,
  groupNoKineticZones,
  hatchSegments,
  nearestPoint,
  type ZoneLabelGroup,
} from '@/lib/hud/zones';
import { ZONES } from '@/lib/theme/scene-colours';
import { useSimRuntime } from './sim-context';
import { zoneLabelNdc } from './zone-labels';

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

const ndc = new Vector3();

/** Projects a label anchor every frame for the DOM zone labels (zone-labels.tsx). */
function LabelAnchor({ id, at }: { id: string; at: V3 }) {
  useFrame(({ camera }) => {
    ndc.set(at[0], at[1], at[2]).project(camera);
    zoneLabelNdc.set(id, {
      x: ndc.x,
      y: ndc.y,
      on: ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) <= 1.2 && Math.abs(ndc.y) <= 1.2,
    });
  });
  return null;
}

function NoKineticZone({ zone, member }: { zone: AreaZone; member: boolean }) {
  const ground = useGround();
  const { outline, hatch, label } = useMemo(() => {
    const ring = densify(zone.polygon, STEP_M, true).map((p) => ground(p));
    const segs = hatchSegments(zone.polygon, HATCH_M).flatMap(([a, b]) => {
      const pts = densify([a, b], STEP_M).map((p) => ground(p, LIFT_M - 1));
      return pts.slice(1).flatMap((p, i) => [pts[i]!, p]);
    });
    // A cluster member's id (shown on demand) sits over the zone itself.
    return { outline: ring, hatch: segs, label: ground(centroid(zone.polygon), 25) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);
  return (
    <group>
      <Line points={outline} color={ZONES.outline} lineWidth={2} />
      {hatch.length > 0 && (
        <Line points={hatch} segments color={ZONES.hatchTerrain} lineWidth={1} />
      )}
      {member && <LabelAnchor id={zone.id} at={label} />}
    </group>
  );
}

/** One label per zone group, just beyond its north edge so it does not cover the zones. */
function GroupLabelAnchor({ group }: { group: ZoneLabelGroup }) {
  const ground = useGround();
  const at = useMemo(() => {
    const points: Point2[] = group.zones.flatMap((z) => z.polygon);
    const [cx] = centroid(points);
    const north = Math.max(...points.map((p) => p[1]));
    return ground([cx, north + 40], 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);
  return <LabelAnchor id={group.key} at={at} />;
}

function BorderLine({ zone }: { zone: Extract<Zone, { kind: 'BORDER_LINE' }> }) {
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
      <LabelAnchor id={zone.id} at={label} />
    </group>
  );
}

/**
 * NO_KINETIC zones (outlined, hatched) and border lines (dashed) on the terrain,
 * in neutral chrome with a label each (Step 10). Not affiliation colours.
 */
export function ZoneMarkers() {
  const rt = useSimRuntime();
  const groups = useMemo(() => groupNoKineticZones(rt.scenario.zones), [rt.scenario.zones]);
  // Labels of a previous session must not linger in the shared map.
  useEffect(() => () => zoneLabelNdc.clear(), []);
  return (
    <>
      {rt.scenario.zones.map((z) =>
        z.kind === 'BORDER_LINE' ? <BorderLine key={z.id} zone={z} /> : null,
      )}
      {groups.map((g) => (
        <group key={g.key}>
          {g.zones.map((z) => (
            <NoKineticZone key={z.id} zone={z} member={g.zones.length > 1} />
          ))}
          <GroupLabelAnchor group={g} />
        </group>
      ))}
    </>
  );
}
