'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoverageAltitude, SensorSite } from './coverage';

// Briefing LOS coverage from the Web Worker, computed lazily per altitude and
// cached for the page's lifetime (plan answer 12).

export type CoverageState =
  | { status: 'loading'; progress: number }
  | { status: 'ready'; grids: Uint8Array[] }
  | { status: 'error'; message: string };

type Reply =
  | { id: number; progress: number }
  | { id: number; grids: Uint8Array[] }
  | { id: number; error: string };

export function useCoverage(
  preset: string | null,
  sites: readonly SensorSite[],
  altitude: CoverageAltitude,
): CoverageState {
  const worker = useRef<Worker | null>(null);
  const cache = useRef(new Map<string, Uint8Array[]>());
  const seq = useRef(0);
  const [state, setState] = useState<CoverageState>({ status: 'loading', progress: 0 });

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  const sitesKey = JSON.stringify(sites);
  useEffect(() => {
    if (!preset) return;
    const key = `${preset}|${sitesKey}|${altitude}`;
    const hit = cache.current.get(key);
    if (hit) {
      setState({ status: 'ready', grids: hit });
      return;
    }
    worker.current ??= new Worker(new URL('./coverage.worker.ts', import.meta.url), {
      type: 'module',
    });
    const w = worker.current;
    const id = ++seq.current;
    setState({ status: 'loading', progress: 0 });
    const onMessage = (e: MessageEvent<Reply>) => {
      const r = e.data;
      if (r.id !== id) return;
      if ('progress' in r) setState({ status: 'loading', progress: r.progress });
      else if ('grids' in r) {
        cache.current.set(key, r.grids);
        setState({ status: 'ready', grids: r.grids });
      } else setState({ status: 'error', message: r.error });
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, preset, sites: JSON.parse(sitesKey) as SensorSite[], aglM: altitude });
    return () => w.removeEventListener('message', onMessage);
  }, [preset, sitesKey, altitude]);

  return state;
}
