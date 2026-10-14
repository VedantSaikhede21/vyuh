'use client';

import type { Affiliation } from '@vyuh/shared';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { Commands } from '@/lib/sim/commands';
import { useUiStore } from '@/lib/sim/ui-store';
import { CLASS_MENU, SHORTCUTS } from '@/lib/strings';

const AFFILIATION_KEYS: Record<string, Affiliation> = {
  h: 'HOSTILE',
  f: 'FRIENDLY',
  n: 'NEUTRAL',
  u: 'UNKNOWN',
};
const LATER_KEYS = new Set(['r', 'y', 'x']);

/** SPEC §15.1 keyboard shortcuts. Ignored while typing in a form field. */
export function useShortcuts(commands: Commands | null): void {
  useEffect(() => {
    if (!commands) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ui = useUiStore.getState();
      const k = e.key.toLowerCase();

      if (ui.classifyMenu) {
        const item = CLASS_MENU.find((c) => c.key === e.key);
        if (item) {
          e.preventDefault();
          commands.classify(item.cls);
          return;
        }
      }
      if (ui.interceptArmed && e.key === 'Enter') {
        e.preventDefault();
        commands.confirmIntercept();
        return;
      }
      if (ui.interceptArmed && k !== 'i') ui.set({ interceptArmed: false });

      let handled = true;
      if (e.key === 'Tab') commands.cycle(e.shiftKey ? -1 : 1);
      else if (e.key === ' ') commands.slewToSelected();
      else if (e.key === '+' || e.key === '=') commands.zoom(1);
      else if (e.key === '-' || e.key === '_') commands.zoom(-1);
      else if (e.key === 'Escape') commands.cancel();
      else if (e.key === '?') ui.set({ cheatSheet: !ui.cheatSheet });
      else if (k === 'd') commands.markDetected();
      else if (k === 'c') ui.set({ classifyMenu: !ui.classifyMenu, interceptArmed: false });
      else if (k in AFFILIATION_KEYS) commands.setAffiliation(AFFILIATION_KEYS[k]!);
      else if (k === 'm') commands.monitor();
      else if (k === 'j') commands.jam();
      else if (k === 's') commands.spoof();
      else if (k === 'i') commands.armIntercept();
      else if (k === 'p') commands.togglePause();
      else if (k === 't') commands.toggleEoMode();
      else if (LATER_KEYS.has(k)) {
        ui.set({ message: { text: 'That action arrives in a later phase.', tone: 'info' } });
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commands]);
}

export function CheatSheet() {
  const open = useUiStore((s) => s.cheatSheet);
  const set = useUiStore((s) => s.set);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div className="w-[520px] max-w-[95vw] border border-line-1 bg-bg-1 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-panel-title">Shortcuts</h2>
          <Button size="sm" variant="ghost" onClick={() => set({ cheatSheet: false })}>
            Close (Esc)
          </Button>
        </div>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-body">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <dt className="font-mono text-text-1">{s.keys}</dt>
              <dd className={s.later ? 'text-text-2' : ''}>
                {s.action}
                {s.later && ' (later phase)'}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
