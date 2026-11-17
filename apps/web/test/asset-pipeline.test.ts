import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Realism plan R0: the pipeline's test model (scripts/assets/optimize.mjs) really is
// meshopt + KTX2, so the loaders in lib/assets are exercised by a real file.

/** The JSON chunk of a GLB (glTF 2.0 binary: 12-byte header, then chunk 0 = JSON). */
function glbJson(path: string): Record<string, unknown> {
  const b = readFileSync(path);
  expect(b.toString('ascii', 0, 4)).toBe('glTF');
  expect(b.readUInt32LE(4)).toBe(2);
  const len = b.readUInt32LE(12);
  expect(b.readUInt32LE(16)).toBe(0x4e4f534a); // 'JSON'
  return JSON.parse(b.toString('utf8', 20, 20 + len)) as Record<string, unknown>;
}

describe('asset pipeline test model', () => {
  const gltf = glbJson(
    resolve(import.meta.dirname, '../public/models/pipeline-test/quad-small.glb'),
  );

  it('uses meshopt geometry and Basis (KTX2) textures, both required', () => {
    for (const ext of ['EXT_meshopt_compression', 'KHR_texture_basisu']) {
      expect(gltf.extensionsUsed).toContain(ext);
      expect(gltf.extensionsRequired).toContain(ext);
    }
  });

  it('stores every image as KTX2', () => {
    const images = gltf.images as { mimeType?: string }[];
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) expect(img.mimeType).toBe('image/ktx2');
  });
});
