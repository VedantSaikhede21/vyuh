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
