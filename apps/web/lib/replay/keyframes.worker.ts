import type { Scenario, SessionMode, SimEvent } from '@vyuh/shared';
import { loadWorld } from '../terrain/load-world';
import { computeKeyframes } from './keyframes';

// Replays a session from t = 0 off the main thread (plan Step 8): keyframes every
// 10 s of sim time and the log check. Messages:
// in  { id, scenario, events, mode }
// out { id, progress } while running, then { id, result } or { id, error }.

export interface KeyframeRequest {
  id: number;
  scenario: Scenario;
  events: SimEvent[];
  mode: SessionMode;
}

/** The worker global, typed locally (the app's lib is DOM, not WebWorker). */
interface WorkerScope {
  onmessage: ((e: MessageEvent<KeyframeRequest>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e: MessageEvent<KeyframeRequest>) => {
  const { id, scenario, events, mode } = e.data;
  loadWorld(scenario.terrain.preset)
    .then((world) => {
      const result = computeKeyframes(scenario, world, events, mode, (progress) =>
        scope.postMessage({ id, progress }),
      );
      scope.postMessage({ id, result });
    })
    .catch((err: unknown) => {
      scope.postMessage({ id, error: err instanceof Error ? err.message : 'Replay failed' });
    });
};
