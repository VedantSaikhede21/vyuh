'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CLASS_PROFILES, type ContactClass } from '@vyuh/shared';
import { useEffect, useMemo, useRef } from 'react';
import {
  CircleGeometry,
  Color,
  DoubleSide,
  type InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import {
  frameWeights,
  MODEL_AXIS,
  MODEL_FOR,
  MODEL_SPECS,
  modelUrl,
  prepareModel,
  type ModelId,
  type PreparedModel,
} from '@/lib/sim/contact-models';
import { withAtmosphereFog } from '@/lib/sim/atmosphere-fog';
import { GROUND, IR } from '@/lib/theme/scene-colours';

// One class of contacts drawn with its downloaded model (display only, SPEC
// §6.2 EO view): body, spinning parts and blur discs as instanced meshes, so a
// class costs a few draw calls however many contacts it has. In IR every part
// takes one heat material: the class's thermal contrast (white = hot).

/** One drawn contact: where it is now. `visible` false hides it (scale 0). */
export interface ModelPose {
  visible: boolean;
  /** three.js world position (x east, y up, z −north). */
  position: Vector3;
  headingDeg: number;
  sizeM: number;
}

/** Representative wingbeat, Hz (display only). */
const WINGBEAT_HZ: Partial<Record<ContactClass, number>> = { BIRD_SMALL: 6, BIRD_LARGE: 3 };
/** Large birds glide between bursts of flapping: seconds flapping, seconds gliding. */
const GLIDE: Partial<Record<ContactClass, { flapS: number; glideS: number }>> = {
  BIRD_LARGE: { flapS: 3, glideS: 2.5 },
};

const UP = new Vector3(0, 1, 0);

export function useContactModel(id: ModelId): PreparedModel {
  const gltf = useGLTF(modelUrl(id), false, false);
  const prepared = useMemo(
    () => prepareModel(gltf.scene, MODEL_SPECS[id], gltf.animations),
    [gltf, id],
  );
  useEffect(
    () => () => {
      // Geometries and the day materials are ours; textures belong to the GLTF cache.
      for (const part of [prepared.body, ...prepared.spinners]) {
        part.geometry.dispose();
        for (const m of part.materials) m.dispose();
      }
    },
    [prepared],
  );
  return prepared;
}

/** Rotation taking +y (the disc's normal) onto the given axis. */
const DISC_TURN = {
  x: new Quaternion().setFromUnitVectors(UP, MODEL_AXIS.x),
  y: new Quaternion(),
  z: new Quaternion().setFromUnitVectors(UP, MODEL_AXIS.z),
} as const;

export function ClassModelMesh({
  cls,
  count,
  pose,
  holdPhase,
}: {
  cls: ContactClass;
  count: number;
  /** Fills `out` with instance i's pose for this frame. */
  pose: (i: number, out: ModelPose) => void;
  /** Dev check only: hold the wingbeat at this phase (cycles), instance i at holdPhase + i / count. */
  holdPhase?: number;
}) {
  const model = useContactModel(MODEL_FOR[cls]);
  const body = useRef<InstancedMesh>(null);
  const spinners = useRef<(InstancedMesh | null)[]>([]);
  const discs = useRef<InstancedMesh>(null);

  const ir = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(IR.contacts).multiplyScalar(CLASS_PROFILES[cls].thermalContrast),
        side: DoubleSide,
      }),
    [cls],
  );
  // Propeller blur: faint in the day picture; no heat signature of its own.
  const disc = useMemo(
    () => ({
      geometry: new CircleGeometry(1, 28).rotateX(-Math.PI / 2),
      day: withAtmosphereFog(
        new MeshBasicMaterial({
          color: GROUND.rotorBlur,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
          side: DoubleSide,
        }),
        'contact',
      ),
      ir: new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      ir.dispose();
      disc.geometry.dispose();
      disc.day.dispose();
      disc.ir.dispose();
    },
    [ir, disc],
  );

  // Morph driver for baked wingbeats: InstancedMesh.setMorphAt reads its influences.
  const morph = useMemo(() => {
    if (model.frames === 0) return null;
    const m = new Mesh(model.body.geometry);
    m.updateMorphTargets();
    return m;
  }, [model]);

  const tmp = useMemo(
    () => ({
      pose: { visible: false, position: new Vector3(), headingDeg: 0, sizeM: 1 } as ModelPose,
      base: new Matrix4(),
      m: new Matrix4(),
      part: new Matrix4(),
      q: new Quaternion(),
      s: new Vector3(),
      v: new Vector3(),
      weights: [] as number[],
    }),
    [],
  );

  useEffect(() => {
    for (const mesh of [body.current, discs.current, ...spinners.current]) {
      if (mesh) mesh.userData.irMaterial = mesh === discs.current ? disc.ir : ir;
    }
  }, [ir, disc, model]);

  const hz = WINGBEAT_HZ[cls] ?? 0;
  const glide = GLIDE[cls];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const b = body.current;
    if (!b) return;
    const d = discs.current;
    for (let i = 0; i < count; i++) {
      pose(i, tmp.pose);
      const p = tmp.pose;
      tmp.q.setFromAxisAngle(UP, (-p.headingDeg * Math.PI) / 180);
      const k = p.visible ? p.sizeM : 0;
      tmp.base.compose(p.position, tmp.q, tmp.s.set(k, k, k));
      b.setMatrixAt(i, tmp.base);

      if (morph && hz > 0) {
        // Per-instance phase so a flock doesn't beat in step.
        const offset = i * 0.37;
        let phase = t * hz + offset;
        if (glide) {
          const cycle = glide.flapS + glide.glideS;
          const local = (t + offset * 2.1) % cycle;
          // Hold the first frame (wings out) while gliding.
          phase = local < glide.flapS ? local * hz : 0;
        }
        if (holdPhase !== undefined) phase = holdPhase + i / count;
        frameWeights(phase, model.frames, tmp.weights);
        morph.morphTargetInfluences!.splice(0, tmp.weights.length, ...tmp.weights);
        b.setMorphAt(i, morph);
      }

      model.spinners.forEach((sp, j) => {
        const mesh = spinners.current[j];
        if (!mesh) return;
        const angle = 2 * Math.PI * sp.revPerS * t + i * 1.3;
        tmp.part
          .makeTranslation(sp.pivot.x, sp.pivot.y, sp.pivot.z)
          .multiply(tmp.m.makeRotationAxis(sp.axis, angle))
          .multiply(tmp.m.makeTranslation(-sp.pivot.x, -sp.pivot.y, -sp.pivot.z));
        mesh.setMatrixAt(i, tmp.m.multiplyMatrices(tmp.base, tmp.part));
      });

      if (d) {
        model.discs.forEach((ds, j) => {
          tmp.part.compose(
            tmp.v.set(ds.at[0], ds.at[1], ds.at[2]),
            DISC_TURN[ds.axis],
            tmp.s.set(ds.radius, ds.radius, ds.radius),
          );
          d.setMatrixAt(i * model.discs.length + j, tmp.m.multiplyMatrices(tmp.base, tmp.part));
        });
      }
    }
    b.instanceMatrix.needsUpdate = true;
    if (morph && b.morphTexture) b.morphTexture.needsUpdate = true;
    model.spinners.forEach((_, j) => {
      const mesh = spinners.current[j];
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    });
    if (d) d.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={body}
        args={[model.body.geometry, model.body.materials, count]}
        frustumCulled={false}
      />
      {model.spinners.map((sp, j) => (
        <instancedMesh
          key={j}
          ref={(m) => {
            spinners.current[j] = m;
          }}
          args={[sp.geometry, sp.materials, count]}
          frustumCulled={false}
        />
      ))}
      {model.discs.length > 0 && (
        <instancedMesh
          ref={discs}
          args={[disc.geometry, disc.day, count * model.discs.length]}
          frustumCulled={false}
          renderOrder={1}
        />
      )}
    </>
  );
}
