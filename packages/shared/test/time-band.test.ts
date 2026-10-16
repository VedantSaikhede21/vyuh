import { describe, expect, it } from 'vitest';
import {
  DAY_MIN_EL_DEG,
  GENERATOR_BAND_WINDOWS_DEG,
  NIGHT_SUN_EL_DEG,
  TimeBand,
  timeBandForElevation,
  timeBandLabel,
} from '../src/index.ts';

describe('time-of-day bands', () => {
  it('classifies elevations: NIGHT < −6°, DUSK −6° to < 15°, DAY ≥ 15°', () => {
    expect(timeBandForElevation(-30)).toBe('NIGHT');
    expect(timeBandForElevation(-6.01)).toBe('NIGHT');
    expect(timeBandForElevation(NIGHT_SUN_EL_DEG)).toBe('DUSK');
    expect(timeBandForElevation(14.99)).toBe('DUSK');
    expect(timeBandForElevation(DAY_MIN_EL_DEG)).toBe('DAY');
    expect(timeBandForElevation(70)).toBe('DAY');
  });

  it('puts every generator window inside its own label band', () => {
    for (const band of TimeBand.options) {
      const [lo, hi] = GENERATOR_BAND_WINDOWS_DEG[band];
      if (lo !== null) expect(timeBandForElevation(lo)).toBe(band);
      if (hi !== null) expect(timeBandForElevation(hi)).toBe(band);
    }
  });

  it('labels the DUSK band Dawn while the sun rises', () => {
    expect(timeBandLabel('DUSK', true)).toBe('Dawn');
    expect(timeBandLabel('DUSK', false)).toBe('Dusk');
    expect(timeBandLabel('DAY', true)).toBe('Day');
    expect(timeBandLabel('NIGHT', false)).toBe('Night');
  });
});
