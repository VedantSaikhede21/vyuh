'use client';

import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { WebGLRenderer } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// Loaders for pipeline assets (realism plan R0, docs/assets.md): GLBs from
// scripts/assets/optimize.mjs carry meshopt geometry (EXT_meshopt_compression) and
// KTX2 / Basis textures (KHR_texture_basisu). Set up once here; every rendering
// asset loads through useAssetGltf. Plain GLBs (the contact models' WebP) load
// through it unchanged.
//
// The Basis transcoder (JS + WASM) is copied from three into public/basis/ by
// scripts/copy-decoders.ts before dev and build, so it always matches three's
// version. Production needs 'wasm-unsafe-eval' in the CSP script-src before a
// compressed asset ships in the player (next.config.ts; dev already allows eval).

export const BASIS_TRANSCODER_PATH = '/basis/';

/** One KTX2 loader per renderer: it runs a transcoder worker pool and must know the GPU's formats. */
const ktx2Loaders = new WeakMap<WebGLRenderer, KTX2Loader>();

export function ktx2LoaderFor(gl: WebGLRenderer): KTX2Loader {
  let loader = ktx2Loaders.get(gl);
  if (!loader) {
    loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH).detectSupport(gl);
    ktx2Loaders.set(gl, loader);
  }
  return loader;
}

/** Give a GLTFLoader the meshopt decoder and this renderer's KTX2 loader. */
export function configureGltfLoader(loader: GLTFLoader, gl: WebGLRenderer): void {
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2LoaderFor(gl));
}

/** drei's useGLTF (cached by URL, suspends) with the pipeline's decoders. */
export function useAssetGltf(url: string) {
  const gl = useThree((s) => s.gl);
  return useGLTF(url, false, false, (loader) =>
    configureGltfLoader(loader as unknown as GLTFLoader, gl),
  );
}
