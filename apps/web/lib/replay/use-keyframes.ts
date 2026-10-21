'use client';

import type { AarSessionResponse } from '@vyuh/shared';
import { useEffect, useState } from 'react';
import type { KeyframeResult } from './keyframes';

// Keyframes and the log check from the Web Worker (Phase 4a Step 8). The worker
// ends when it is done, so its copy of the terrain is freed.

export type KeyframeState =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; result: KeyframeResult }
  | { status: 'error'; message: string };

type Reply =
  | { id: number; progress: number }
  | { id: number; result: KeyframeResult }
  | { id: number; error: string };

export function useKeyframes(data: AarSessionResponse | null): KeyframeState {
  // State is kept per request, so a new session starts at "running 0 %" without a reset.
  const [state, setState] = useState<{ for: AarSessionResponse; st: KeyframeState } | null>(null);
  useEffect(() => {
    if (!data) return;
    const worker = new Worker(new URL('./keyframes.worker.ts', import.meta.url), {
      type: 'module',
    });
    const put = (st: KeyframeState) => setState({ for: data, st });
    worker.onmessage = (e: MessageEvent<Reply>) => {
      const r = e.data;
      if ('progress' in r) put({ status: 'running', progress: r.progress });
      else if ('result' in r) {
        put({ status: 'done', result: r.result });
        worker.terminate();
      } else {
        put({ status: 'error', message: r.error });
        worker.terminate();
      }
    };
    worker.postMessage({
      id: 1,
      scenario: data.scenario,
      events: data.events,
      mode: data.session.mode,
    });
    return () => worker.terminate();
  }, [data]);
  if (!data) return { status: 'idle' };
  return state?.for === data ? state.st : { status: 'running', progress: 0 };
}
