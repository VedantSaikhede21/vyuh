'use client';

import type { Scenario, Score, SessionMode } from '@vyuh/shared';
import { PROCEDURAL_HILLS, createProceduralTerrain } from '@vyuh/sim-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, isRetryable } from '@/lib/api';
import { EventBatcher, FatalBatchError } from './event-batcher';
import { SimRuntime } from './runtime';

// Session lifecycle in the browser (SPEC §4.5 / §11.1): load → briefing → run →
// drain events → complete (server scores) → result.

export type Phase =
  | { kind: 'loading' }
  | { kind: 'briefing'; scenario: Scenario; mode: SessionMode }
  | { kind: 'running'; runtime: SimRuntime }
  | { kind: 'submitting'; runtime: SimRuntime }
  | { kind: 'result'; score: Score; scenarioName: string }
  | { kind: 'interrupted' }
  | { kind: 'error'; message: string; retry?: () => void };

function loadTerrain(preset: string) {
  if (preset !== PROCEDURAL_HILLS) throw new Error(`Terrain preset ${preset} is not available yet`);
  return createProceduralTerrain();
}

function gpuName(): string | undefined {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext && gl ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : undefined;
    return typeof name === 'string' ? name.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

function message(err: unknown): string {
  if (err instanceof FatalBatchError && err.cause instanceof ApiError) return err.cause.message;
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function useTrainingSession(sessionId: string) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [upload, setUpload] = useState('');
  const batcherRef = useRef<EventBatcher | null>(null);
  const frames = useRef({ count: 0, ms: 0 });

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const session = await api.getSession(sessionId, ctrl.signal);
      if (session.status === 'COMPLETED' && session.score) {
        setPhase({ kind: 'result', score: session.score, scenarioName: session.scenarioName });
        return;
      }
      if (session.status !== 'CREATED') {
        setPhase({ kind: 'interrupted' });
        return;
      }
      const detail = await api.getScenario(session.scenarioId, ctrl.signal);
      setPhase({ kind: 'briefing', scenario: detail.scenario, mode: session.mode });
    })().catch((err: unknown) => {
      if (!ctrl.signal.aborted) setPhase({ kind: 'error', message: message(err) });
    });
    return () => ctrl.abort();
  }, [sessionId]);

  useEffect(() => () => batcherRef.current?.stop(), []);

  const start = useCallback(() => {
    if (phase.kind !== 'briefing') return;
    try {
      const runtime = new SimRuntime(
        phase.scenario,
        loadTerrain(phase.scenario.terrain.preset),
        phase.mode,
      );
      const batcher = new EventBatcher({
        send: async (seq, events) => {
          await api.postEvents(sessionId, seq, events);
        },
        getEvents: () => runtime.sim.getEvents(),
        isRetryable,
        onStatus: (s) =>
          setUpload(
            s.error
              ? `Upload error: ${s.error}`
              : s.retrying
                ? 'Upload retrying…'
                : `Synced ${s.sentEvents}`,
          ),
      });
      batcher.start();
      batcherRef.current = batcher;
      frames.current = { count: 0, ms: 0 };
      setPhase({ kind: 'running', runtime });
    } catch (err) {
      setPhase({ kind: 'error', message: message(err) });
    }
  }, [phase, sessionId]);

  /** Drain events, then ask the server to score. Retry re-runs the whole step. */
  const submit = useCallback(
    (runtime: SimRuntime) => {
      const run = async (): Promise<void> => {
        setPhase({ kind: 'submitting', runtime });
        try {
          await batcherRef.current?.finish();
          const { count, ms } = frames.current;
          const gpu = gpuName();
          const score = await api.completeSession(sessionId, runtime.sim.getState().clock.tMs, {
            ...(ms > 0 ? { avgFps: Math.round((count / ms) * 1000 * 10) / 10 } : {}),
            ...(gpu ? { gpu } : {}),
            browser: navigator.userAgent.slice(0, 200),
          });
          setPhase({ kind: 'result', score, scenarioName: runtime.scenario.name });
        } catch (err) {
          setPhase({ kind: 'error', message: message(err), retry: () => void run() });
        }
      };
      void run();
    },
    [sessionId],
  );

  const finish = useCallback(() => {
    if (phase.kind === 'running') submit(phase.runtime);
  }, [phase, submit]);

  /** Called by the frame loop with each frame's duration, for the FPS report. */
  const recordFrame = useCallback((ms: number) => {
    frames.current.count += 1;
    frames.current.ms += ms;
  }, []);

  return { phase, upload, start, finish, recordFrame };
}
