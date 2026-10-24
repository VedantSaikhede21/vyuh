import type { DopplerFamily } from '@vyuh/sim-core';
import { MICRO_DOPPLER_MIN_SNR_DB } from '@vyuh/sim-core';

// Micro-Doppler spectrogram view (SPEC §6.4): a pre-computed template per family
// (scripts/signatures/gen_spectrograms.py) scrolled in time with noise scaled by the
// track's SNR. The noise is drawn here, at render time, from its own small generator
// keyed to the track and the sim tick — never from the sim's RNG streams, so it cannot
// change the simulation, its log or a replay (decision 135).

export { MICRO_DOPPLER_MIN_SNR_DB };

export interface SignatureMeta {
  label: string;
  timeSpanS: number;
  dopplerMaxHz: number;
  cue: string;
  file: string;
}
export interface SignatureIndex {
  width: number;
  height: number;
  families: Record<DopplerFamily, SignatureMeta>;
}

/** Noise amplitude (0..1 of full scale) for an SNR: strong returns are clean. */
export function noiseAmplitude(snrDb: number): number {
  return Math.min(0.6, Math.max(0.05, 1.3 * 10 ** (-snrDb / 20)));
}

/** Small deterministic generator (mulberry32) for render-only noise. */
export function noiseStream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Compose one frame into `out` (RGBA, w × h): the template scrolled to `tMs`, scaled
 * by the signal share, plus noise. `template` holds one grey byte per pixel.
 */
export function composeFrame(
  template: Uint8Array,
  w: number,
  h: number,
  meta: Pick<SignatureMeta, 'timeSpanS'>,
  snrDb: number,
  tMs: number,
  seed: number,
  out: Uint8ClampedArray,
): void {
  const amp = noiseAmplitude(snrDb);
  const gain = 1 - 0.6 * amp;
  const shift = Math.floor(((tMs / 1000 / meta.timeSpanS) * w) % w);
  // A new noise field every sim tick (50 ms), the same for the same tick.
  const rnd = noiseStream(seed ^ Math.floor(tMs / 50));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = template[y * w + ((x + shift) % w)]!;
      const v = src * gain + rnd() * 255 * amp;
      const i = (y * w + x) * 4;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
}
