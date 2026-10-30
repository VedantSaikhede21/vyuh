import type { Heightmap } from '@vyuh/sim-core';
import { useEffect, useState } from 'react';
import type { DataTexture } from 'three';
import type { EnvironmentLook } from '@/lib/sim/environment-look';
import { shadowTexture } from './display';
import type { ShadowInput } from './shadow';

/**
 * Bake the sun-shadow mask for this view's sun in a worker. Sim time moves the
 * sun about 2° in the longest sessions, so one bake per view holds. Null until
 * ready, when the sun isn't lighting the view, at px 0, or where workers fail.
 */
export function useShadowMask(
  map: Heightmap,
  look: EnvironmentLook,
  px: number,
): DataTexture | null {
  const [baked, setBaked] = useState<{ key: string; texture: DataTexture } | null>(null);
  const on = px > 0 && look.shadowStrength > 0;
  const [sx, sy, sz] = look.trueSunDir;
  const key = `${px}:${sx}:${sy}:${sz}`;
  useEffect(() => {
    if (!on) return;
    const worker = new Worker(new URL('./shadow-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Uint8Array<ArrayBuffer>>) => {
      setBaked({ key, texture: shadowTexture(e.data, px) });
      worker.terminate();
    };
    worker.onerror = () => worker.terminate();
    const job: ShadowInput = {
      heights: map.heights,
      resolution: map.resolution,
      sizeM: map.sizeM,
      // Three.js z is −north.
      sun: { x: sx, y: sy, z: -sz },
      outPx: px,
    };
    worker.postMessage(job);
    return () => worker.terminate();
  }, [map, on, key, px, sx, sy, sz]);
  return on && baked?.key === key ? baked.texture : null;
}
