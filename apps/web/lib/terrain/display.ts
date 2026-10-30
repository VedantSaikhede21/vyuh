import type { TerrainPresetMeta } from '@vyuh/shared';
import type { Heightmap } from '@vyuh/sim-core';
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  RedFormat,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import { presetFileUrl } from './load-world';
import { normalBytes } from './normals';

// Display-only terrain textures (terrain plan T1, T2). They stream in after the
// sim has started; the sim never waits for them or reads them. A failed texture
// leaves the procedural look.

export interface TerrainTextures {
  normal: DataTexture;
  detail: Texture | null;
  albedo: Texture | null;
  cover: Texture | null;
  ao: Texture | null;
}

const DETAIL_URL = '/terrain/_detail/detail.png';
const loader = new TextureLoader();
const cache = new WeakMap<Heightmap, Promise<TerrainTextures>>();

function load(url: string): Promise<Texture | null> {
  return loader.loadAsync(url).catch(() => null);
}

function presetTexture(meta: TerrainPresetMeta, file: string | undefined): Promise<Texture | null> {
  if (!file) return Promise.resolve(null);
  const v = meta.displayHash ? `?v=${meta.displayHash}` : '';
  return load(`${presetFileUrl(meta.name, file)}${v}`).then((t) => {
    if (t) {
      t.wrapS = ClampToEdgeWrapping;
      t.wrapT = ClampToEdgeWrapping;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = 4;
    }
    return t;
  });
}

function makeNormal(map: Heightmap): DataTexture {
  const tex = new DataTexture(
    normalBytes(map.heights, map.resolution, map.sizeM),
    map.resolution,
    map.resolution,
    RGBAFormat,
  );
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** One set per heightmap, shared by the tactical and EO views. */
export function terrainTextures(
  map: Heightmap,
  meta: TerrainPresetMeta | undefined,
): Promise<TerrainTextures> {
  const cached = cache.get(map);
  if (cached) return cached;
  const job = Promise.all([
    load(DETAIL_URL),
    meta ? presetTexture(meta, meta.files.albedo) : Promise.resolve(null),
    meta ? presetTexture(meta, meta.files.cover) : Promise.resolve(null),
    meta ? presetTexture(meta, meta.files.ao) : Promise.resolve(null),
  ]).then(([detail, albedo, cover, ao]) => {
    if (detail) {
      detail.wrapS = RepeatWrapping;
      detail.wrapT = RepeatWrapping;
      detail.anisotropy = 4;
    }
    if (albedo) albedo.colorSpace = SRGBColorSpace;
    return { normal: makeNormal(map), detail, albedo, cover, ao };
  });
  cache.set(map, job);
  return job;
}

/** Shadow mask as a single-channel texture, row 0 = south. */
export function shadowTexture(mask: Uint8Array<ArrayBuffer>, px: number): DataTexture {
  const tex = new DataTexture(mask, px, px, RedFormat);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
