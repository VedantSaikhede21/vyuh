// Deterministic RNG (SPEC §3.4): mulberry32 with named, independent streams.
// Each stream's seed depends only on (scenario seed, stream name), so drawing
// from one stream — or adding a new stream — never shifts another's sequence.

const UINT32 = 0x1_0000_0000;

export interface RandomStream {
  readonly name: string;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, 2^32). */
  nextUint32(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** true with probability p. */
  chance(p: number): boolean;
  /** Uniformly chosen element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** Generator state, for sim snapshots (decision 107). */
  getState(): number;
  setState(state: number): void;
}

export interface Rng {
  readonly seed: number;
  /** Returns the stream with this name; repeated calls return the same stream. */
  stream(name: string): RandomStream;
  /** Every created stream's state, by name (sim snapshots). */
  getStates(): Record<string, number>;
  /** Restore states from `getStates()`; streams not listed are created at their seed. */
  setStates(states: Readonly<Record<string, number>>): void;
}

function assertUint32(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32) {
    throw new RangeError(`Seed must be a uint32 integer, got ${seed}`);
  }
}

/** FNV-1a 32-bit hash of a string (UTF-16 code units). */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** murmur3 finaliser: spreads bits so nearby inputs give unrelated seeds. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function deriveStreamSeed(seed: number, name: string): number {
  assertUint32(seed);
  return fmix32((seed ^ fnv1a(name)) >>> 0);
}

/** Raw mulberry32 generator returning uint32 values. */
export function mulberry32(seed: number): () => number {
  assertUint32(seed);
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function createStream(name: string, seed: number): RandomStream {
  // The mulberry32 step, inlined so the state can be read and restored.
  let state = seed;
  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const next = (): number => nextUint32() / UINT32;
  return {
    name,
    next,
    nextUint32,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`Invalid int range [${min}, ${max}]`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    getState: () => state >>> 0,
    setState: (s) => {
      state = s | 0;
    },
  };
}

export function createRng(seed: number): Rng {
  assertUint32(seed);
  const streams = new Map<string, RandomStream>();
  return {
    seed,
    stream(name) {
      if (name.length === 0) throw new RangeError('Stream name must not be empty');
      let s = streams.get(name);
      if (s === undefined) {
        s = createStream(name, deriveStreamSeed(seed, name));
        streams.set(name, s);
      }
      return s;
    },
    getStates() {
      const out: Record<string, number> = {};
      for (const [name, s] of [...streams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        out[name] = s.getState();
      }
      return out;
    },
    setStates(states) {
      for (const [name, s] of streams) {
        if (!(name in states)) s.setState(deriveStreamSeed(seed, name));
      }
      for (const [name, value] of Object.entries(states)) this.stream(name).setState(value);
    },
  };
}
