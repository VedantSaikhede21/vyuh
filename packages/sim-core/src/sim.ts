import {
  CLASS_PROFILES,
  TraineeEventType,
  type ContactSpec,
  type EffectorKind,
  type EoIrSensor,
  type EoLevel,
  type RadarSensor,
  type RfSensor,
  type Roe,
  type Scenario,
  type SessionEndReason,
  type SessionMode,
  type SimEvent,
} from '@vyuh/shared';
import { createFlocks, stepFlock } from './boids.ts';
import { TICK_MS, TICK_S, advanceClock, ceilToTick, createClock, type SimClock } from './clock.ts';
import { createContactState, stepContact, type ContactState } from './contacts.ts';
import { bearingDeg, headingVector, slantRange, type Vec3 } from './coords.ts';
import {
  createEffectorState,
  resolveEw,
  resolveIntercept,
  type EffectorState,
} from './effectors.ts';
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
  EO_ACQUIRE_FRAME_FRACTION,
  EO_ACQUIRE_MS,
  EO_EPISODE_RESET_MS,
  EO_LEVEL_RANK,
  EO_TRACK_DROP_MS,
  EO_TRACK_JITTER_FOV,
  eoHfovDeg,
  eoLevel,
  followPointing,
  frameOffset,
  inEoFrustum,
  pointingTo,
  type EoCameraState,
} from './sensors/eoir.ts';
import { gaussian, radarScan } from './sensors/radar.ts';
import {
  RF_SCAN_MS,
  RF_SCAN_OFFSET_MS,
  RF_STROBE_TTL_MS,
  formatStrobeId,
  rfBadgeFor,
  rfScan,
  type RfStrobe,
} from './sensors/rf.ts';
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
  /** Live RF bearing strobes, in id order (E01, E02, …). Sim state, not events. */
  rfStrobes: RfStrobe[];
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

const NO_EFFECTOR: Readonly<Record<EffectorKind, string>> = {
  INTERCEPT: 'No interceptor available',
  EW_JAM: 'No jammer available',
  EW_SPOOF: 'No spoofer available',
};

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
    rfStrobes: [],
    effectors: [...scenario.effectors]
      .sort(byId)
      .map((e) => createEffectorState(e, sampleHeight(terrain, e.x, e.z))),
    sensorPositions,
    selectedTrackId: null,
    camera: { azDeg: 0, elDeg: 0, zoom: 1, mode: 'DAY', lockTrackId: null, trackMode: 'MANUAL' },
  };
  const contactsById = new Map(state.contacts.map((c) => [c.id, c]));
  const flocks = createFlocks([...scenario.contacts].sort(byId), rng);
  for (const f of flocks) {
    for (const id of f.followerIds) {
      const c = contactsById.get(id);
      if (c) c.control = 'BOID';
    }
  }
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
      if (response === 'INTERCEPT' || response === 'EW_JAM' || response === 'EW_SPOOF') {
        const eff = effectorFor(response, effectorId);
        if (eff?.kind !== response) return NO_EFFECTOR[response];
      }
    }
    return null;
  }

  function effectorFor(kind: EffectorKind, effectorId?: string): EffectorState | undefined {
    return effectorId
      ? state.effectors.find((e) => e.id === effectorId)
      : state.effectors.find((e) => e.kind === kind);
  }

  function applyResponse(cmd: Extract<SimCommand, { type: 'RESPONSE_ORDERED' }>, tMs: number) {
    const { response, effectorId } = cmd.payload;
    if (response === 'MONITOR' || response === 'REPORT') return; // logged only
    const track = tracksById.get(cmd.trackId);
    const eff = effectorFor(response, effectorId);
    if (track === undefined || eff === undefined) return;
    const contact = contactsById.get(track.contactId);
    if (contact === undefined) return;
    if (response === 'INTERCEPT') {
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
          payload: { by: response },
        });
      }
      return;
    }
    // EW is not ROE-gated (decision 54).
    const { result, affected } = resolveEw(eff, track, state.contacts, specs, tMs, effectorStream);
    const collateral = affected.filter((id) => id !== contact.id);
    emit({
      tMs,
      type: 'RESPONSE_OUTCOME',
      trackId: track.id,
      contactId: contact.id,
      payload: {
        response,
        result,
        ...(collateral.length > 0 ? { collateral: { contactIds: collateral } } : {}),
      },
    });
    for (const id of affected) {
      emit({ tMs, type: 'CONTACT_NEUTRALISED', contactId: id, payload: { by: response } });
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
        if (state.camera.trackMode === 'TRACK' && cmd.trackId === state.camera.lockTrackId) {
          // Zoom / mode change on the tracked target: the EO tracker keeps holding it.
          state.camera.zoom = cmd.payload.zoom;
          state.camera.mode = cmd.payload.mode ?? state.camera.mode;
          break;
        }
        state.camera = {
          azDeg: cmd.payload.azDeg,
          elDeg: cmd.payload.elDeg,
          zoom: cmd.payload.zoom,
          mode: cmd.payload.mode ?? state.camera.mode,
          lockTrackId: cmd.trackId ?? null,
          trackMode: cmd.trackId !== undefined ? 'CUE' : 'MANUAL',
        };
        resetEoTracker();
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
              rf: null,
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

  // ---- EO video auto-track (decision 52) -------------------------------------
  const eoTrackStream: RandomStream = rng.stream('eo-track');
  const eoTracker = {
    contactId: null as string | null,
    centredSinceMs: null as number | null,
    noLevelSinceMs: null as number | null,
  };

  function resetEoTracker(): void {
    eoTracker.contactId = null;
    eoTracker.centredSinceMs = null;
    eoTracker.noLevelSinceMs = null;
  }

  /** EO level of a contact in the current pointing (frustum + LOS), or null. */
  function eoLevelNow(c: ContactState, spec: ContactSpec): EoLevel | null {
    if (eo === undefined || eoPos === undefined) return null;
    if (!inEoFrustum(eo, state.camera, eoPos, c.pos)) return null;
    const level = eoLevel(
      eo,
      state.camera,
      { ...CLASS_PROFILES[spec.class], rangeM: slantRange(eoPos, c.pos) },
      { isNight: state.environment.isNight, visibilityM: state.environment.weather.visibilityM },
    );
    if (level === null) return null;
    return los.visible(state.clock.tick, eo.id, eoPos, c.id, c.pos) ? level : null;
  }

  /** TRACK -> CUE; with no live radar track to fall back on, -> MANUAL. */
  function dropTrack(): void {
    resetEoTracker();
    const id = state.camera.lockTrackId;
    const live = id !== null && tracksById.get(id)?.status === 'ACTIVE';
    state.camera.trackMode = live ? 'CUE' : 'MANUAL';
    if (!live) state.camera.lockTrackId = null;
  }

  /** One tick of the EO tracker; false when it lost the contact. */
  function holdTrack(tMs: number): boolean {
    if (eo === undefined || eoPos === undefined || eoTracker.contactId === null) return false;
    const c = contactsById.get(eoTracker.contactId);
    const spec = specs.get(eoTracker.contactId);
    if (c === undefined || spec === undefined || c.status !== 'ACTIVE') return false;
    // Break checks use last tick's pointing: did the contact leave the frame or the LOS?
    if (!inEoFrustum(eo, state.camera, eoPos, c.pos)) return false;
    if (!los.visible(state.clock.tick, eo.id, eoPos, c.id, c.pos)) return false;
    if (eoLevelNow(c, spec) === null) {
      eoTracker.noLevelSinceMs ??= tMs;
      if (tMs - eoTracker.noLevelSinceMs > EO_TRACK_DROP_MS) return false;
    } else {
      eoTracker.noLevelSinceMs = null;
    }
    // Closed-loop tracker: aim at the contact itself plus a small jitter (2 draws per tick).
    const sigma = EO_TRACK_JITTER_FOV * eoHfovDeg(eo, state.camera.zoom);
    const aim = pointingTo(eoPos, c.pos);
    const az = aim.azDeg + gaussian(eoTrackStream) * sigma;
    state.camera.azDeg = ((az % 360) + 360) % 360;
    state.camera.elDeg = aim.elDeg + gaussian(eoTrackStream) * sigma;
    return true;
  }

  /** CUE: follow the filtered radar estimate; hand over to TRACK once the contact is centred. */
  function followLock(tMs: number): void {
    const id = state.camera.lockTrackId;
    if (id === null || eoPos === undefined) return;
    const track = tracksById.get(id);
    if (track === undefined || track.status !== 'ACTIVE') {
      state.camera.lockTrackId = null;
      state.camera.trackMode = 'MANUAL';
      resetEoTracker();
      return;
    }
    const target = {
      x: track.pos.x,
      y: sampleHeight(terrain, track.pos.x, track.pos.z) + track.altitudeAglM,
      z: track.pos.z,
    };
    followPointing(state.camera, pointingTo(eoPos, target), TICK_S);

    const c = contactsById.get(track.contactId);
    const spec = specs.get(track.contactId);
    const offset =
      c !== undefined && eo !== undefined ? frameOffset(eo, state.camera, eoPos, c.pos) : null;
    const centred =
      c !== undefined &&
      spec !== undefined &&
      offset !== null &&
      Math.abs(offset[0]) <= EO_ACQUIRE_FRAME_FRACTION &&
      Math.abs(offset[1]) <= EO_ACQUIRE_FRAME_FRACTION &&
      eoLevelNow(c, spec) !== null;
    if (!centred) {
      eoTracker.centredSinceMs = null;
      return;
    }
    eoTracker.centredSinceMs ??= tMs;
    if (tMs - eoTracker.centredSinceMs >= EO_ACQUIRE_MS) {
      state.camera.trackMode = 'TRACK';
      eoTracker.contactId = track.contactId;
      eoTracker.centredSinceMs = null;
      eoTracker.noLevelSinceMs = null;
    }
  }

  function updateCamera(tMs: number): void {
    if (state.camera.trackMode === 'TRACK') {
      if (holdTrack(tMs)) return;
      dropTrack();
    }
    if (state.camera.trackMode === 'CUE') followLock(tMs);
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

  // ---- RF detector (SPEC §6.3, decision 53) -----------------------------------
  const rfSensors = scenario.sensors
    .filter((s): s is RfSensor => s.kind === 'RF')
    .sort(byId)
    .map((cfg) => ({
      cfg,
      pos: { x: cfg.x, y: sampleHeight(terrain, cfg.x, cfg.z) + cfg.y, z: cfg.z },
      stream: rng.stream(`rf:${cfg.id}`),
    }));
  const rfById = new Map(rfSensors.map((s) => [s.cfg.id, s]));
  let nextStrobeNo = 1;

  function scanRf(tMs: number): void {
    if (tMs % RF_SCAN_MS === RF_SCAN_OFFSET_MS) {
      for (const rf of rfSensors) {
        const inLos = (c: ContactState) =>
          los.visible(state.clock.tick, rf.cfg.id, rf.pos, c.id, c.pos);
        for (const d of rfScan(rf.cfg, rf.pos, state.contacts, specs, rf.stream, inLos)) {
          const s = state.rfStrobes.find(
            (x) => x.sensorId === rf.cfg.id && x.contactId === d.contactId,
          );
          if (s !== undefined) {
            s.bearingDeg = d.bearingDeg;
            s.band = d.band;
            s.friendlyIdCode = d.friendlyIdCode;
            s.lastTMs = tMs;
          } else {
            state.rfStrobes.push({
              id: formatStrobeId(nextStrobeNo++),
              contactId: d.contactId,
              sensorId: rf.cfg.id,
              bearingDeg: d.bearingDeg,
              band: d.band,
              friendlyIdCode: d.friendlyIdCode,
              firstTMs: tMs,
              lastTMs: tMs,
            });
          }
        }
      }
    }
    state.rfStrobes = state.rfStrobes.filter((s) => tMs - s.lastTMs < RF_STROBE_TTL_MS);
    for (const t of state.tracks) {
      t.rf = t.status === 'ACTIVE' ? rfBadgeFor(t.pos, state.rfStrobes, rfById) : null;
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
    for (const f of flocks) stepFlock(f, contactsById, specs, terrain, TICK_S);

    scanRadars(tMs);
    predictTracks(tMs);
    scanRf(tMs);
    updateCamera(tMs);
    scanEo(tMs);

    if (tMs >= state.durationMs) {
      endSession('TIME_UP');
    } else if (
      threatIds.length > 0 &&
      threatIds.every((id) => {
        const c = contactsById.get(id);
        const s = c?.status;
        // A contact defeated by EW still flies, but counts as resolved (decision 54).
        return s === 'NEUTRALISED' || s === 'REACHED_ASSET' || s === 'DESPAWNED' || c?.defeated;
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
