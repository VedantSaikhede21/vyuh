import {
  CLASS_PROFILES,
  TraineeEventType,
  type ContactSpec,
  type EoIrSensor,
  type EoLevel,
  type RadarSensor,
  type Roe,
  type Scenario,
  type SessionEndReason,
  type SessionMode,
  type SimEvent,
} from '@vyuh/shared';
import { TICK_MS, TICK_S, advanceClock, ceilToTick, createClock, type SimClock } from './clock.ts';
import { createContactState, stepContact, type ContactState } from './contacts.ts';
import { bearingDeg, headingVector, slantRange, type Vec3 } from './coords.ts';
import { createEffectorState, resolveIntercept, type EffectorState } from './effectors.ts';
import {
  appendEvent,
  createEventLog,
  type DistributiveOmit,
  type EventDraft,
  type TraineeEvent,
} from './events.ts';
import { createLosCache } from './los.ts';
import { createRng, type RandomStream } from './rng.ts';
import {
  EO_EPISODE_RESET_MS,
  EO_LEVEL_RANK,
  eoLevel,
  followPointing,
  inEoFrustum,
  pointingTo,
  type EoCameraState,
} from './sensors/eoir.ts';
import { radarScan } from './sensors/radar.ts';
import { computeEnvironment, type SimEnvironment } from './sun.ts';
import { sampleHeight, type Heightmap } from './terrain.ts';
import { createWorld, isWorld, type World } from './world.ts';
import {
  createScanHistory,
  createTrackFilter,
  formatTrackId,
  lostReason,
  predictFilter,
  recordScan,
  updateTrackFilter,
  type ScanHistory,
  type TrackState,
} from './tracks.ts';

// Public sim API (SPEC §5): createSim, tick, dispatch, getState, getEvents.
// Per tick: advance clock → apply queued commands → move contacts → sensor
// scans → end checks. Everything iterates in id order (SPEC §3.4).

/** A trainee command = a trainee event without seq / tMs (applied on the next tick). */
export type SimCommand = DistributiveOmit<TraineeEvent, 'seq' | 'tMs'>;

export type DispatchResult = { ok: true } | { ok: false; reason: string };

/** EO/IR camera pointing — sim state, set only by logged CAMERA_SLEWED commands. */
export type CameraState = EoCameraState;

export interface SimState {
  readonly scenarioId: string;
  readonly roe: Roe;
  readonly durationMs: number;
  /** Sun, night and weather, computed once from the preset and scenario date/time. */
  readonly environment: SimEnvironment;
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

const ORIGIN: Readonly<Vec3> = { x: 0, y: 0, z: 0 };

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function createSim(
  scenario: Scenario,
  worldOrHeightmap: World | Heightmap,
  opts: SimOptions = {},
): Sim {
  const world = isWorld(worldOrHeightmap) ? worldOrHeightmap : createWorld(worldOrHeightmap);
  const terrain = world.heightmap;
  const originElevM = world.meta?.originElevM ?? 0;
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
  const los = createLosCache(world);
  let nextTrackNo = 1;
  const queue: SimCommand[] = [];

  const state: SimState = {
    scenarioId: scenario.id,
    roe: scenario.roe,
    durationMs: scenario.durationS * 1000,
    environment: computeEnvironment(scenario, world.meta),
    clock: createClock(),
    endReason: null,
    contacts: [...scenario.contacts].sort(byId).map(createContactState),
    tracks: [],
    effectors: [...scenario.effectors]
      .sort(byId)
      .map((e) => createEffectorState(e, sampleHeight(terrain, e.x, e.z))),
    sensorPositions,
    selectedTrackId: null,
    camera: { azDeg: 0, elDeg: 0, zoom: 1, mode: 'DAY', lockTrackId: null },
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
    if ('trackId' in cmd && cmd.trackId !== undefined && !tracksById.has(cmd.trackId)) {
      return `Unknown track ${cmd.trackId}`;
    }
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
    const track =
      'trackId' in cmd && cmd.trackId !== undefined ? tracksById.get(cmd.trackId) : undefined;
    switch (cmd.type) {
      case 'TRACK_SELECTED':
        state.selectedTrackId = cmd.trackId;
        break;
      case 'CAMERA_SLEWED':
        state.camera = {
          azDeg: cmd.payload.azDeg,
          elDeg: cmd.payload.elDeg,
          zoom: cmd.payload.zoom,
          mode: cmd.payload.mode ?? state.camera.mode,
          lockTrackId: cmd.trackId ?? null,
        };
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

  /** Horizontal position of a radar measurement (height is not measured with noise). */
  function measuredXZ(radarPos: Vec3, contact: ContactState, rangeM: number, bearing: number) {
    const dh = contact.pos.y - radarPos.y;
    const horiz = Math.sqrt(Math.max(rangeM * rangeM - dh * dh, 0));
    const [east, north] = headingVector(bearing);
    return { x: radarPos.x + east * horiz, z: radarPos.z + north * horiz };
  }

  /** Set the displayed estimate from the filter, predicted to `tMs` (decision 51). */
  function refreshTrack(track: TrackState, tMs: number): void {
    const radarPos = sensorPositions[track.sensorId];
    if (radarPos === undefined) return;
    const { x, z } = predictFilter(track.filter, tMs);
    const contact = contactsById.get(track.contactId);
    if (contact !== undefined) track.altitudeAglM = contact.agl;
    track.pos = { x, y: contact?.pos.y ?? track.pos.y, z };
    track.rangeM = slantRange(radarPos, track.pos);
    track.bearingDeg = bearingDeg(radarPos, track.pos);
    const f = track.filter;
    if (f.hasVelocity) {
      track.speedMps = Math.hypot(f.vx, f.vz);
      track.headingDeg = bearingDeg(ORIGIN, { x: f.vx, y: 0, z: f.vz });
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
    const m = measuredXZ(radarPos, contact, rangeM, bearing);
    updateTrackFilter(track.filter, m.x, m.z, tMs);
    track.lastUpdateTMs = tMs;
    refreshTrack(track, tMs);
  }

  /** Extrapolate every live track between scans so the EO lock and HUD move smoothly. */
  function predictTracks(tMs: number): void {
    for (const track of state.tracks) {
      if (track.status === 'ACTIVE' && track.lastUpdateTMs !== tMs) refreshTrack(track, tMs);
    }
  }

  function scanRadars(tMs: number): void {
    for (const radar of radars) {
      if (tMs % radar.scanMs !== 0) continue;
      const radarPos = sensorPositions[radar.cfg.id];
      if (radarPos === undefined) continue;
      const inLos = (c: ContactState) =>
        los.visible(state.clock.tick, radar.cfg.id, radarPos, c.id, c.pos);
      const rain = state.environment.weather.rainMmph;
      const returns = new Map(
        radarScan(radar.cfg, radarPos, state.contacts, specs, radar.stream, inLos, rain).map(
          (r) => [r.contactId, r],
        ),
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
        const update = recordScan(history, hit, ret?.masked === true);
        const live = history.trackId !== null ? tracksById.get(history.trackId) : undefined;
        if (ret?.hit === true && ret.rangeM !== undefined && ret.bearingDeg !== undefined) {
          if (update === 'CONFIRMED') {
            const m = measuredXZ(radarPos, contact, ret.rangeM, ret.bearingDeg);
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
              pos: { x: m.x, y: contact.pos.y, z: m.z },
              altitudeAglM: contact.agl,
              filter: createTrackFilter(m.x, m.z, tMs),
              headingDeg: null,
              speedMps: null,
              markedDetected: false,
              classifiedAs: null,
              affiliation: 'UNKNOWN',
            };
            history.trackId = track.id;
            state.tracks.push(track);
            tracksById.set(track.id, track);
            refreshTrack(track, tMs);
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
            payload: { reason: lostReason(history) },
          });
        }
      }
    }
  }

  // ---- EO/IR (SPEC §6.2) ----------------------------------------------------
  const eo = scenario.sensors.filter((s): s is EoIrSensor => s.kind === 'EO_IR').sort(byId)[0];
  const eoPos = eo ? sensorPositions[eo.id] : undefined;
  /** Per contact: highest level emitted in the current pointing episode, and when it last had one. */
  const eoEpisodes = new Map<string, { rank: number; lastSeenMs: number }>();

  function followLock(): void {
    const id = state.camera.lockTrackId;
    if (id === null || eoPos === undefined) return;
    const track = tracksById.get(id);
    if (track === undefined || track.status !== 'ACTIVE') {
      state.camera.lockTrackId = null;
      return;
    }
    const target = {
      x: track.pos.x,
      y: sampleHeight(terrain, track.pos.x, track.pos.z) + track.altitudeAglM,
      z: track.pos.z,
    };
    followPointing(state.camera, pointingTo(eoPos, target), TICK_S);
  }

  function liveTrackFor(contactId: string): string | undefined {
    return state.tracks.find((t) => t.contactId === contactId && t.status === 'ACTIVE')?.id;
  }

  function scanEo(tMs: number): void {
    if (eo === undefined || eoPos === undefined) return;
    const cond = {
      isNight: state.environment.isNight,
      visibilityM: state.environment.weather.visibilityM,
    };
    for (const c of state.contacts) {
      const spec = specs.get(c.id);
      if (c.status !== 'ACTIVE' || spec === undefined) continue;
      let level: EoLevel | null = null;
      const rangeM = slantRange(eoPos, c.pos);
      if (inEoFrustum(eo, state.camera, eoPos, c.pos)) {
        const p = CLASS_PROFILES[spec.class];
        level = eoLevel(eo, state.camera, { ...p, rangeM }, cond);
        if (level !== null && !los.visible(state.clock.tick, eo.id, eoPos, c.id, c.pos)) {
          level = null;
        }
      }
      const ep = eoEpisodes.get(c.id);
      if (level === null) {
        if (ep && tMs - ep.lastSeenMs >= EO_EPISODE_RESET_MS) eoEpisodes.delete(c.id);
        continue;
      }
      const rank = EO_LEVEL_RANK[level];
      if (ep === undefined || rank > ep.rank) {
        const trackId = liveTrackFor(c.id);
        emit({
          tMs,
          type: 'EO_IDENTIFIABLE',
          contactId: c.id,
          ...(trackId ? { trackId } : {}),
          payload: { level, rangeM },
        });
      }
      eoEpisodes.set(c.id, { rank: Math.max(rank, ep?.rank ?? 0), lastSeenMs: tMs });
    }
  }

  const threatIds = scenario.contacts.filter((c) => c.isThreat).map((c) => c.id);

  function tick(): void {
    if (state.endReason !== null) return;
    state.clock = advanceClock(state.clock);
    const { tMs } = state.clock;

    for (const cmd of queue.splice(0)) applyCommand(cmd, tMs);

    const ctx = { terrain, originElevM, assets, tMs, dtS: TICK_S };
    for (const contact of state.contacts) {
      const spec = specs.get(contact.id);
      if (spec !== undefined) for (const ev of stepContact(contact, spec, ctx)) emit(ev);
    }

    scanRadars(tMs);
    predictTracks(tMs);
    followLock();
    scanEo(tMs);

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
