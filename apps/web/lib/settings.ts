'use client';

import { useEffect, useSyncExternalStore } from 'react';

// Per-browser settings (Phase 6C): conveniences only, so browser storage is
// right; every read and write survives blocked storage (private windows).

export type MotionSetting = 'SYSTEM' | 'REDUCE';

export interface UserSettings {
  /** SYSTEM follows prefers-reduced-motion; REDUCE always reduces (DESIGN §7). */
  motion: MotionSetting;
  /** Open the shortcut list (?) when a Practice run starts. */
  shortcutsOnStart: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = { motion: 'SYSTEM', shortcutsOnStart: false };

const KEY = 'vyuh.settings.v1';
const EVENT = 'vyuh:settings';

export function parseSettings(raw: string | null): UserSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<UserSettings>;
    return {
      motion: v.motion === 'REDUCE' ? 'REDUCE' : 'SYSTEM',
      shortcutsOnStart: v.shortcutsOnStart === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let cache: { raw: string | null; value: UserSettings } | null = null;

export function readSettings(): UserSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage blocked: defaults.
  }
  if (!cache || cache.raw !== raw) cache = { raw, value: parseSettings(raw) };
  return cache.value;
}

export function writeSettings(patch: Partial<UserSettings>): void {
  const next = { ...readSettings(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change lasts for this page only.
    cache = { raw: JSON.stringify(next), value: next };
  }
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

export function useSettings(): UserSettings {
  return useSyncExternalStore(subscribe, readSettings, () => DEFAULT_SETTINGS);
}

/** Reduced motion from the setting or the system (camera ease, video autoplay). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (readSettings().motion === 'REDUCE') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Mirrors the motion setting onto <html data-motion> so CSS can reduce motion too. */
export function MotionAttribute(): null {
  const { motion } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    if (motion === 'REDUCE') root.dataset.motion = 'reduce';
    else delete root.dataset.motion;
  }, [motion]);
  return null;
}
