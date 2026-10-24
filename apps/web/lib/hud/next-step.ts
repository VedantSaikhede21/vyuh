import type { EoTrackMode } from '@vyuh/sim-core';
import type { TrackView } from '@/lib/sim/store';

// Practice-mode "what next" for the selected track (audit P0-5): the next
// kill-chain step the trainee has not done yet, with its key. Built only from
// what the operator can see — the track as reported, the camera state and
// their own logged actions — never from ground truth (no EO_IDENTIFIABLE,
// which names the contact). Assessment shows nothing.

export interface NextStep {
  text: string;
  /** Keys to show, e.g. ['H', 'F', 'N', 'U']. */
  keys: readonly string[];
}

export interface NextStepInput {
  tracks: readonly TrackView[];
  selectedTrackId: string | null;
  eo: { lockTrackId: string | null; trackMode: EoTrackMode };
  /** Tracks the trainee has ordered any response on (monitor, jam, spoof, intercept). */
  responded: ReadonlySet<string>;
  /** Tracks named in a contact report the trainee sent. */
  reported: ReadonlySet<string>;
}

/** A track still needing attention: not yet given a response. */
const open = (t: TrackView, responded: ReadonlySet<string>) =>
  t.status === 'ACTIVE' && !responded.has(t.id);

export function nextStep(i: NextStepInput): NextStep | null {
  const active = i.tracks.filter((t) => t.status === 'ACTIVE');
  const sel = active.find((t) => t.id === i.selectedTrackId) ?? null;
  if (!sel) {
    return active.length > 0
      ? { text: 'Select a track', keys: ['Tab'] }
      : { text: 'Watch the radar for new tracks', keys: [] };
  }
  if (!sel.markedDetected) return { text: `Mark ${sel.id} detected`, keys: ['D'] };
  if (i.eo.lockTrackId !== sel.id) return { text: 'Cue the camera to it', keys: ['Space'] };
  if (sel.classifiedAs === null) {
    return i.eo.trackMode === 'TRACK'
      ? { text: 'Classify what the camera shows', keys: ['C'] }
      : { text: 'Zoom in until the camera holds it, then classify', keys: ['+', 'C'] };
  }
  if (sel.affiliation === 'UNKNOWN') {
    return { text: 'Set its affiliation', keys: ['H', 'F', 'N', 'U'] };
  }
  if (!i.responded.has(sel.id)) {
    return sel.affiliation === 'HOSTILE'
      ? { text: 'Respond: jam, spoof or intercept', keys: ['J', 'S', 'I'] }
      : { text: 'Monitor it', keys: ['M'] };
  }
  if (sel.affiliation === 'HOSTILE' && !i.reported.has(sel.id)) {
    return { text: 'Send a contact report', keys: ['R'] };
  }
  return active.some((t) => t.id !== sel.id && open(t, i.responded))
    ? { text: 'Select the next track', keys: ['Tab'] }
    : { text: 'Watch the radar for new tracks', keys: [] };
}
