export { SIM_VERSION } from './version.ts';
export { createRng, deriveStreamSeed, mulberry32 } from './rng.ts';
export type { RandomStream, Rng } from './rng.ts';
export { TICK_HZ, TICK_MS, TICK_S, advanceClock, ceilToTick, createClock } from './clock.ts';
export type { SimClock } from './clock.ts';
export {
  angleDiffDeg,
  bearingDeg,
  fromThree,
  headingVector,
  horizontalRange,
  slantRange,
  toThree,
  wrapDeg,
} from './coords.ts';
export type { Vec3 } from './coords.ts';
export {
  PROCEDURAL_HILLS,
  createHeightmap,
  createProceduralTerrain,
  sampleHeight,
} from './terrain.ts';
export type { Heightmap, ProceduralTerrainOptions } from './terrain.ts';
export { DIVE_START_RATIO, createContactState, stepContact } from './contacts.ts';
export type { ContactState, ContactStatus, ContactStepContext } from './contacts.ts';
export { appendEvent, createEventLog } from './events.ts';
export type { DistributiveOmit, EventDraft, EventLog, TraineeEvent } from './events.ts';
export {
  BEARING_SIGMA_DEG,
  CLUTTER_AGL_M,
  CLUTTER_FACTOR,
  CLUTTER_RANGE_M,
  PD_SLOPE_DB,
  RANGE_SIGMA_M,
  REF_RCS_M2,
  clutterFactor,
  gaussian,
  rainLossDb,
  radarPd,
  radarScan,
  radarSnrDb,
} from './sensors/radar.ts';
export type { RadarReturn } from './sensors/radar.ts';
export {
  CONFIRM_HITS,
  CONFIRM_WINDOW,
  FILTER_ALPHA,
  FILTER_BETA,
  LOSE_MISSES,
  createScanHistory,
  createTrackFilter,
  formatTrackId,
  lostReason,
  predictFilter,
  recordScan,
  updateTrackFilter,
} from './tracks.ts';
export type { ScanHistory, ScanUpdate, TrackFilter, TrackState, TrackStatus } from './tracks.ts';
export {
  PKILL_MAX,
  PKILL_MIN,
  createEffectorState,
  interceptPkill,
  resolveIntercept,
  roeAllowsIntercept,
} from './effectors.ts';
export type { EffectorState } from './effectors.ts';
export { commandFromEvent, createSim } from './sim.ts';
export type { CameraState, DispatchResult, Sim, SimCommand, SimOptions, SimState } from './sim.ts';
export {
  BUILDING_CELL_M,
  buildingTopAt,
  createBuildingIndex,
  parseBuildingsGeoJson,
  pointInRing,
} from './buildings.ts';
export type { Building, BuildingFootprint, BuildingIndex } from './buildings.ts';
export {
  LOS_OWN_SITE_M,
  LOS_STEP_M,
  LOS_TOLERANCE_M,
  createLosCache,
  hasLineOfSight,
} from './los.ts';
export type { LosCache } from './los.ts';
export {
  PROCEDURAL_HILLS_META,
  builtinWorld,
  createWorld,
  decodeHeightmapU16,
  isWorld,
  worldFromPreset,
} from './world.ts';
export type { World } from './world.ts';
export {
  DEFAULT_UTC_OFFSET_MIN,
  NIGHT_SUN_EL_DEG,
  computeEnvironment,
  isNightAt,
  localInstantMs,
  sunPosition,
} from './sun.ts';
export type { SimEnvironment, SunAzElDeg } from './sun.ts';
export {
  CAMERA_FOLLOW_RATE,
  EO_EPISODE_RESET_MS,
  EO_LEVEL_RANK,
  IR_VISIBILITY_FACTOR,
  JOHNSON_CYCLES,
  eoHfovDeg,
  eoIfovRad,
  eoLevel,
  eoResolution,
  followPointing,
  inEoFrustum,
  johnsonCycles,
  levelForCycles,
  pointingTo,
} from './sensors/eoir.ts';
export type { EoCameraState, EoConditions } from './sensors/eoir.ts';
