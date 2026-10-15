import type { ContactSpec } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { TICK_MS, TICK_S, createContactState, stepContact } from '../src/index.ts';
import { flatTerrain } from './fixtures.ts';

// Terminal dive for fast, slow-turning classes (SIM_VERSION 3): the dive must
// start no later than the waypoint arrival radius, or the contact "arrives"
// at its DIVE waypoint without diving and despawns beside the asset.

function lowLoiterer(agl: number): ContactSpec {
  return {
    id: 'c01',
    class: 'LOITERING_GENERIC',
    isThreat: true,
    affiliation: 'HOSTILE',
    controlLink: 'AUTONOMOUS_GNSS',
    behaviour: 'ATTACK_RUN',
    spawnTMs: 0,
    path: [
      { x: 1500, y: agl, z: 2500, speedMps: 40 },
      { x: 300, y: agl, z: 1300, speedMps: 40 },
      { x: 0, y: 0, z: 0, speedMps: 40, action: 'DIVE' },
    ],
    emissions: { rfActive: false },
  };
}

describe('terminal dive', () => {
  it.each([5, 22, 60])('a loitering munition at %d m AGL hits the asset', (agl) => {
    const spec = lowLoiterer(agl);
    const c = createContactState(spec);
    const assets = [{ id: 'a1', name: 'Post', x: 0, z: 0, radiusM: 60 }];
    const types: string[] = [];
    for (
      let t = 0;
      t < 300_000 && (c.status === 'PENDING' || c.status === 'ACTIVE');
      t += TICK_MS
    ) {
      types.push(
        ...stepContact(c, spec, { terrain: flatTerrain, assets, tMs: t, dtS: TICK_S }).map(
          (e) => e.type,
        ),
      );
    }
    expect(types).toEqual(['CONTACT_SPAWNED', 'CONTACT_REACHED_ASSET']);
  });
});
