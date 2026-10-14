import type { ContactSpec, RfSensor } from '@vyuh/shared';
import type { ContactState } from '../contacts.ts';
import { angleDiffDeg, bearingDeg, slantRange, wrapDeg, type Vec3 } from '../coords.ts';
import type { RandomStream } from '../rng.ts';
import { gaussian } from './radar.ts';

// RF detector (SPEC §6.3, decision 53). Hears only contacts whose link emits
// (`emissions.rfActive`) within range and in line of sight; gives a bearing
// strobe (± noise), band and friendly ID code — never range. AUTONOMOUS_GNSS,
// FIBRE_OPTIC and NONE links are silent. Strobes are sim state, not events.

export const RF_SCAN_MS = 1000;
/** A strobe disappears this long after its last detection. */
export const RF_STROBE_TTL_MS = 3000;

export interface RfDetection {
  readonly contactId: string;
  readonly bearingDeg: number;
  readonly band: string | null;
  readonly friendlyIdCode: string | null;
}

export interface RfStrobe {
  readonly id: string;
  /** Ground truth link — for scoring/replay only; HUD must not display it. */
  readonly contactId: string;
  readonly sensorId: string;
  bearingDeg: number;
  band: string | null;
  friendlyIdCode: string | null;
  readonly firstTMs: number;
  lastTMs: number;
}

/** RF badge a radar track carries when a strobe lines up with it. */
export interface RfBadge {
  readonly strobeId: string;
  readonly band: string | null;
  readonly friendlyIdCode: string | null;
}

export function formatStrobeId(n: number): string {
  return `E${String(n).padStart(2, '0')}`;
}

/**
 * One scan over active contacts (sorted by id). Draws exactly two numbers per
 * active contact whether heard or not, so one contact never shifts another's
 * random sequence. Bearing noise σ = bearingErrDeg / 2.
 */
export function rfScan(
  sensor: RfSensor,
  sensorPos: Readonly<Vec3>,
  contacts: readonly ContactState[],
  specs: ReadonlyMap<string, ContactSpec>,
  stream: RandomStream,
  inLineOfSight: (c: ContactState) => boolean = () => true,
): RfDetection[] {
  const out: RfDetection[] = [];
  for (const c of contacts) {
    if (c.status !== 'ACTIVE') continue;
    const spec = specs.get(c.id);
    if (spec === undefined) continue;
    const noise = gaussian(stream);
    if (!spec.emissions.rfActive) continue;
    if (slantRange(sensorPos, c.pos) > sensor.rangeM) continue;
    if (!inLineOfSight(c)) continue;
    out.push({
      contactId: c.id,
      bearingDeg: wrapDeg(bearingDeg(sensorPos, c.pos) + (noise * sensor.bearingErrDeg) / 2),
      band: spec.emissions.rfBand ?? null,
      friendlyIdCode: spec.emissions.friendlyIdCode ?? null,
    });
  }
  return out;
}

/**
 * The strobe nearest in bearing to a track position, within the sensor's
 * bearing error; ties go to the lower strobe id. Null when none lines up.
 */
export function rfBadgeFor(
  trackPos: Readonly<Vec3>,
  strobes: readonly RfStrobe[],
  sensors: ReadonlyMap<string, { readonly cfg: RfSensor; readonly pos: Readonly<Vec3> }>,
): RfBadge | null {
  let best: RfStrobe | null = null;
  let bestDiff = Infinity;
  for (const s of strobes) {
    const sensor = sensors.get(s.sensorId);
    if (sensor === undefined) continue;
    const diff = Math.abs(angleDiffDeg(bearingDeg(sensor.pos, trackPos), s.bearingDeg));
    if (diff <= sensor.cfg.bearingErrDeg && diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best && { strobeId: best.id, band: best.band, friendlyIdCode: best.friendlyIdCode };
}
