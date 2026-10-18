'use client';

import type { Scenario, Score, SessionEndReason, SessionMode } from '@vyuh/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, isRetryable } from '@/lib/api';
import { loadWorld } from '@/lib/terrain/load-world';
import { EventBatcher, FatalBatchError, type BatcherStatus } from './event-batcher';
import { SimRuntime } from './runtime';

// Session lifecycle in the browser (SPEC §4.5 / §11.1): load → briefing → run →
// drain events → complete (server scores) → result.

export type Phase =
  | { kind: 'loading' }
  | { kind: 'briefing'; scenario: Scenario; mode: SessionMode }
  | { kind: 'preparing' }
  | { kind: 'running'; runtime: SimRuntime }
  | { kind: 'submitting'; runtime: SimRuntime }
  | {
      kind: 'result';
      score: Score;
      scenarioName: string;
      /** DB id of the scenario, for Retry / Next. */
      scenarioId: string;
      mode: SessionMode;
      /** How the run ended (after a reload, from the stored SESSION_ENDED event). */
      ended: { reason: SessionEndReason; tMs: number } | null;
    }
  | { kind: 'interrupted' }
  | { kind: 'error'; message: string; retry?: () => void };

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
  const [upload, setUpload] = useState<BatcherStatus | null>(null);
  const batcherRef = useRef<EventBatcher | null>(null);
  const frames = useRef({ count: 0, ms: 0 });
  const meta = useRef<{ scenarioId: string; mode: SessionMode } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const session = await api.getSession(sessionId, ctrl.signal);
      meta.current = { scenarioId: session.scenarioId, mode: session.mode };
      if (session.status === 'COMPLETED' && session.score) {
        setPhase({
          kind: 'result',
          score: session.score,
          scenarioName: session.scenarioName,
          scenarioId: session.scenarioId,
          mode: session.mode,
          ended: session.ended,
        });
        return;
      }
      if (session.status !== 'CREATED') {
        setPhase({ kind: 'interrupted' });
        return;
      }
      const detail = await api.getScenario(session.scenarioId, ctrl.signal);
      // Prefetch the terrain preset while the trainee reads the briefing.
      loadWorld(detail.scenario.terrain.preset).catch(() => undefined);
      setPhase({ kind: 'briefing', scenario: detail.scenario, mode: session.mode });
    })().catch((err: unknown) => {
      if (!ctrl.signal.aborted) setPhase({ kind: 'error', message: message(err) });
    });
    return () => ctrl.abort();
  }, [sessionId]);

  useEffect(() => () => batcherRef.current?.stop(), []);

  const start = useCallback(async () => {
    if (phase.kind !== 'briefing') return;
    const briefing = phase;
    setPhase({ kind: 'preparing' });
    try {
      const world = await loadWorld(briefing.scenario.terrain.preset);
      const runtime = new SimRuntime(briefing.scenario, world, briefing.mode);
      const batcher = new EventBatcher({
        send: async (seq, events) => {
          await api.postEvents(sessionId, seq, events);
        },
        getEvents: () => runtime.sim.getEvents(),
        isRetryable,
        onStatus: setUpload,
      });
      batcher.start();
      batcherRef.current = batcher;
      frames.current = { count: 0, ms: 0 };
      setPhase({ kind: 'running', runtime });
    } catch (err) {
      // e.g. the terrain failed to download: let the trainee try again from the briefing.
      setPhase({ kind: 'error', message: message(err), retry: () => setPhase(briefing) });
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
          const st = runtime.sim.getState();
          setPhase({
            kind: 'result',
            score,
            scenarioName: runtime.scenario.name,
            scenarioId: meta.current?.scenarioId ?? '',
            mode: runtime.mode,
            ended: st.endReason ? { reason: st.endReason, tMs: st.clock.tMs } : null,
          });
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
