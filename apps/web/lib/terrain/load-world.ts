import { TerrainPresetMeta } from '@vyuh/shared';
import { builtinWorld, worldFromPreset, type World } from '@vyuh/sim-core';

// Lazy, cached terrain preset loading (SPEC §14, §16): meta.json, heightmap.u16
// and buildings.geojson from /terrain/<PRESET>/, fetched in parallel once per
// preset. Built-in presets (PROCEDURAL_HILLS) need no network.

const PRESET_NAME = /^[A-Z][A-Z0-9_]*$/;
const cache = new Map<string, Promise<World>>();

type Fetch = (url: string) => Promise<Response>;

export function presetFileUrl(preset: string, file: string): string {
  return `/terrain/${preset}/${file}`;
}

async function fetchOk(fetchImpl: Fetch, url: string): Promise<Response> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return res;
}

async function fetchWorld(preset: string, fetchImpl: Fetch): Promise<World> {
  const metaRes = await fetchOk(fetchImpl, presetFileUrl(preset, 'meta.json'));
  const meta = TerrainPresetMeta.parse(await metaRes.json());
  if (meta.name !== preset) throw new Error(`Preset ${preset} has meta for ${meta.name}`);
  const [heightmap, buildings] = await Promise.all([
    fetchOk(fetchImpl, presetFileUrl(preset, meta.files.heightmap)).then((r) => r.arrayBuffer()),
    fetchOk(fetchImpl, presetFileUrl(preset, meta.files.buildings)).then((r) => r.json()),
  ]);
  return worldFromPreset(meta, heightmap, buildings);
}

/** Load (or reuse) a preset's World. A failed load is not cached, so it can be retried. */
export function loadWorld(preset: string, fetchImpl: Fetch = (u) => fetch(u)): Promise<World> {
  const cached = cache.get(preset);
  if (cached) return cached;
  let p: Promise<World>;
  if (!PRESET_NAME.test(preset)) {
    p = Promise.reject(new Error(`Invalid terrain preset name "${preset}"`));
  } else {
    const builtin = builtinWorld(preset);
    p = builtin ? Promise.resolve(builtin) : fetchWorld(preset, fetchImpl);
  }
  cache.set(preset, p);
  p.catch(() => cache.delete(preset));
  return p;
}

/** Test helper. */
export function clearWorldCache(): void {
  cache.clear();
}
