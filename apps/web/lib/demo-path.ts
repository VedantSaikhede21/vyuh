'use client';

import { useSyncExternalStore } from 'react';

// The guest's demo path (SPEC §20, Phase 6E): six steps a judge walks through in
// about five minutes. A step is done once its page has been seen; progress is a
// per-browser convenience (localStorage), never needed for anything to work.

export type DemoStep = 'play' | 'result' | 'replay' | 'unit' | 'text' | 'sources';

export interface DemoStepInfo {
  id: DemoStep;
  label: string;
}

export const DEMO_STEPS: readonly DemoStepInfo[] = [
  { id: 'play', label: 'Play S15 in Practice' },
  { id: 'result', label: 'Score and debrief' },
  { id: 'replay', label: 'Replay with ground truth' },
  { id: 'unit', label: 'Unit view, demo data' },
  { id: 'text', label: 'Scenario from text' },
  { id: 'sources', label: 'Sources' },
];

export interface DemoPathState {
  done: readonly DemoStep[];
  /** The guest's latest session: the result and its replay link to it. */
  lastSession?: string;
}

const EMPTY: DemoPathState = { done: [] };

/** The step a page completes, and the session it is about (if any). */
export function stepFromPath(path: string): { step: DemoStep; session?: string } | null {
  const session = /^\/train\/session\/([^/]+)$/.exec(path)?.[1];
  if (session) return { step: 'play', session };
  const replay = /^\/aar\/session\/([^/]+)$/.exec(path)?.[1];
  if (replay) return { step: 'replay', session: replay };
  if (path === '/instructor') return { step: 'unit' };
  if (path === '/instructor/text') return { step: 'text' };
  if (path === '/sources') return { step: 'sources' };
  return null;
}

export function markStep(state: DemoPathState, step: DemoStep, session?: string): DemoPathState {
  const done = state.done.includes(step) ? state.done : [...state.done, step];
  const lastSession = step === 'play' && session ? session : state.lastSession;
  if (done === state.done && lastSession === state.lastSession) return state;
  return lastSession ? { done, lastSession } : { done };
}

/** The first step not done yet, or null when the path is complete. */
export function nextStep(state: DemoPathState): DemoStep | null {
  return DEMO_STEPS.find((s) => !state.done.includes(s.id))?.id ?? null;
}

export function stepHref(step: DemoStep, state: DemoPathState): string {
  const s = state.lastSession;
  switch (step) {
    case 'play':
      return '/train';
    case 'result':
      return s ? `/train/session/${s}` : '/train';
    case 'replay':
      return s ? `/aar/session/${s}` : '/aar/trends';
    case 'unit':
      return '/instructor';
    case 'text':
      return '/instructor/text';
    case 'sources':
      return '/sources';
  }
}

// ---- Per-browser store ---------------------------------------------------------------------

const EVENT = 'vyuh:demo-path';
const key = (userId: string) => `vyuh.demoPath.v1.${userId}`;

export function parseDemoPath(raw: string | null): DemoPathState {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<DemoPathState>;
    const ids = new Set(DEMO_STEPS.map((s) => s.id));
    const done = Array.isArray(v.done) ? v.done.filter((d): d is DemoStep => ids.has(d)) : [];
    return typeof v.lastSession === 'string' ? { done, lastSession: v.lastSession } : { done };
  } catch {
    return EMPTY;
  }
}

const cache = new Map<string, { raw: string | null; value: DemoPathState }>();

function read(userId: string): DemoPathState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key(userId));
  } catch {
    // Storage blocked: the path starts empty on every page (still usable).
  }
  const hit = cache.get(userId);
  if (hit && hit.raw === raw) return hit.value;
  const value = parseDemoPath(raw);
  cache.set(userId, { raw, value });
  return value;
}

export function recordDemoStep(userId: string, step: DemoStep, session?: string): void {
  const before = read(userId);
  const after = markStep(before, step, session);
  if (after === before) return;
  const raw = JSON.stringify(after);
  try {
    window.localStorage.setItem(key(userId), raw);
  } catch {
    // Blocked: keep it for this page only.
  }
  cache.set(userId, { raw, value: after });
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useDemoPath(userId: string): DemoPathState {
  return useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => EMPTY,
  );
}
