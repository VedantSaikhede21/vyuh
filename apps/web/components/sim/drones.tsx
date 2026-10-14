'use client';

import { useFrame } from '@react-three/fiber';
import { CLASS_PROFILES, type ContactClass } from '@vyuh/shared';
import { toThree, type ContactState, type Vec3 } from '@vyuh/sim-core';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  type BufferGeometry,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { IR_MATERIALS } from '@/lib/sim/ir-materials';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useSimRuntime } from './sim-context';
import { GROUND } from '@/lib/theme/scene-colours';

// Contacts at true size, one InstancedMesh per shape family (≈ 4 draw calls).
// Each geometry is normalised to a 1 m largest dimension (nose toward −z) and
// scaled per instance by the class's sizeM.

type Family = 'QUAD' | 'FIXED_WING' | 'BIRD' | 'HELICOPTER';

export const FAMILY: Readonly<Record<ContactClass, Family>> = {
  QUAD_SMALL: 'QUAD',
  QUAD_HEAVY: 'QUAD',
  FPV: 'QUAD',
  FRIENDLY_QUAD: 'QUAD',
  CIVILIAN_HOBBY: 'QUAD',
  FIXED_WING_SMALL: 'FIXED_WING',
  LOITERING_GENERIC: 'FIXED_WING',
  BIRD_SMALL: 'BIRD',
  BIRD_LARGE: 'BIRD',
  HELICOPTER_FRIENDLY: 'HELICOPTER',
};

/** Scale a geometry so its largest bounding-box dimension is 1 m. */
function normalised(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts)!;
  g.computeBoundingBox();
  const size = g.boundingBox!.getSize(new Vector3());
  const k = 1 / Math.max(size.x, size.y, size.z);
  return g.scale(k, k, k);
}

function quadGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [new BoxGeometry(0.12, 0.05, 0.12)];
  for (const [x, z] of [
    [0.12, 0.12],
    [-0.12, 0.12],
    [0.12, -0.12],
    [-0.12, -0.12],
  ] as const) {
    parts.push(
      new BoxGeometry(0.2, 0.015, 0.02).rotateY(Math.atan2(z, x)).translate(x / 2, 0, z / 2),
    );
    parts.push(new CylinderGeometry(0.06, 0.06, 0.008, 12).translate(x, 0.03, z));
  }
  return normalised(parts);
}

function fixedWingGeometry(): BufferGeometry {
  return normalised([
    new BoxGeometry(0.08, 0.08, 0.8), // fuselage
    new BoxGeometry(1.0, 0.02, 0.18).translate(0, 0.02, -0.05), // wing
    new BoxGeometry(0.32, 0.015, 0.1).translate(0, 0.02, 0.35), // tailplane
    new BoxGeometry(0.015, 0.12, 0.1).translate(0, 0.08, 0.35), // fin
  ]);
}

function birdGeometry(): BufferGeometry {
  return normalised([
    new BoxGeometry(0.1, 0.07, 0.3), // body
    new BoxGeometry(0.06, 0.05, 0.08).translate(0, 0.02, -0.18), // head
    new BoxGeometry(0.42, 0.01, 0.14).translate(-0.26, 0.02, -0.02), // wings
    new BoxGeometry(0.42, 0.01, 0.14).translate(0.26, 0.02, -0.02),
  ]);
}

function helicopterGeometry(): BufferGeometry {
  return normalised([
    new BoxGeometry(0.22, 0.24, 0.5), // cabin
    new BoxGeometry(0.05, 0.05, 0.55).translate(0, 0.04, 0.5), // tail boom
    new CylinderGeometry(0.5, 0.5, 0.01, 24).translate(0, 0.16, 0), // main rotor disc
    new CylinderGeometry(0.08, 0.08, 0.01, 12).rotateZ(Math.PI / 2).translate(0.04, 0.06, 0.75),
  ]);
}

const GEOMETRY: Readonly<Record<Family, () => BufferGeometry>> = {
  QUAD: quadGeometry,
  FIXED_WING: fixedWingGeometry,
  BIRD: birdGeometry,
  HELICOPTER: helicopterGeometry,
};

/** Representative wingbeat, Hz (display only). */
const WINGBEAT_HZ: Partial<Record<ContactClass, number>> = { BIRD_SMALL: 6, BIRD_LARGE: 3 };

const UP = new Vector3(0, 1, 0);

function FamilyMesh({
  rt,
  family,
  members,
}: {
  rt: SimRuntime;
  family: Family;
  members: readonly { contact: ContactState; cls: ContactClass }[];
}) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => GEOMETRY[family](), [family]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      q: new Quaternion(),
      p: new Vector3(),
      s: new Vector3(),
      v: { x: 0, y: 0, z: 0 } as Vec3,
    }),
    [],
  );

  // IR heat per contact = its class's thermal contrast (white = hot); the day
  // material is dark, so the same instance colour only darkens it slightly.
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const heat = new Color();
    members.forEach(({ cls }, i) => {
      mesh.setColorAt(i, heat.setScalar(CLASS_PROFILES[cls].thermalContrast));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.irMaterial = IR_MATERIALS.contacts;
  }, [members]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    members.forEach(({ contact: c, cls }, i) => {
      const visible = c.status === 'ACTIVE' && rt.contactPosition(c.id, tmp.v) !== null;
      const p = toThree(tmp.v);
      tmp.p.set(p.x, p.y, p.z);
      tmp.q.setFromAxisAngle(UP, (-c.headingDeg * Math.PI) / 180);
      const size = visible ? CLASS_PROFILES[cls].sizeM : 0;
      const hz = WINGBEAT_HZ[cls];
      // Wing flap: squeeze the span with a per-instance phase (render-only, not sim state).
      const span = hz ? 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * hz * t + i * 1.7)) : 1;
      tmp.s.set(size * span, size, size);
      mesh.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, members.length]} frustumCulled={false}>
      <meshLambertMaterial color={GROUND.droneBody} />
    </instancedMesh>
  );
}

/** Ground-truth contacts at true size: effectively invisible at tactical range, seen in EO. */
export function Drones() {
  const rt = useSimRuntime();
  const contacts = rt.sim.getState().contacts;
  const groups = useMemo(() => {
    const cls = new Map(rt.scenario.contacts.map((c) => [c.id, c.class]));
    const out = new Map<Family, { contact: ContactState; cls: ContactClass }[]>();
    for (const contact of contacts) {
      const c = cls.get(contact.id);
      if (c === undefined) continue;
      const list = out.get(FAMILY[c]) ?? [];
      list.push({ contact, cls: c });
      out.set(FAMILY[c], list);
    }
    return [...out.entries()];
  }, [rt, contacts]);

  return (
    <>
      {groups.map(([family, members]) => (
        <FamilyMesh key={family} rt={rt} family={family} members={members} />
      ))}
    </>
  );
}
