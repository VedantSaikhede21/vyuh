import type { ContactClass } from '@vyuh/shared';
import {
  AnimationMixer,
  Box3,
  type BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  type InterleavedBufferAttribute,
  type Material,
  Matrix4,
  type Mesh,
  MeshLambertMaterial,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  type Texture,
  Vector3,
  type AnimationClip,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Contact models (display only). Downloaded CC-BY models, processed by
// scripts/models/build.mjs into apps/web/public/models/<id>.glb; sources in
// docs/realism-sources.md. At load time each model is turned to face −z with
// +y up, centred, and scaled so its largest dimension is 1 m (each instance is
// then scaled by its class's sizeM, as before). Parts that spin (rotors,
// propellers) are split out so they can turn; propellers baked into a model
// get a faint blur disc instead. The bird's wingbeat is baked from its
// animation into morph targets, so a whole flock stays one instanced draw.

export type ModelId =
  | 'quad-small'
  | 'quad-heavy'
  | 'fpv'
  | 'fixed-wing'
  | 'loitering'
  | 'heli'
  | 'bird';

export const MODEL_IDS: readonly ModelId[] = [
  'quad-small',
  'quad-heavy',
  'fpv',
  'fixed-wing',
  'loitering',
  'heli',
  'bird',
];

/** Small friendly, civilian and hostile quads share one model: telling them apart is the trainee's job. */
export const MODEL_FOR: Readonly<Record<ContactClass, ModelId>> = {
  QUAD_SMALL: 'quad-small',
  FRIENDLY_QUAD: 'quad-small',
  CIVILIAN_HOBBY: 'quad-small',
  QUAD_HEAVY: 'quad-heavy',
  FPV: 'fpv',
  FIXED_WING_SMALL: 'fixed-wing',
  LOITERING_GENERIC: 'loitering',
  BIRD_SMALL: 'bird',
  BIRD_LARGE: 'bird',
  HELICOPTER_FRIENDLY: 'heli',
};

export const modelUrl = (id: ModelId) => `/models/${id}.glb`;

type Axis = 'x' | 'y' | 'z';

export interface SpinSpec {
  /** Node name in the GLB; the node and its children spin. */
  node: string;
  /** Spin axis in the final model frame (nose −z, up +y). */
  axis: Axis;
  /** Display rate, rev/s (kept below the 30 fps camera rate's strobing). */
  revPerS: number;
}

export interface DiscSpec {
  /** Centre in the final normalised frame (largest dimension = 1). */
  at: readonly [number, number, number];
  radius: number;
  /** Disc normal. */
  axis: Axis;
}

export interface ModelSpec {
  /** Turn applied after the GLB's own transforms, degrees (XYZ order), so the nose faces −z. */
  rotationDeg: readonly [number, number, number];
  spin?: readonly SpinSpec[];
  discs?: readonly DiscSpec[];
  /** Morph frames baked from the first animation clip (birds). */
  bakeFrames?: number;
  /** Node whose animated travel is removed while baking (the clip's root motion). */
  pinNode?: string;
  /** Part of the clip to bake, as fractions of its duration (one wingbeat). */
  clipRange?: readonly [number, number];
  /** Material of the body piece held still across frames (no bob from the wingbeat). */
  anchorMaterial?: string;
}

export const MODEL_SPECS: Readonly<Record<ModelId, ModelSpec>> = {
  // Blur discs measured on /dev/models (top and side views), normalised units.
  'quad-small': {
    rotationDeg: [0, 180, 0],
    discs: [
      { at: [-0.355, 0.125, -0.21], radius: 0.25, axis: 'y' },
      { at: [0.355, 0.125, -0.21], radius: 0.25, axis: 'y' },
      { at: [-0.254, 0.02, 0.254], radius: 0.25, axis: 'y' },
      { at: [0.254, 0.02, 0.254], radius: 0.25, axis: 'y' },
    ],
  },
  'quad-heavy': {
    rotationDeg: [0, 0, 0],
    discs: [
      { at: [-0.246, 0.17, -0.426], radius: 0.19, axis: 'y' },
      { at: [0.246, 0.17, -0.426], radius: 0.19, axis: 'y' },
      { at: [-0.48, 0.17, 0], radius: 0.19, axis: 'y' },
      { at: [0.48, 0.17, 0], radius: 0.19, axis: 'y' },
      { at: [-0.23, 0.17, 0.406], radius: 0.19, axis: 'y' },
      { at: [0.234, 0.17, 0.406], radius: 0.19, axis: 'y' },
    ],
  },
  fpv: {
    rotationDeg: [0, 180, 0],
    discs: [
      { at: [-0.29, 0.05, -0.3], radius: 0.2, axis: 'y' },
      { at: [0.29, 0.05, -0.3], radius: 0.2, axis: 'y' },
      { at: [-0.29, 0.05, 0.305], radius: 0.2, axis: 'y' },
      { at: [0.29, 0.05, 0.305], radius: 0.2, axis: 'y' },
    ],
  },
  'fixed-wing': {
    rotationDeg: [0, 180, 0],
    discs: [{ at: [0, 0, -0.27], radius: 0.06, axis: 'z' }],
  },
  loitering: { rotationDeg: [0, 0, 0], spin: [{ node: 'rotor', axis: 'z', revPerS: 7 }] },
  heli: {
    rotationDeg: [0, 180, 0],
    spin: [
      { node: 'Top_Rotor', axis: 'y', revPerS: 1.7 },
      { node: 'Back_Rotor', axis: 'x', revPerS: 6.5 },
    ],
  },
  // "Crow Ascend" is a climbing take-off: one wingbeat (0–0.33 of the clip),
  // root travel removed, body held still and levelled ~22° nose-down.
  bird: {
    rotationDeg: [-22, 90, 0],
    bakeFrames: 12,
    pinNode: 'N_ALL_05',
    clipRange: [0, 0.33],
    anchorMaterial: 'em0101',
  },
};

export interface ModelPart {
  geometry: BufferGeometry;
  materials: Material[];
}

export interface SpinPart extends ModelPart {
  pivot: Vector3;
  axis: Vector3;
  revPerS: number;
}

export interface PreparedModel {
  body: ModelPart;
  spinners: SpinPart[];
  discs: readonly DiscSpec[];
  /** Number of baked wingbeat frames on body.geometry (0 = none). */
  frames: number;
}

const AXIS: Readonly<Record<Axis, Vector3>> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/** Copy any (quantised, normalised or interleaved) attribute into plain float32. */
function toFloat(attr: BufferAttribute | InterleavedBufferAttribute): Float32BufferAttribute {
  const n = attr.count;
  const size = attr.itemSize;
  const out = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    out[i * size] = attr.getX(i);
    if (size > 1) out[i * size + 1] = attr.getY(i);
    if (size > 2) out[i * size + 2] = attr.getZ(i);
    if (size > 3) out[i * size + 3] = attr.getW(i);
  }
  return new Float32BufferAttribute(out, size);
}

/** Plain float geometry with position / normal / uv only, in the frame given by `m`. */
function bakeGeometry(src: BufferGeometry, m: Matrix4, positions?: Float32Array): BufferGeometry {
  const g = new BufferGeometry();
  const pos = src.getAttribute('position');
  g.setAttribute(
    'position',
    positions ? new Float32BufferAttribute(positions.slice(), 3) : toFloat(pos),
  );
  const normal = src.getAttribute('normal');
  if (normal) g.setAttribute('normal', toFloat(normal));
  const uv = src.getAttribute('uv');
  g.setAttribute('uv', uv ? toFloat(uv) : new Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
  if (src.index) g.setIndex(Array.from(src.index.array));
  else g.setIndex(Array.from({ length: pos.count }, (_, i) => i));
  g.applyMatrix4(m);
  if (!normal) g.computeVertexNormals();
  return g;
}

/** Day material: the model's base colour (map + factor), lit, both sides (thin blades and wings). */
function dayMaterial(src: Material): Material {
  const s = src as MeshStandardMaterial;
  const blend = s.transparent || s.alphaTest > 0;
  const map: Texture | null = s.map ?? null;
  return new MeshLambertMaterial({
    map,
    color: s.color ? new Color().copy(s.color) : new Color(1, 1, 1),
    side: DoubleSide,
    // Instanced draws are not sorted: cut-out alpha instead of blending.
    alphaTest: blend ? 0.5 : 0,
    name: src.name,
  });
}

function isUnder(o: Object3D, name: string): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p.name === name) return true;
  return false;
}

interface Piece {
  mesh: Mesh;
  geometry: BufferGeometry;
}

/** Merge pieces into one geometry with one group per source material. */
function mergeByMaterial(pieces: Piece[], cache: Map<Material, Material>): ModelPart {
  const byMat = new Map<Material, BufferGeometry[]>();
  for (const { mesh, geometry } of pieces) {
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material;
    const list = byMat.get(mat) ?? [];
    list.push(geometry);
    byMat.set(mat, list);
  }
  const geoms: BufferGeometry[] = [];
  const materials: Material[] = [];
  for (const [mat, list] of byMat) {
    geoms.push(list.length === 1 ? list[0]! : mergeGeometries(list, false)!);
    let day = cache.get(mat);
    if (!day) {
      day = dayMaterial(mat);
      cache.set(mat, day);
    }
    materials.push(day);
  }
  const geometry = geoms.length === 1 ? geoms[0]! : mergeGeometries(geoms, true)!;
  if (geoms.length === 1) geometry.addGroup(0, geometry.index!.count, 0);
  return { geometry, materials };
}

/** Skinned positions of `mesh` at the mixer's current time, in the frame `m`. */
function skinnedPositions(mesh: SkinnedMesh, m: Matrix4): Float32Array {
  mesh.skeleton.update();
  const pos = mesh.geometry.getAttribute('position');
  const out = new Float32Array(pos.count * 3);
  const v = new Vector3();
  const world = new Matrix4().multiplyMatrices(m, mesh.matrixWorld);
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(world);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/**
 * Turn a loaded GLB scene into instancing-ready parts: one body geometry (with
 * a group per material), the spinning parts with their pivots, and, for an
 * animated model, `bakeFrames` morph targets sampled over its first clip.
 */
export function prepareModel(
  scene: Object3D,
  spec: ModelSpec,
  animations: readonly AnimationClip[] = [],
): PreparedModel {
  const [rx, ry, rz] = spec.rotationDeg.map((d) => (d * Math.PI) / 180) as [number, number, number];
  const turn = new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz, 'XYZ'));
  scene.updateMatrixWorld(true);

  const meshes: Mesh[] = [];
  scene.traverse((o) => {
    if ((o as Mesh).isMesh && o.visible) meshes.push(o as Mesh);
  });
  const clip = spec.bakeFrames ? animations[0] : undefined;
  const frames = clip && spec.bakeFrames ? spec.bakeFrames : 0;

  // Morph frames: sample the skinned pose `frames` times over the clip.
  const framePositions = new Map<Mesh, Float32Array[]>();
  if (clip) {
    const mixer = new AnimationMixer(scene);
    mixer.clipAction(clip).play();
    const [from, to] = spec.clipRange ?? [0, 1];
    const pin = spec.pinNode ? scene.getObjectByName(spec.pinNode) : undefined;
    let pinAt: Vector3 | undefined;
    for (let f = 0; f < frames; f++) {
      mixer.setTime((from + ((to - from) * f) / frames) * clip.duration);
      if (pin) {
        pinAt ??= pin.position.clone();
        pin.position.copy(pinAt);
      }
      scene.updateMatrixWorld(true);
      for (const mesh of meshes) {
        if (!(mesh as SkinnedMesh).isSkinnedMesh) continue;
        const list = framePositions.get(mesh) ?? [];
        list.push(skinnedPositions(mesh as SkinnedMesh, turn));
        framePositions.set(mesh, list);
      }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);

    // Hold the body piece's centroid where it is in frame 0, so only the wings move.
    const anchor = [...framePositions.keys()].find((m) => {
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      return mat?.name === spec.anchorMaterial;
    });
    const anchorFrames = anchor ? framePositions.get(anchor) : undefined;
    if (anchorFrames) {
      const centroid = (a: Float32Array) => {
        const c = new Vector3();
        const v = new Vector3();
        for (let i = 0; i < a.length; i += 3) c.add(v.fromArray(a, i));
        return c.multiplyScalar(3 / a.length);
      };
      const c0 = centroid(anchorFrames[0]!);
      const v = new Vector3();
      for (let f = 1; f < frames; f++) {
        const d = c0.clone().sub(centroid(anchorFrames[f]!));
        for (const list of framePositions.values()) {
          const a = list[f]!;
          for (let i = 0; i < a.length; i += 3) v.fromArray(a, i).add(d).toArray(a, i);
        }
      }
    }
  }

  const bodyPieces: Piece[] = [];
  const spinPieces = new Map<SpinSpec, Piece[]>();
  for (const mesh of meshes) {
    const spin = spec.spin?.find((s) => isUnder(mesh, s.node));
    const frame0 = framePositions.get(mesh)?.[0];
    const world = new Matrix4().multiplyMatrices(turn, mesh.matrixWorld);
    // Skinned frame positions are already in the final frame.
    const geometry = frame0
      ? bakeGeometry(mesh.geometry, new Matrix4(), frame0)
      : bakeGeometry(mesh.geometry, world);
    if (frame0) geometry.computeVertexNormals();
    const piece = { mesh, geometry };
    if (spin) spinPieces.set(spin, [...(spinPieces.get(spin) ?? []), piece]);
    else bodyPieces.push(piece);
  }

  // Normalise: centre the whole model and scale its largest dimension to 1.
  const box = new Box3();
  for (const { geometry } of [...bodyPieces, ...[...spinPieces.values()].flat()]) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  const size = box.getSize(new Vector3());
  const k = 1 / Math.max(size.x, size.y, size.z, 1e-9);
  const centre = box.getCenter(new Vector3());
  const norm = new Matrix4().makeScale(k, k, k).multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
  const normalise = (arr: Float32Array) => {
    const v = new Vector3();
    for (let i = 0; i < arr.length; i += 3) {
      v.set(arr[i]!, arr[i + 1]!, arr[i + 2]!).applyMatrix4(norm);
      arr[i] = v.x;
      arr[i + 1] = v.y;
      arr[i + 2] = v.z;
    }
  };
  for (const { geometry } of [...bodyPieces, ...[...spinPieces.values()].flat()]) {
    geometry.applyMatrix4(norm);
  }
  for (const list of framePositions.values()) for (const arr of list) normalise(arr);

  const cache = new Map<Material, Material>();
  const body = mergeByMaterial(bodyPieces, cache);

  if (frames > 0) {
    // Morph targets in merge order (mergeByMaterial keeps piece order within a material).
    const ordered: Piece[] = [];
    const byMat = new Map<Material, Piece[]>();
    for (const piece of bodyPieces) {
      const m = piece.mesh.material;
      const mat = (Array.isArray(m) ? m[0] : m) as Material;
      byMat.set(mat, [...(byMat.get(mat) ?? []), piece]);
    }
    for (const list of byMat.values()) ordered.push(...list);
    const targets: Float32BufferAttribute[] = [];
    for (let f = 0; f < frames; f++) {
      // Unskinned pieces hold still: their own (normalised) positions in every frame.
      const parts = ordered.map(
        ({ mesh, geometry }) =>
          framePositions.get(mesh)?.[f] ?? (geometry.getAttribute('position').array as Float32Array),
      );
      const total = parts.reduce((s, a) => s + a.length, 0);
      const arr = new Float32Array(total);
      let o = 0;
      for (const a of parts) {
        arr.set(a, o);
        o += a.length;
      }
      targets.push(new Float32BufferAttribute(arr, 3));
    }
    body.geometry.morphAttributes.position = targets;
    body.geometry.morphTargetsRelative = false;
  }

  const spinners: SpinPart[] = [];
  for (const [s, pieces] of spinPieces) {
    const part = mergeByMaterial(pieces, cache);
    part.geometry.computeBoundingBox();
    spinners.push({
      ...part,
      pivot: part.geometry.boundingBox!.getCenter(new Vector3()),
      axis: AXIS[s.axis].clone(),
      revPerS: s.revPerS,
    });
  }

  body.geometry.computeBoundingSphere();
  return { body, spinners, discs: spec.discs ?? [], frames };
}

/** Morph weights for wingbeat phase p (cycles): linear between the two nearest baked frames. */
export function frameWeights(phase: number, frames: number, out: number[]): number[] {
  out.length = frames;
  out.fill(0);
  if (frames === 0) return out;
  const x = (((phase % 1) + 1) % 1) * frames;
  const i = Math.floor(x) % frames;
  const a = x - Math.floor(x);
  out[i] = 1 - a;
  out[(i + 1) % frames] = (out[(i + 1) % frames] ?? 0) + a;
  return out;
}

export { AXIS as MODEL_AXIS };
