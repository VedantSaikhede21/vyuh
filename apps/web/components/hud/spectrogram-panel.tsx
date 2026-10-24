'use client';

import type { DopplerFamily } from '@vyuh/sim-core';
import { useEffect, useRef, useState } from 'react';
import { StatusNotice } from '@/components/hud/primitives';
import {
  MICRO_DOPPLER_MIN_SNR_DB,
  composeFrame,
  hashId,
  type SignatureIndex,
} from '@/lib/hud/spectrogram';
import { useHudStore } from '@/lib/sim/store';

// Spectrogram tab (SPEC §6.4): the selected radar track's micro-Doppler, when its SNR
// is high enough. Grey only — brightness is return power; no colour map to decode.

type Loaded = { index: SignatureIndex; pixels: Record<DopplerFamily, Uint8Array> };
let cache: Promise<Loaded> | null = null;

async function decode(src: string, w: number, h: number): Promise<Uint8Array> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < grey.length; i++) grey[i] = rgba[i * 4]!;
  return grey;
}

function loadSignatures(): Promise<Loaded> {
  cache ??= (async () => {
    const res = await fetch('/signatures/signatures.json');
    if (!res.ok) throw new Error(`signatures.json: HTTP ${res.status}`);
    const index = (await res.json()) as SignatureIndex;
    const families = Object.keys(index.families) as DopplerFamily[];
    const decoded = await Promise.all(
      families.map((f) =>
        decode(`/signatures/${index.families[f].file}`, index.width, index.height),
      ),
    );
    return {
      index,
      pixels: Object.fromEntries(families.map((f, i) => [f, decoded[i]!])) as Record<
        DopplerFamily,
        Uint8Array
      >,
    };
  })();
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

const kHz = (hz: number) =>
  hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 ? 1 : 0)} kHz` : `${hz} Hz`;
const ms = (s: number) => (s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(1)} s`);

export function SpectrogramPanel() {
  const track = useHudStore((s) => {
    const h = s.hud;
    const t = h?.tracks.find((x) => x.id === h.selectedTrackId);
    return t && t.status === 'ACTIVE' ? t : null;
  });
  const tMs = useHudStore((s) => s.hud?.tMs ?? 0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<ImageData | null>(null);

  useEffect(() => {
    let live = true;
    loadSignatures()
      .then((l) => live && setLoaded(l))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'load failed'));
    return () => {
      live = false;
    };
  }, []);

  const strong = track !== null && track.snrDb >= MICRO_DOPPLER_MIN_SNR_DB;
  useEffect(() => {
    if (!loaded || !track || !strong) return;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { width: w, height: h } = loaded.index;
    if (!frame.current || frame.current.width !== w) frame.current = ctx.createImageData(w, h);
    composeFrame(
      loaded.pixels[track.doppler],
      w,
      h,
      loaded.index.families[track.doppler],
      track.snrDb,
      tMs,
      hashId(track.id),
      frame.current.data,
    );
    ctx.putImageData(frame.current, 0, 0);
  }, [loaded, track, strong, tMs]);

  if (!track) {
    return (
      <StatusNotice title="No radar track selected.">
        Select a track (Tab) to see its micro-Doppler: rotor blades give regular vertical flashes, a
        bird a slow ripple close to the centre line.
      </StatusNotice>
    );
  }
  if (!strong) {
    return (
      <StatusNotice title={`${track.id}: return too weak for micro-Doppler.`}>
        SNR <span className="font-mono tnum">{Math.round(track.snrDb)}</span> dB, needs{' '}
        <span className="font-mono tnum">{MICRO_DOPPLER_MIN_SNR_DB}</span> dB. It strengthens as the
        track closes.
      </StatusNotice>
    );
  }
  if (error)
    return <StatusNotice tone="error" title={`Spectrogram templates did not load: ${error}`} />;
  if (!loaded) return <p className="p-3 text-label">LOADING SIGNATURES</p>;
  const meta = loaded.index.families[track.doppler];
  return (
    <div className="flex h-full flex-col gap-1 p-2" data-testid="spectrogram">
      <p className="flex flex-wrap gap-x-3 text-label">
        <span className="text-text-1">{track.id}</span>
        <span>
          SNR <span className="font-mono tnum text-text-1">{Math.round(track.snrDb)}</span>
          <span className="text-text-3"> dB</span>
        </span>
        <span>
          Doppler <span className="font-mono tnum text-text-1">±{kHz(meta.dopplerMaxHz)}</span>
        </span>
        <span>
          Span <span className="font-mono tnum text-text-1">{ms(meta.timeSpanS)}</span>
        </span>
      </p>
      <div className="grid min-h-0 flex-1 grid-cols-[2.75rem_1fr] grid-rows-[1fr_auto] gap-x-1">
        <div className="flex flex-col justify-between py-0.5 text-right font-mono text-[11px] text-text-3">
          <span>+{kHz(meta.dopplerMaxHz)}</span>
          <span>0</span>
          <span>−{kHz(meta.dopplerMaxHz)}</span>
        </div>
        <canvas
          ref={canvas}
          width={loaded.index.width}
          height={loaded.index.height}
          className="h-full min-h-0 w-full border border-line-1 [image-rendering:pixelated]"
          role="img"
          aria-label={`Micro-Doppler spectrogram of ${track.id}, SNR ${Math.round(track.snrDb)} dB`}
        />
        <span />
        <p className="flex justify-between font-mono text-[11px] text-text-3">
          <span>time →</span>
          <span>{ms(meta.timeSpanS)}</span>
        </p>
      </div>
      <p className="text-small text-text-2">
        Regular vertical flashes: rotor or propeller blades. Slow ripple near 0, no flashes:
        wingbeat.
      </p>
    </div>
  );
}
