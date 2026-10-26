'use client';

import { useSyncExternalStore } from 'react';

// Guided tours (SPEC §20 step 2, Phase 6E): in-house, a spotlight on one region and
// a step card beside it. Pure placement and progress rules here; the overlay is
// components/tour/guided-tour.tsx.

export type TourId = 'player' | 'result' | 'aar';

export interface TourStep {
  /** CSS selector of the region explained. */
  target: string;
  title: string;
  body: string;
}

export const TOURS: Readonly<Record<TourId, readonly TourStep[]>> = {
  player: [
    {
      target: '[data-tour="tactical"]',
      title: 'Tactical view',
      body: 'The area in 3D: terrain, the defended asset and zones. Tracks appear as symbols once a sensor reports them, and the view follows the track you select.',
    },
    {
      target: '[data-tour="radar"]',
      title: 'Radar',
      body: 'Top-down scope, north up, rings every 1 km. Each sweep can report a track. Birds and civilian drones make tracks too.',
    },
    {
      target: '[data-tour="tracks"]',
      title: 'Track list',
      body: 'Every track the sensors hold: class, range, bearing, height. Select one by clicking it or with Tab. The RF and Spectrogram tabs help tell a drone from a bird.',
    },
    {
      target: '[data-tour="eo"]',
      title: 'EO/IR camera',
      body: 'Space cues the camera to the selected track. Identify the shape here before you act. T switches to thermal; + and − zoom.',
    },
    {
      target: '[data-tour="actions"]',
      title: 'Actions',
      body: 'Identify first: mark D, classify C, affiliation H, F or N. Then respond: monitor M, jam J, intercept I and Enter. A disabled action says why.',
    },
    {
      target: '[data-tour="report"]',
      title: 'Contact report',
      body: 'R opens the report on the selected track: what it is, where, and what it is doing. Report before you engage.',
    },
    {
      target: '[data-tour="ai"]',
      title: 'AI assist',
      body: 'With a track selected, the AI suggests a class and a confidence. It is sometimes wrong. Y accepts, X rejects; the replay shows how far you trusted it.',
    },
  ],
  result: [
    {
      target: '[data-tour="score"]',
      title: 'Score',
      body: 'Scored on the server from your event log: detection, classification, response and reporting, then penalties. The rating moves only in Assessment.',
    },
    {
      target: '#debrief',
      title: 'Debrief',
      body: 'What went well, the mistakes with their times, and one drill to practise next.',
    },
    {
      target: '[data-testid="open-replay"]',
      title: 'Replay',
      body: 'Opens the after-action replay of this run: every track and order on a timeline, with what was really there.',
    },
  ],
  aar: [
    {
      target: '[data-testid="replay-timeline"]',
      title: 'Timeline',
      body: 'Play or scrub the run. Arrow keys step 1 s, Shift and an arrow 10 s. Markers show your orders and the outcomes.',
    },
    {
      target: '[data-testid="truth-toggle"]',
      title: 'Ground truth',
      body: 'G shows what was really there: each track’s true class, and contacts the sensors never reported.',
    },
    {
      target: '[data-testid="kill-chain"]',
      title: 'Kill chain',
      body: 'Each contact’s stages, from detect to assess. Select a stage to jump the replay to that moment.',
    },
    {
      target: '[data-testid="aar-side"]',
      title: 'Debrief and AI trust',
      body: 'The written debrief, instructor remarks, and how often you accepted a wrong AI suggestion.',
    },
  ],
};

// ---- Placement -------------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Side = 'right' | 'left' | 'bottom' | 'top' | 'center';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/**
 * Where the card goes: beside the target on the first side with room (right,
 * left, below, above), never over it; with no target, centred. When no side
 * has room, the side with the most room, clamped to the viewport.
 */
export function placeCard(
  target: Rect | null,
  card: { w: number; h: number },
  view: { w: number; h: number },
  gap = 12,
  margin = 8,
): { x: number; y: number; side: Side } {
  if (!target) {
    return {
      x: Math.round((view.w - card.w) / 2),
      y: Math.round((view.h - card.h) / 2),
      side: 'center',
    };
  }
  const yBeside = clamp(target.y, margin, view.h - card.h - margin);
  const xAround = clamp(target.x, margin, view.w - card.w - margin);
  const options: { side: Side; x: number; y: number; room: number }[] = [
    {
      side: 'right',
      x: target.x + target.w + gap,
      y: yBeside,
      room: view.w - margin - (target.x + target.w + gap),
    },
    { side: 'left', x: target.x - gap - card.w, y: yBeside, room: target.x - gap - margin },
    {
      side: 'bottom',
      x: xAround,
      y: target.y + target.h + gap,
      room: view.h - margin - (target.y + target.h + gap),
    },
    { side: 'top', x: xAround, y: target.y - gap - card.h, room: target.y - gap - margin },
  ];
  const need = (o: (typeof options)[number]) =>
    o.side === 'left' || o.side === 'right' ? card.w : card.h;
  const fit = options.find((o) => o.room >= need(o));
  if (fit) return { x: Math.round(fit.x), y: Math.round(fit.y), side: fit.side };
  const best = options.reduce((a, b) => (b.room / need(b) > a.room / need(a) ? b : a));
  return {
    x: Math.round(clamp(best.x, margin, view.w - card.w - margin)),
    y: Math.round(clamp(best.y, margin, view.h - card.h - margin)),
    side: best.side,
  };
}

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---- Progress (per browser; a convenience, never needed for anything to work) ------------------

export interface TourRecord {
  step: number;
  status: 'open' | 'done' | 'skipped';
}
export type TourProgress = Partial<Record<TourId, TourRecord>>;

/** Opens by itself: asked for (open, resumes at its step), or never seen and `auto`. */
export function shouldOpen(progress: TourProgress, id: TourId, auto: boolean): boolean {
  const r = progress[id];
  return r ? r.status === 'open' : auto;
}

export function parseTourProgress(raw: string | null): TourProgress {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, Partial<TourRecord>>;
    const out: TourProgress = {};
    for (const id of Object.keys(TOURS) as TourId[]) {
      const r = v[id];
      if (r && typeof r.step === 'number' && ['open', 'done', 'skipped'].includes(r.status ?? '')) {
        out[id] = {
          step: clamp(Math.floor(r.step), 0, TOURS[id].length - 1),
          status: r.status as TourRecord['status'],
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

const NO_PROGRESS: TourProgress = {};
const KEY = 'vyuh.tours.v1';
const EVENT = 'vyuh:tours';
let cache: { raw: string | null; value: TourProgress } | null = null;

export function readTourProgress(): TourProgress {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Blocked storage: no progress kept.
  }
  if (!cache || cache.raw !== raw) cache = { raw, value: parseTourProgress(raw) };
  return cache.value;
}

function write(next: TourProgress): void {
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Blocked: this page only.
  }
  cache = { raw, value: next };
  window.dispatchEvent(new Event(EVENT));
}

export function saveTour(id: TourId, record: TourRecord): void {
  write({ ...readTourProgress(), [id]: record });
}

/** Help → "Show the tours again": each tour opens at its first step next time. */
export function requestTours(ids: readonly TourId[] = ['player', 'result', 'aar']): void {
  const next = { ...readTourProgress() };
  for (const id of ids) next[id] = { step: 0, status: 'open' };
  write(next);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useTourProgress(): TourProgress {
  return useSyncExternalStore(subscribe, readTourProgress, () => NO_PROGRESS);
}
