import { readFileSync } from 'node:fs';
import { sampleHeight } from '@vyuh/sim-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearWorldCache, loadWorld } from '../lib/terrain/load-world';

const PUBLIC = new URL('../public/', import.meta.url);

/** Serves files from apps/web/public like the dev server would. */
function fakeFetch(calls: string[] = []) {
  return async (url: string): Promise<Response> => {
    calls.push(url);
    try {
      const body = readFileSync(new URL(`.${url}`, PUBLIC));
      return new Response(body, { status: 200 });
    } catch {
      return new Response('not found', { status: 404 });
    }
  };
}

describe('loadWorld', () => {
  beforeEach(() => clearWorldCache());

  it('loads a committed preset: heights relative to the origin, meta authoritative', async () => {
    const world = await loadWorld('PUNJAB_PLAINS', fakeFetch());
    expect(world.meta?.name).toBe('PUNJAB_PLAINS');
    expect(world.heightmap.resolution).toBe(world.meta?.resolution);
    expect(Math.abs(sampleHeight(world.heightmap, 0, 0))).toBeLessThan(0.5);
    expect(world.buildings.buildings.length).toBe(world.meta?.buildingCount);
  });

  it('fetches each preset once and serves built-ins without the network', async () => {
    const calls: string[] = [];
    const f = fakeFetch(calls);
    const [a, b] = await Promise.all([
      loadWorld('PUNJAB_PLAINS', f),
      loadWorld('PUNJAB_PLAINS', f),
    ]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(3);
    const hills = await loadWorld('PROCEDURAL_HILLS', f);
    expect(hills.meta?.name).toBe('PROCEDURAL_HILLS');
    expect(calls).toHaveLength(3);
  });

  it('rejects unknown or malformed preset names, and does not cache failures', async () => {
    const calls: string[] = [];
    await expect(loadWorld('NOPE', fakeFetch(calls))).rejects.toThrow(/HTTP 404/);
    await expect(loadWorld('NOPE', fakeFetch(calls))).rejects.toThrow(/HTTP 404/);
    expect(calls).toHaveLength(2);
    await expect(loadWorld('../etc', fakeFetch())).rejects.toThrow(/Invalid/);
  });
});
