import type { Scenario, SessionMode, SimEvent } from '@vyuh/shared';
import {
  TICK_MS,
  replaySchedule,
  replayTo,
  type Heightmap,
  type ReplaySchedule,
  type SimSnapshot,
  type World,
} from '@vyuh/sim-core';
import { SimRuntime } from '@/lib/sim/runtime';

// AAR replay playback (Phase 4a Step 8): one SimRuntime re-running the logged
// commands, so the player's panels render it unchanged. Seeking restores the
// nearest keyframe at or before the target (one every 10 s of sim time, computed
// by the worker) and steps forward at most 200 ticks — never from t = 0.

export const KEYFRAME_MS = 10_000;
export const REPLAY_SPEEDS = [1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export class ReplayController {
  readonly runtime: SimRuntime;
  readonly schedule: ReplaySchedule;
  /** Sim time of the last stored event (the end of the session). */
  readonly endTMs: number;
  playing = false;
  speed: ReplaySpeed = 1;
  private keyframes: SimSnapshot[];

  constructor(
    scenario: Scenario,
    world: World | Heightmap,
    readonly events: readonly SimEvent[],
    mode: SessionMode,
    keyframes?: readonly SimSnapshot[],
  ) {
    this.runtime = new SimRuntime(scenario, world, mode);
    this.schedule = replaySchedule(events);
    this.endTMs = events.at(-1)?.tMs ?? 0;
    this.keyframes = keyframes ? [...keyframes] : [this.runtime.sim.snapshot()];
    // Playback through the runtime's own frame loop: logged commands go in just
    // before the tick that applied them; an operator abort ends at its tick.
    const { sim } = this.runtime;
    this.runtime.beforeTick = () => {
      const now = sim.getState().clock.tMs;
      if (this.schedule.abortAtTMs === now) {
        sim.end('ABORTED');
        return;
      }
      for (const cmd of this.schedule.byTick.get(now + TICK_MS) ?? []) sim.dispatch(cmd);
    };
  }

  get tMs(): number {
    return this.runtime.sim.getState().clock.tMs;
  }

  setKeyframes(keyframes: readonly SimSnapshot[]): void {
    this.keyframes = [...keyframes].sort((a, b) => a.tMs - b.tMs);
  }

  /** Jump to a sim time (snapped down to a tick, clamped to the session). */
  seek(target: number): void {
    const t = Math.max(0, Math.min(this.endTMs, Math.floor(target / TICK_MS) * TICK_MS));
    const { sim } = this.runtime;
    const cur = this.tMs;
    if (t < cur || t - cur > KEYFRAME_MS) {
      const kf = this.keyframes.filter((k) => k.tMs <= t).at(-1);
      if (kf && (t < cur || kf.tMs > cur)) sim.restore(kf, this.events);
    }
    replayTo(sim, this.schedule, t);
    this.runtime.afterJump();
  }

  /** One tick forward or back. */
  step(dir: 1 | -1): void {
    this.playing = false;
    this.seek(this.tMs + dir * TICK_MS);
  }

  /** Play for one display frame; returns the ticks run. Stops at the end. */
  advance(frameMs: number): number {
    if (!this.playing) return 0;
    const ticks = this.runtime.advance(frameMs * this.speed);
    // An abort is applied after the tick that reached it (as in the live session).
    if (this.schedule.abortAtTMs === this.tMs) this.runtime.sim.end('ABORTED');
    if (this.runtime.ended || this.tMs >= this.endTMs) this.playing = false;
    return ticks;
  }

  play(): void {
    if (this.tMs >= this.endTMs) this.seek(0);
    this.playing = true;
  }

  togglePlay(): void {
    if (this.playing) this.playing = false;
    else this.play();
  }

  setSpeed(speed: ReplaySpeed): void {
    this.speed = speed;
  }
}
