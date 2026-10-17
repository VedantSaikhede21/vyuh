import type { ScenarioListItem, TimeBandLabel } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { intelAxisDeg, intelSection } from '../lib/briefing/intel';
import {
  NO_FILTERS,
  conditions,
  filterAndSort,
  readQuery,
  shownTags,
  visibilityKm,
  writeQuery,
} from '../lib/scenario/library';

const weather = { visibilityM: 20_000, rainMmph: 0, windMps: 3, windDirDeg: 0, cloudPct: 0 };

function item(over: Partial<ScenarioListItem>): ScenarioListItem {
  return {
    id: '0b8e6a3c-5d7f-4a1b-8c2d-3e4f5a6b7c8d',
    code: 'S01',
    name: 'First Contact',
    kind: 'SCRIPTED',
    difficulty: 1,
    durationS: 180,
    roe: 'WEAPONS_FREE',
    isNight: false,
    terrainPreset: 'PROCEDURAL_HILLS',
    date: '2026-11-20',
    time: '10:30',
    weather,
    tags: ['library'],
    bestScore: null,
    ...over,
  };
}

describe('conditions', () => {
  it('names rain first, then fog, haze and clear by visibility', () => {
    expect(conditions({ ...weather, rainMmph: 8, visibilityM: 5000 }).label).toBe('Rain');
    expect(conditions({ ...weather, visibilityM: 800 }).label).toBe('Fog');
    expect(conditions({ ...weather, visibilityM: 6000 }).label).toBe('Haze');
    expect(conditions(weather).label).toBe('Clear');
    expect(visibilityKm(800)).toBe('0.8');
    expect(visibilityKm(20_000)).toBe('20');
  });

  it('hides the library tag that every library row has', () => {
    expect(shownTags(item({ tags: ['library', 'demo'] }))).toEqual(['demo']);
  });
});

describe('filters and sort', () => {
  const rows = [
    item({
      code: 'S04',
      name: 'Night Drop',
      difficulty: 3,
      terrainPreset: 'PUNJAB_PLAINS',
      bestScore: 70,
    }),
    item({ code: 'S01', name: 'First Contact', difficulty: 1, tags: ['library', 'tutorial'] }),
    item({
      code: 'S05',
      name: 'Silent Approach',
      difficulty: 3,
      terrainPreset: 'JK_MOUNTAIN',
      bestScore: 90,
    }),
  ];
  const time = (s: ScenarioListItem): TimeBandLabel => (s.code === 'S04' ? 'Night' : 'Day');
  const codes = (r: ScenarioListItem[]) => r.map((s) => s.code);

  it('sorts by difficulty then code, by name, or by best score (unplayed last)', () => {
    expect(codes(filterAndSort(rows, NO_FILTERS, 'difficulty', time))).toEqual([
      'S01',
      'S04',
      'S05',
    ]);
    expect(codes(filterAndSort(rows, NO_FILTERS, 'name', time))).toEqual(['S01', 'S04', 'S05']);
    expect(codes(filterAndSort(rows, NO_FILTERS, 'best', time))).toEqual(['S05', 'S04', 'S01']);
  });

  it('filters by difficulty, terrain, computed time of day and tag', () => {
    expect(
      codes(filterAndSort(rows, { ...NO_FILTERS, difficulty: 3 }, 'difficulty', time)),
    ).toEqual(['S04', 'S05']);
    expect(
      codes(filterAndSort(rows, { ...NO_FILTERS, terrain: 'JK_MOUNTAIN' }, 'difficulty', time)),
    ).toEqual(['S05']);
    expect(
      codes(filterAndSort(rows, { ...NO_FILTERS, time: 'Night' }, 'difficulty', time)),
    ).toEqual(['S04']);
    expect(
      codes(filterAndSort(rows, { ...NO_FILTERS, tag: 'tutorial' }, 'difficulty', time)),
    ).toEqual(['S01']);
  });

  it('round-trips its state through the URL, leaving defaults out', () => {
    const state = {
      filters: { ...NO_FILTERS, difficulty: 4, time: 'Dusk' as const },
      sort: 'best' as const,
    };
    const q = writeQuery(state.filters, state.sort);
    expect(q).toBe('?difficulty=4&time=Dusk&sort=best');
    expect(readQuery(new URLSearchParams(q))).toEqual(state);
    expect(writeQuery(NO_FILTERS, 'difficulty')).toBe('');
    expect(readQuery(new URLSearchParams('?difficulty=9&time=Noon&sort=x'))).toEqual({
      filters: NO_FILTERS,
      sort: 'difficulty',
    });
  });
});

describe('intel axis', () => {
  const brief = (intel: string) => `## Situation\nx\n## Intel\n${intel}\n`;

  it('reads the first compass direction of the Intel section', () => {
    expect(intelAxisDeg(brief('Crossings expected from the south-east.'))).toBe(135);
    expect(intelAxisDeg(brief('Activity reported in the eastern sector.'))).toBe(90);
    expect(
      intelAxisDeg(
        brief('One group out of the sun, from the west-south-west; the other from the north.'),
      ),
    ).toBe(247.5);
    expect(intelSection('## Situation\nfrom the north\n## Mission\nx')).toBe('');
  });

  it('draws no axis when the briefing says there is none', () => {
    expect(
      intelAxisDeg(brief('Multiple contacts possible from several directions; no reliable axis.')),
    ).toBeNull();
    expect(
      intelAxisDeg(brief('Axes are uncertain. The high contacts are likely decoys.')),
    ).toBeNull();
    expect(intelAxisDeg('## Situation\nfrom the north')).toBeNull();
  });
});
