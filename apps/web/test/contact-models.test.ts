import fs from 'node:fs';
import path from 'node:path';
import { ContactClass } from '@vyuh/shared';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  frameWeights,
  MODEL_FOR,
  MODEL_IDS,
  MODEL_SPECS,
  prepareModel,
} from '@/lib/sim/contact-models';

const MODELS_DIR = path.join(__dirname, '..', 'public', 'models');

describe('contact models: files and mapping', () => {
  it('every contact class has a model with a spec', () => {
    for (const cls of ContactClass.options) {
      const id = MODEL_FOR[cls];
      expect(MODEL_IDS).toContain(id);
      expect(MODEL_SPECS[id]).toBeDefined();
    }
  });

  it('every model file is committed and small enough for unit PCs', () => {
    let total = 0;
    for (const id of MODEL_IDS) {
      const file = path.join(MODELS_DIR, `${id}.glb`);
      expect(fs.existsSync(file), `${id}.glb`).toBe(true);
      const size = fs.statSync(file).size;
      expect(size, `${id}.glb size`).toBeLessThan(400 * 1024);
      total += size;
    }
    expect(total).toBeLessThan(1.6 * 1024 * 1024);
  });

  it('blur discs sit inside the normalised model', () => {
    for (const id of MODEL_IDS) {
      for (const d of MODEL_SPECS[id].discs ?? []) {
        for (const c of d.at) expect(Math.abs(c)).toBeLessThanOrEqual(0.5);
        expect(d.radius).toBeGreaterThan(0);
        expect(d.radius).toBeLessThanOrEqual(0.5);
      }
    }
  });
});

describe('frameWeights', () => {
  it('holds one frame at a whole frame step', () => {
    expect(frameWeights(0, 4, [])).toEqual([1, 0, 0, 0]);
    expect(frameWeights(0.25, 4, [])).toEqual([0, 1, 0, 0]);
  });

  it('blends two neighbours and wraps from the last frame to the first', () => {
    const w = frameWeights(0.875, 4, []);
    expect(w[3]).toBeCloseTo(0.5);
    expect(w[0]).toBeCloseTo(0.5);
    expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });

  it('accepts negative and large phases', () => {
    expect(frameWeights(-0.75, 4, [])).toEqual(frameWeights(0.25, 4, []));
    expect(frameWeights(7.5, 4, [])).toEqual(frameWeights(0.5, 4, []));
  });

  it('is empty with no frames', () => {
    expect(frameWeights(0.3, 0, [])).toEqual([]);
  });
});

/** A 4 m long body off the origin, nose toward +z, with a rotor node on top. */
function syntheticScene() {
  const scene = new Group();
  const mat = new MeshStandardMaterial({ name: 'hull' });
  const body = new Mesh(new BoxGeometry(1, 1, 4), mat);
  body.position.set(10, 5, 2);
  const rotorNode = new Group();
  rotorNode.name = 'rotor';
  rotorNode.position.set(10, 5.6, 3);
  rotorNode.add(new Mesh(new BoxGeometry(2, 0.1, 0.2), mat));
  scene.add(body, rotorNode);
  return scene;
}

describe('prepareModel', () => {
  const spec = {
    rotationDeg: [0, 180, 0] as const,
    spin: [{ node: 'rotor', axis: 'y' as const, revPerS: 2 }],
  };

  it('centres the model and scales its largest dimension to 1', () => {
    const m = prepareModel(syntheticScene(), spec);
    m.body.geometry.computeBoundingBox();
    m.spinners[0]!.geometry.computeBoundingBox();
    const box = m.body.geometry.boundingBox!.clone().union(m.spinners[0]!.geometry.boundingBox!);
    const size = box.getSize(new Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1, 5);
    const c = box.getCenter(new Vector3());
    expect(c.length()).toBeLessThan(1e-6);
  });

  it('turns the nose to −z', () => {
    const m = prepareModel(syntheticScene(), spec);
    // The rotor sat 1 m toward the old nose (+z); after the 180° turn it is toward −z.
    expect(m.spinners[0]!.pivot.z).toBeLessThan(0);
  });

  it('splits spinning parts out with their own pivot and axis', () => {
    const m = prepareModel(syntheticScene(), spec);
    expect(m.spinners).toHaveLength(1);
    const s = m.spinners[0]!;
    expect(s.revPerS).toBe(2);
    expect(s.axis.toArray()).toEqual([0, 1, 0]);
    // Pivot at the rotor's centre: above the body's centre line.
    expect(s.pivot.y).toBeGreaterThan(0);
    // The body no longer contains the rotor's triangles (box = 12 triangles).
    expect(m.body.geometry.index!.count / 3).toBe(12);
  });

  it('keeps one material group per source material and no morph frames without a clip', () => {
    const m = prepareModel(syntheticScene(), { rotationDeg: [0, 0, 0], bakeFrames: 8 });
    expect(m.frames).toBe(0);
    expect(m.body.materials).toHaveLength(1);
    expect(m.body.geometry.groups).toHaveLength(1);
    expect(m.body.geometry.morphAttributes.position).toBeUndefined();
  });
});
