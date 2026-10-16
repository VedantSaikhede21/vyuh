import { describe, expect, it } from 'vitest';
import { isNightAt, timeOfDayAt } from '../src/index.ts';

const PUNJAB = { origin: { lat: 30.52, lon: 75.7 }, utcOffsetMin: 330 };

describe('timeOfDayAt (shared band rule on suncalc)', () => {
  it('reads Dawn in the morning twilight and Dusk in the evening', () => {
    const dawn = timeOfDayAt('2026-01-15', '07:10', PUNJAB);
    expect(dawn.band).toBe('DUSK');
    expect(dawn.sunRising).toBe(true);
    expect(dawn.label).toBe('Dawn');
    const dusk = timeOfDayAt('2026-01-15', '17:40', PUNJAB);
    expect(dusk.band).toBe('DUSK');
    expect(dusk.sunRising).toBe(false);
    expect(dusk.label).toBe('Dusk');
  });

  it('agrees with the sim night flag at every 10 minutes of a day', () => {
    for (let m = 0; m < 24 * 60; m += 10) {
      const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const t = timeOfDayAt('2026-07-20', time, PUNJAB);
      expect(t.band === 'NIGHT').toBe(isNightAt('2026-07-20', time, PUNJAB));
    }
  });

  it('is day at noon', () => {
    expect(timeOfDayAt('2026-01-15', '12:30', PUNJAB).label).toBe('Day');
  });
});
