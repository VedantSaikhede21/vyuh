import { MeshBasicMaterial, MeshLambertMaterial, type Material, type Object3D } from 'three';

// Thermal (IR) rendering (SPEC §6.2). Meshes carry their heat material in
// `userData.irMaterial`; the EO pass swaps it in, renders, and swaps back. The
// display shader then maps luminance to a white-hot palette. Render-only: the
// sim's IR model is in sim-core.

export const IR_MATERIALS = {
  /** Cool ground; sun-facing slopes read slightly warmer through Lambert shading. */
  terrain: new MeshLambertMaterial({ color: '#6a6a6a' }),
  buildings: new MeshLambertMaterial({ color: '#8a8a8a' }),
  /** Contacts: per-instance colour = thermal contrast (white = hot). */
  contacts: new MeshBasicMaterial({ color: '#ffffff' }),
} as const satisfies Record<string, Material>;

interface Swappable extends Object3D {
  material?: Material | Material[];
}

/** Swap every mesh under `root` to its IR material; returns a function that restores them. */
export function swapToIr(root: Object3D): () => void {
  const swapped: [Swappable, Material | Material[]][] = [];
  root.traverse((o: Swappable) => {
    const ir = o.userData.irMaterial as Material | undefined;
    if (ir && o.material) {
      swapped.push([o, o.material]);
      o.material = ir;
    }
  });
  return () => {
    for (const [o, m] of swapped) o.material = m;
  };
}
