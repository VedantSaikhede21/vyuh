import { readFileSync } from 'node:fs';
import type { AreaZone, Zone } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { ZONE_NEAR_M, groupNoKineticZones, zonesNearTrack } from '@/lib/hud/zones';

// Checkpoint B item 2 (decision 98): one label per town cluster, member ids on demand.

const S06 = JSON.parse(
  readFileSync(new URL('../../api/app/seed/scenarios/S06.json', import.meta.url), 'utf8'),
) as { zones: Zone[] };

const square = (id: string, x: number, z: number, size: number, name?: string): AreaZone => ({
  id,
  kind: 'NO_KINETIC',
  polygon: [
    [x, z],
    [x + size, z],
    [x + size, z + size],
    [x, z + size],
  ],
  ...(name ? { name } : {}),
});

describe('NO_KINETIC zone label groups', () => {
  it('S06: one town label, one label for the nearby villages, the lone village keeps its own', () => {
    const groups = groupNoKineticZones(S06.zones);
    const summary = groups.map((g) => [g.label, g.zones.map((z) => z.id)]);
    expect(summary).toEqual([
      ['NO KINETIC · VILLAGE', ['Z1', 'Z2', 'Z3', 'Z4']],
      ['NO KINETIC · TOWN', ['Z5', 'Z6', 'Z7', 'Z8', 'Z10', 'Z11', 'Z12']],
      ['Z9 · NO KINETIC · VILLAGE', ['Z9']],
    ]);
    expect(groups[2]!.shortLabel).toBe('Z9');
  });

  it('groups only zones with the same name within 500 m (single link)', () => {
    const zones: Zone[] = [
      square('Z1', 0, 0, 100, 'town'),
      square('Z2', 550, 0, 100, 'town'), // 450 m from Z1
      square('Z3', 1100, 0, 100, 'town'), // 450 m from Z2, 1 km from Z1: chained
      square('Z4', 1300, 0, 100, 'village'), // close, but another name
      square('Z5', 3000, 0, 100, 'town'), // too far
      {
        id: 'B1',
        kind: 'BORDER_LINE',
        polyline: [
          [0, 0],
          [1, 1],
        ],
      },
    ];
    expect(groupNoKineticZones(zones).map((g) => g.zones.map((z) => z.id))).toEqual([
      ['Z1', 'Z2', 'Z3'],
      ['Z4'],
      ['Z5'],
    ]);
  });

  it('a single zone keeps the full label', () => {
    const [g] = groupNoKineticZones([square('Z1', 0, 0, 100, 'village')]);
    expect(g).toMatchObject({ key: 'Z1', label: 'Z1 · NO KINETIC · VILLAGE', shortLabel: 'Z1' });
  });
});

describe('zones near the selected track', () => {
  const zones = [square('Z1', 0, 0, 500), square('Z2', 2000, 0, 500)];
  const track = (x: number, z: number, headingDeg: number | null, speedMps: number | null) => ({
    x,
    z,
    headingDeg,
    speedMps,
  });

  it('inside a zone', () => {
    expect([...zonesNearTrack(zones, track(250, 250, null, null))]).toEqual(['Z1']);
  });

  it(`within ${ZONE_NEAR_M} m of a zone`, () => {
    expect([...zonesNearTrack(zones, track(250, 500 + ZONE_NEAR_M - 1, 0, 0))]).toEqual(['Z1']);
    expect(zonesNearTrack(zones, track(250, 500 + ZONE_NEAR_M + 1, 0, 0)).size).toBe(0);
  });

  it('heading into a zone within 30 s', () => {
    // 1 km east of Z1's edge, flying west at 30 m/s: inside after ~33 s → not yet.
    expect(zonesNearTrack(zones, track(1500, 250, 270, 30)).has('Z1')).toBe(false);
    // Flying east from 400 m short of Z2 at 20 m/s: inside within 25 s.
    expect([...zonesNearTrack(zones, track(1600, 250, 90, 20))]).toEqual(['Z2']);
    // Same place, flying away: neither.
    expect(zonesNearTrack(zones, track(1600, 250, 270, 20)).size).toBe(0);
  });
});
