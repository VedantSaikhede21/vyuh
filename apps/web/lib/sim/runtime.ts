import type { Scenario, SessionMode } from '@vyuh/shared';
import {
  TICK_MS,
  createSim,
  createWorld,
  isWorld,
  sampleHeight,
  type Heightmap,
  type Sim,
  type SimCommand,
  type Vec3,
  type World,
} from '@vyuh/sim-core';

// Drives sim-core from display frames (SPEC §3.1): a fixed 20 Hz tick from an
// accumulator, plus the previous tick's positions so the renderer can
// interpolate. Rendering and the HUD only read from here.

/** A frame gap above this is treated as a stall (e.g. a background tab), not sim time. */
export const MAX_FRAME_MS = 250;

export class SimRuntime {
  readonly sim: Sim;
  readonly world: World;
  readonly terrain: Heightmap;
  readonly scenario: Scenario;
  readonly mode: SessionMode;
  /** Contact positions before the most recent tick, by contact id. */
  readonly prevPositions = new Map<string, Vec3>();
  /** Sim camera pointing before the most recent tick (a locked camera moves every tick). */
  readonly prevCamera = { azDeg: 0, elDeg: 0 };
  /** Fraction of a tick elapsed since the last one, for interpolation. */
  alpha = 0;
  paused = false;
  private accumulatorMs = 0;

  constructor(scenario: Scenario, world: World | Heightmap, mode: SessionMode) {
    this.scenario = scenario;
    this.world = isWorld(world) ? world : createWorld(world);
    this.terrain = this.world.heightmap;
    this.mode = mode;
    this.sim = createSim(scenario, this.world, { mode });
    this.capturePositions();
  }

  get ended(): boolean {
    return this.sim.getState().endReason !== null;
  }

  /** Pause is a practice-mode aid (SPEC §15); assessments run on a fixed clock. */
  setPaused(paused: boolean): void {
    if (this.mode === 'PRACTICE') this.paused = paused;
  }

  /** Advance by a frame's elapsed wall time; returns the number of ticks run. */
  advance(frameMs: number): number {
    if (this.paused || this.ended) return 0;
    this.accumulatorMs += Math.min(Math.max(frameMs, 0), MAX_FRAME_MS);
    let ticks = 0;
    while (this.accumulatorMs >= TICK_MS && !this.ended) {
      this.capturePositions();
      this.sim.tick();
      this.accumulatorMs -= TICK_MS;
      ticks++;
    }
    this.alpha = this.ended ? 1 : this.accumulatorMs / TICK_MS;
    return ticks;
  }

  dispatch(cmd: SimCommand): ReturnType<Sim['dispatch']> {
    return this.sim.dispatch(cmd);
  }

  /** Interpolated contact position (scenario frame) for rendering. */
  contactPosition(id: string, out: Vec3): Vec3 | null {
    const contact = this.sim.getState().contacts.find((c) => c.id === id);
    if (!contact) return null;
    const prev = this.prevPositions.get(id) ?? contact.pos;
    const a = this.alpha;
    out.x = prev.x + (contact.pos.x - prev.x) * a;
    out.y = prev.y + (contact.pos.y - prev.y) * a;
    out.z = prev.z + (contact.pos.z - prev.z) * a;
    return out;
  }

  /** Interpolated sim camera pointing, for rendering a locked camera smoothly. */
  cameraPointing(): { azDeg: number; elDeg: number } {
    const cam = this.sim.getState().camera;
    const dAz = ((((cam.azDeg - this.prevCamera.azDeg) % 360) + 540) % 360) - 180;
    const az = (this.prevCamera.azDeg + dAz * this.alpha + 360) % 360;
    return {
      azDeg: az,
      elDeg: this.prevCamera.elDeg + (cam.elDeg - this.prevCamera.elDeg) * this.alpha,
    };
  }

  groundHeight(x: number, z: number): number {
    return sampleHeight(this.terrain, x, z);
  }

  private capturePositions(): void {
    const cam = this.sim.getState().camera;
    this.prevCamera.azDeg = cam.azDeg;
    this.prevCamera.elDeg = cam.elDeg;
    for (const c of this.sim.getState().contacts) {
      const p = this.prevPositions.get(c.id);
      if (p) {
        p.x = c.pos.x;
        p.y = c.pos.y;
        p.z = c.pos.z;
      } else {
        this.prevPositions.set(c.id, { ...c.pos });
      }
    }
  }
}
