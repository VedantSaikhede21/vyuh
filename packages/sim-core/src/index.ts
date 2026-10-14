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
  PD_SLOPE_DB,
  RANGE_SIGMA_M,
  REF_RCS_M2,
  gaussian,
  radarPd,
  radarScan,
  radarSnrDb,
} from './sensors/radar.ts';
export type { RadarReturn } from './sensors/radar.ts';
export {
  CONFIRM_HITS,
  CONFIRM_WINDOW,
  LOSE_MISSES,
  createScanHistory,
  formatTrackId,
  recordScan,
} from './tracks.ts';
export type { ScanHistory, ScanUpdate, TrackState, TrackStatus } from './tracks.ts';
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
