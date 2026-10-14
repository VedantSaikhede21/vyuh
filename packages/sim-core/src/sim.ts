import {
  TraineeEventType,
  type ContactSpec,
  type RadarSensor,
  type Roe,
  type Scenario,
  type SessionEndReason,
  type SessionMode,
  type SimEvent,
} from '@vyuh/shared';
import { TICK_MS, TICK_S, advanceClock, ceilToTick, createClock, type SimClock } from './clock.ts';
import { createContactState, stepContact, type ContactState } from './contacts.ts';
import { bearingDeg, headingVector, horizontalRange, type Vec3 } from './coords.ts';
import { createEffectorState, resolveIntercept, type EffectorState } from './effectors.ts';
import {
  appendEvent,
  createEventLog,
  type DistributiveOmit,
  type EventDraft,
  type TraineeEvent,
} from './events.ts';
import { createRng, type RandomStream } from './rng.ts';
import { radarScan } from './sensors/radar.ts';
import { sampleHeight, type Heightmap } from './terrain.ts';
import {
  createScanHistory,
  formatTrackId,
  recordScan,
  type ScanHistory,
  type TrackState,
} from './tracks.ts';

// Public sim API (SPEC §5): createSim, tick, dispatch, getState, getEvents.
// Per tick: advance clock → apply queued commands → move contacts → sensor
// scans → end checks. Everything iterates in id order (SPEC §3.4).

/** A trainee command = a trainee event without seq / tMs (applied on the next tick). */
export type SimCommand = DistributiveOmit<TraineeEvent, 'seq' | 'tMs'>;

export type DispatchResult = { ok: true } | { ok: false; reason: string };

export interface CameraState {
  azDeg: number;
  elDeg: number;
  zoom: number;
}

export interface SimState {
  readonly scenarioId: string;
  readonly roe: Roe;
  readonly durationMs: number;
  clock: SimClock;
  endReason: SessionEndReason | null;
  /** Ground truth, sorted by id. Rendering may read it; the HUD shows tracks. */
  readonly contacts: ContactState[];
  /** In creation order (T001, T002, …). */
  readonly tracks: TrackState[];
  readonly effectors: EffectorState[];
  /** Sensor positions in the scenario frame (y = terrain + mast height). */
  readonly sensorPositions: Readonly<Record<string, Vec3>>;
  selectedTrackId: string | null;
  camera: CameraState;
}

export interface Sim {
  /** Advance one 50 ms tick. No-op after the session has ended. */
  tick(): void;
  /** Queue a trainee command for the next tick. */
  dispatch(cmd: SimCommand): DispatchResult;
  /** End the session now (e.g. trainee aborts). */
  end(reason: SessionEndReason): void;
  /** Live state — treat as read-only. */
  getState(): Readonly<SimState>;
  getEvents(): readonly SimEvent[];
}

export interface SimOptions {
  mode?: SessionMode;
}

const TRAINEE_TYPES: ReadonlySet<string> = new Set(TraineeEventType.options);

/** Replay helper: the command that produced a logged trainee event, or null. */
export function commandFromEvent(ev: SimEvent): SimCommand | null {
  if (!TRAINEE_TYPES.has(ev.type)) return null;
  const cmd: Partial<TraineeEvent> = { ...(ev as TraineeEvent) };
  delete cmd.seq;
  delete cmd.tMs;
  return cmd as SimCommand;
}

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function createSim(scenario: Scenario, terrain: Heightmap, opts: SimOptions = {}): Sim {
  const rng = createRng(scenario.seed);
  const effectorStream: RandomStream = rng.stream('effectors');
  const log = createEventLog();
  const specs = new Map<string, ContactSpec>(scenario.contacts.map((c) => [c.id, c]));
  const assets = [...scenario.assets].sort(byId);
  const radars = scenario.sensors
    .filter((s): s is RadarSensor => s.kind === 'RADAR')
    .sort(byId)
    .map((cfg) => ({
      cfg,
      stream: rng.stream(`radar:${cfg.id}`),
      scanMs: Math.max(TICK_MS, ceilToTick(cfg.scanPeriodS * 1000)),
    }));
  const sensorPositions: Record<string, Vec3> = {};
  for (const s of scenario.sensors) {
    sensorPositions[s.id] = { x: s.x, y: sampleHeight(terrain, s.x, s.z) + s.y, z: s.z };
  }
  const histories = new Map<string, ScanHistory>();
  let nextTrackNo = 1;
  const queue: SimCommand[] = [];

  const state: SimState = {
    scenarioId: scenario.id,
    roe: scenario.roe,
    durationMs: scenario.durationS * 1000,
    clock: createClock(),
    endReason: null,
    contacts: [...scenario.contacts].sort(byId).map(createContactState),
    tracks: [],
    effectors: [...scenario.effectors]
      .sort(byId)
      .map((e) => createEffectorState(e, sampleHeight(terrain, e.x, e.z))),
    sensorPositions,
    selectedTrackId: null,
    camera: { azDeg: 0, elDeg: 0, zoom: 1 },
  };
  const contactsById = new Map(state.contacts.map((c) => [c.id, c]));
  const tracksById = new Map<string, TrackState>();

  const emit = (draft: EventDraft): SimEvent => appendEvent(log, draft);

  emit({
    tMs: 0,
    type: 'SESSION_STARTED',
    payload: { mode: opts.mode ?? 'PRACTICE', scenarioId: scenario.id, seed: scenario.seed },
  });

  function endSession(reason: SessionEndReason): void {
    if (state.endReason !== null) return;
    state.endReason = reason;
    emit({ tMs: state.clock.tMs, type: 'SESSION_ENDED', payload: { reason } });
  }

  function validate(cmd: SimCommand): string | null {
    if (state.endReason !== null) return 'Session has ended';
    if ('trackId' in cmd && !tracksById.has(cmd.trackId)) return `Unknown track ${cmd.trackId}`;
    if (cmd.type === 'RESPONSE_ORDERED') {
      const { response, effectorId } = cmd.payload;
      if (response === 'EW_JAM' || response === 'EW_SPOOF') {
        return `${response} is not available yet`;
      }
      if (response === 'INTERCEPT') {
        const eff = effectorId
          ? state.effectors.find((e) => e.id === effectorId)
          : state.effectors.find((e) => e.kind === 'INTERCEPT');
        if (eff?.kind !== 'INTERCEPT') return 'No interceptor available';
      }
    }
    return null;
  }

  function applyResponse(cmd: Extract<SimCommand, { type: 'RESPONSE_ORDERED' }>, tMs: number) {
    const { response, effectorId } = cmd.payload;
    if (response !== 'INTERCEPT') return; // MONITOR / REPORT: logged only
    const track = tracksById.get(cmd.trackId);
    const eff = effectorId
      ? state.effectors.find((e) => e.id === effectorId)
      : state.effectors.find((e) => e.kind === 'INTERCEPT');
    if (track === undefined || eff === undefined) return;
    const contact = contactsById.get(track.contactId);
    if (contact === undefined) return;
    const result = resolveIntercept(eff, track, contact, state.roe, tMs, effectorStream);
    emit({
      tMs,
      type: 'RESPONSE_OUTCOME',
      trackId: track.id,
      contactId: contact.id,
      payload: { response, result },
    });
    if (result === 'NEUTRALISED') {
      emit({
        tMs,
        type: 'CONTACT_NEUTRALISED',
        contactId: contact.id,
        payload: { by: 'INTERCEPT' },
      });
    }
  }

  function applyCommand(cmd: SimCommand, tMs: number): void {
    emit({ ...cmd, tMs } as EventDraft);
    const track = 'trackId' in cmd ? tracksById.get(cmd.trackId) : undefined;
    switch (cmd.type) {
      case 'TRACK_SELECTED':
        state.selectedTrackId = cmd.trackId;
        break;
      case 'CAMERA_SLEWED':
        state.camera = { ...cmd.payload };
        break;
      case 'MARKED_DETECTED':
        if (track) track.markedDetected = true;
        break;
      case 'CLASSIFIED':
        if (track) track.classifiedAs = cmd.payload.class;
        break;
      case 'AFFILIATION_SET':
        if (track) track.affiliation = cmd.payload.affiliation;
        break;
      case 'RESPONSE_ORDERED':
        applyResponse(cmd, tMs);
        break;
      default:
        break; // REPORT_SUBMITTED, AI_SUGGESTION_*: logged only
    }
  }

  function updateTrackFromHit(
    track: TrackState,
    radarPos: Vec3,
    contact: ContactState,
    rangeM: number,
    bearing: number,
    tMs: number,
  ): void {
    // 3D radar: horizontal position from measured range/bearing; height not
    // perturbed in Phase 1.
    const dh = contact.pos.y - radarPos.y;
    const horiz = Math.sqrt(Math.max(rangeM * rangeM - dh * dh, 0));
    const [east, north] = headingVector(bearing);
    const pos = { x: radarPos.x + east * horiz, y: contact.pos.y, z: radarPos.z + north * horiz };
    const dtS = (tMs - track.lastUpdateTMs) / 1000;
    if (dtS > 0) {
      track.speedMps = horizontalRange(track.pos, pos) / dtS;
      track.headingDeg = bearingDeg(track.pos, pos);
    }
    track.pos = pos;
    track.rangeM = rangeM;
    track.bearingDeg = bearing;
    track.lastUpdateTMs = tMs;
  }

  function scanRadars(tMs: number): void {
    for (const radar of radars) {
      if (tMs % radar.scanMs !== 0) continue;
      const radarPos = sensorPositions[radar.cfg.id];
      if (radarPos === undefined) continue;
      const returns = new Map(
        radarScan(radar.cfg, radarPos, state.contacts, specs, radar.stream).map((r) => [
          r.contactId,
          r,
        ]),
      );
      for (const contact of state.contacts) {
        const key = `${radar.cfg.id}:${contact.id}`;
        const ret = returns.get(contact.id);
        let history = histories.get(key);
        if (history === undefined) {
          if (ret?.hit !== true) continue; // nothing to track yet
          history = createScanHistory();
          histories.set(key, history);
        }
        const hit = ret?.hit === true;
        const update = recordScan(history, hit);
        const live = history.trackId !== null ? tracksById.get(history.trackId) : undefined;
        if (ret?.hit === true && ret.rangeM !== undefined && ret.bearingDeg !== undefined) {
          if (update === 'CONFIRMED') {
            const track: TrackState = {
              id: formatTrackId(nextTrackNo++),
              contactId: contact.id,
              sensorId: radar.cfg.id,
              sensorKind: 'RADAR',
              status: 'ACTIVE',
              createdTMs: tMs,
              lastUpdateTMs: tMs,
              rangeM: ret.rangeM,
              bearingDeg: ret.bearingDeg,
              pos: { ...contact.pos },
              headingDeg: null,
              speedMps: null,
              markedDetected: false,
              classifiedAs: null,
              affiliation: 'UNKNOWN',
            };
            updateTrackFromHit(track, radarPos, contact, ret.rangeM, ret.bearingDeg, tMs);
            history.trackId = track.id;
            state.tracks.push(track);
            tracksById.set(track.id, track);
            emit({
              tMs,
              type: 'SENSOR_TRACK_CREATED',
              contactId: contact.id,
              trackId: track.id,
              payload: {
                sensorId: radar.cfg.id,
                sensorKind: 'RADAR',
                rangeM: ret.rangeM,
                bearingDeg: ret.bearingDeg,
              },
            });
          } else if (live) {
            updateTrackFromHit(live, radarPos, contact, ret.rangeM, ret.bearingDeg, tMs);
          }
        } else if (update === 'LOST' && live) {
          live.status = 'LOST';
          history.trackId = null;
          if (state.selectedTrackId === live.id) state.selectedTrackId = null;
          emit({
            tMs,
            type: 'SENSOR_TRACK_LOST',
            trackId: live.id,
            contactId: contact.id,
            payload: { reason: 'MISSES' },
          });
        }
      }
    }
  }

  const threatIds = scenario.contacts.filter((c) => c.isThreat).map((c) => c.id);

  function tick(): void {
    if (state.endReason !== null) return;
    state.clock = advanceClock(state.clock);
    const { tMs } = state.clock;

    for (const cmd of queue.splice(0)) applyCommand(cmd, tMs);

    const ctx = { terrain, assets, tMs, dtS: TICK_S };
    for (const contact of state.contacts) {
      const spec = specs.get(contact.id);
      if (spec !== undefined) for (const ev of stepContact(contact, spec, ctx)) emit(ev);
    }

    scanRadars(tMs);

    if (tMs >= state.durationMs) {
      endSession('TIME_UP');
    } else if (
      threatIds.length > 0 &&
      threatIds.every((id) => {
        const s = contactsById.get(id)?.status;
        return s === 'NEUTRALISED' || s === 'REACHED_ASSET' || s === 'DESPAWNED';
      })
    ) {
      endSession('ALL_RESOLVED');
    }
  }

  return {
    tick,
    dispatch(cmd) {
      const reason = validate(cmd);
      if (reason !== null) return { ok: false, reason };
      queue.push(cmd);
      return { ok: true };
    },
    end: endSession,
    getState: () => state,
    getEvents: () => log.events,
  };
}
