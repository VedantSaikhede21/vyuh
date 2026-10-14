'use client';

import { useFrame } from '@react-three/fiber';
import { CLASS_PROFILES } from '@vyuh/shared';
import { toThree, type Vec3 } from '@vyuh/sim-core';
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
import { useSimRuntime } from './sim-context';

/** Low-poly small quadcopter, ~0.35 m across, nose toward −z. */
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
  return mergeGeometries(parts)!;
}

const UP = new Vector3(0, 1, 0);

/** Ground-truth contacts at true size: effectively invisible at tactical range, seen in EO. */
export function Drones() {
  const rt = useSimRuntime();
  const contacts = rt.sim.getState().contacts;
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => quadGeometry(), []);
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
    const specs = new Map(rt.scenario.contacts.map((c) => [c.id, c]));
    const heat = new Color();
    contacts.forEach((c, i) => {
      const spec = specs.get(c.id);
      const t = spec ? CLASS_PROFILES[spec.class].thermalContrast : 0.5;
      mesh.setColorAt(i, heat.setScalar(t));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.irMaterial = IR_MATERIALS.contacts;
  }, [rt, contacts]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    contacts.forEach((c, i) => {
      const visible = c.status === 'ACTIVE' && rt.contactPosition(c.id, tmp.v) !== null;
      const p = toThree(tmp.v);
      tmp.p.set(p.x, p.y, p.z);
      tmp.q.setFromAxisAngle(UP, (-c.headingDeg * Math.PI) / 180);
      tmp.s.setScalar(visible ? 1 : 0);
      mesh.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, contacts.length]} frustumCulled={false}>
      <meshLambertMaterial color="#1a1d21" />
    </instancedMesh>
  );
}
