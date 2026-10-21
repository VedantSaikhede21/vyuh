import type { SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { CommsBuilder, type CommsContext } from '@/lib/hud/comms';

const ctx: CommsContext = {
  trackPos: (id) => (id === 'T004' ? { x: 0, z: 1000 } : null),
  effectorPos: () => ({ x: 0, z: 0 }),
  assetName: () => 'Post Alpha',
};

const ev = (seq: number, e: Record<string, unknown>) =>
  ({ seq, tMs: seq * 1000, payload: {}, ...e }) as unknown as SimEvent;

const LOG: SimEvent[] = [
  ev(1, { type: 'CONTACT_SPAWNED', contactId: 'c07' }),
  ev(2, {
    type: 'SENSOR_TRACK_CREATED',
    trackId: 'T004',
    contactId: 'c07',
    payload: { sensorId: 'rad1', sensorKind: 'RADAR', rangeM: 1158, bearingDeg: 32.4 },
  }),
  ev(3, { type: 'TRACK_SELECTED', trackId: 'T001' }),
  ev(4, { type: 'TRACK_SELECTED', trackId: 'T004' }),
  ev(5, { type: 'EO_IDENTIFIABLE', contactId: 'c07', payload: { level: 'IDENTIFY', rangeM: 900 } }),
  ev(6, { type: 'RESPONSE_ORDERED', trackId: 'T004', payload: { response: 'EW_JAM' } }),
  ev(7, {
    type: 'RESPONSE_OUTCOME',
    trackId: 'T004',
    contactId: 'c07',
    payload: { response: 'EW_JAM', result: 'NEUTRALISED', collateral: { contactIds: ['c09'] } },
  }),
  ev(8, { type: 'CONTACT_NEUTRALISED', contactId: 'c07', payload: { by: 'EW_JAM' } }),
  ev(9, { type: 'CONTACT_REACHED_ASSET', contactId: 'c02', payload: { assetId: 'a1' } }),
];

describe('CommsBuilder', () => {
  it('turns operator-visible events into lines and collapses selection runs', () => {
    const b = new CommsBuilder(ctx);
    b.update(LOG);
    expect(b.lines.map((l) => [l.tMs, l.text, l.status ?? 'info'])).toEqual([
      [2000, 'NEW TRACK T004  BRG 032°  RNG 1.16 km', 'info'],
      [4000, 'T004 SELECTED', 'info'],
      [6000, 'JAM ORDERED  T004  SECTOR 000° ±10°', 'info'],
      [7000, 'T004 JAM  NEUTRALISED', 'ok'],
      [9000, 'IMPACT AT POST ALPHA', 'crit'],
    ]);
  });

  it('never shows a contact id, collateral or truth-only event', () => {
    const b = new CommsBuilder(ctx);
    b.update(LOG);
    const all = b.lines.map((l) => l.text).join('\n');
    expect(all).not.toMatch(/c0\d/);
    expect(all).not.toMatch(/IDENTIF|SPAWN|NEUTRALISED BY/);
  });

  it('logs an EO cue once per cued track, not on every slew while locked', () => {
    const slew = (seq: number, trackId?: string) =>
      ev(seq, { type: 'CAMERA_SLEWED', ...(trackId ? { trackId } : {}), payload: {} });
    const b = new CommsBuilder(ctx);
    b.update([slew(1, 'T004'), slew(2, 'T004'), slew(3), slew(4, 'T004'), slew(5, 'T001')]);
    expect(b.lines.map((l) => l.text)).toEqual([
      'EO CUED TO T004',
      'EO CUED TO T004',
      'EO CUED TO T001',
    ]);
  });

  it('only converts new events on later updates', () => {
    const b = new CommsBuilder(ctx);
    expect(b.update(LOG.slice(0, 2))).toBe(true);
    expect(b.update(LOG.slice(0, 2))).toBe(false);
    b.update(LOG);
    expect(b.lines).toHaveLength(5);
  });

  it('rebuilds when the log goes back in time (AAR replay seek)', () => {
    const b = new CommsBuilder(ctx);
    b.update(LOG);
    b.update(LOG.slice(0, 4));
    expect(b.lines.map((l) => l.text)).toEqual([
      'NEW TRACK T004  BRG 032°  RNG 1.16 km',
      'T004 SELECTED',
    ]);
    b.update(LOG);
    expect(b.lines).toHaveLength(5);
  });
});
