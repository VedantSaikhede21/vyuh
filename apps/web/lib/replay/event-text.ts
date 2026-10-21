import type { SimEvent } from '@vyuh/shared';
import { CLASS_LABEL, EFFECTOR_LABEL } from '@/lib/strings';

// One line per stored event for the AAR event timeline (the fallback view and
// the replay's event list). After completion, ground truth may be shown, so
// contact ids and system events appear here — never in the live HUD.

const LOST_REASON: Record<string, string> = {
  MISSES: 'missed scans',
  LOS: 'no line of sight',
  OUT_OF_RANGE: 'out of range',
};

const END_REASON: Record<string, string> = {
  TIME_UP: 'time up',
  ALL_RESOLVED: 'all tracks resolved',
  ABORTED: 'ended by operator',
};

function response(r: string): string {
  return r === 'INTERCEPT' || r === 'EW_JAM' || r === 'EW_SPOOF'
    ? EFFECTOR_LABEL[r]
    : r.toLowerCase();
}

export interface EventLine {
  text: string;
  /** Who: the trainee's own actions, the sensors, or the hidden truth. */
  source: 'TRAINEE' | 'SENSOR' | 'TRUTH';
}

export function aarEventLine(e: SimEvent): EventLine | null {
  switch (e.type) {
    case 'CONTACT_SPAWNED':
      return { text: `Contact ${e.contactId} appeared`, source: 'TRUTH' };
    case 'CONTACT_DESPAWNED':
      return { text: `Contact ${e.contactId} left the area`, source: 'TRUTH' };
    case 'SENSOR_TRACK_CREATED':
      return {
        text: `New track ${e.trackId} (contact ${e.contactId})`,
        source: 'SENSOR',
      };
    case 'SENSOR_TRACK_LOST':
      return {
        text: `Track ${e.trackId} lost — ${LOST_REASON[e.payload.reason] ?? e.payload.reason}`,
        source: 'SENSOR',
      };
    case 'EO_IDENTIFIABLE':
      return {
        text: `Contact ${e.contactId} EO ${e.payload.level.toLowerCase()} at ${(e.payload.rangeM / 1000).toFixed(2)} km`,
        source: 'SENSOR',
      };
    case 'MARKED_DETECTED':
      return { text: `${e.trackId} marked detected`, source: 'TRAINEE' };
    case 'CLASSIFIED':
      return {
        text: `${e.trackId} classified ${CLASS_LABEL[e.payload.class]}`,
        source: 'TRAINEE',
      };
    case 'AFFILIATION_SET':
      return {
        text: `${e.trackId} declared ${e.payload.affiliation.toLowerCase()}`,
        source: 'TRAINEE',
      };
    case 'RESPONSE_ORDERED':
      return {
        text: `${response(e.payload.response)} ordered on ${e.trackId}`,
        source: 'TRAINEE',
      };
    case 'RESPONSE_OUTCOME':
      return {
        text: `${response(e.payload.response)} on ${e.trackId}: ${e.payload.result.toLowerCase().replaceAll('_', ' ')}`,
        source: 'SENSOR',
      };
    case 'REPORT_SUBMITTED':
      return {
        text: `Contact report: ${e.payload.trackIds.join(', ')}, ${e.payload.count} × ${
          e.payload.class === 'UNKNOWN' ? 'unknown' : CLASS_LABEL[e.payload.class]
        }`,
        source: 'TRAINEE',
      };
    case 'CONTACT_NEUTRALISED':
      return { text: `Contact ${e.contactId} neutralised`, source: 'TRUTH' };
    case 'CONTACT_REACHED_ASSET':
      return { text: `Contact ${e.contactId} reached the asset`, source: 'TRUTH' };
    case 'CONTACT_DROPPED':
      return { text: `Contact ${e.contactId} dropped its payload`, source: 'TRUTH' };
    case 'SESSION_ENDED':
      return {
        text: `Session ended — ${END_REASON[e.payload.reason] ?? e.payload.reason}`,
        source: 'SENSOR',
      };
    default:
      // SESSION_STARTED, selections, camera moves, REPORT_TRUTH, AI events.
      return null;
  }
}
