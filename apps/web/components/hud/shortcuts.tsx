'use client';

import type { Affiliation } from '@vyuh/shared';
import { useEffect } from 'react';
import { AffiliationSymbol, Kbd, Panel, PanelBody, PanelHeader } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import type { Commands } from '@/lib/sim/commands';
import { useUiStore } from '@/lib/sim/ui-store';
import { CLASS_MENU, SHORTCUTS } from '@/lib/strings';

const AFFILIATION_KEYS: Record<string, Affiliation> = {
  h: 'HOSTILE',
  f: 'FRIENDLY',
  n: 'NEUTRAL',
  u: 'UNKNOWN',
};

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
      // The open report form takes its own keys (1–5, Enter, Esc); the library
      // dialog is reading, not acting: no order may go out behind it.
      if (ui.report || ui.library) return;

      if (ui.classifyMenu) {
        const item = CLASS_MENU.find((c) => c.key === e.key);
        if (item) {
          e.preventDefault();
          commands.classify(item.cls);
          return;
        }
      }
      if (e.key === 'Enter' && (ui.interceptArmed || ui.endArmed)) {
        e.preventDefault();
        if (ui.endArmed) commands.abort();
        else commands.confirmIntercept();
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
      else if (k === 'r') commands.openReport();
      else if (k === 'y') commands.acceptAi();
      else if (k === 'x') commands.rejectAi();
      else if (k === 'p') commands.togglePause();
      else if (k === 't') commands.toggleEoMode();
      else if (k === 'l') commands.openLibrary();
      else if (k === 'v') ui.set({ mainView: ui.mainView === 'EO' ? 'TACTICAL' : 'EO' });
      else if (k === 'w') ui.set({ mainView: ui.mainView === 'RADAR' ? 'TACTICAL' : 'RADAR' });
      else if (e.key === '.') ui.set({ moreOpen: !ui.moreOpen });
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commands]);
}

const AFFILIATIONS: Affiliation[] = ['HOSTILE', 'FRIENDLY', 'NEUTRAL', 'UNKNOWN'];

/** `?` sheet: every shortcut plus the APP-6 symbol legend (moved out of the player). */
export function CheatSheet({ practice = false }: { practice?: boolean }) {
  const open = useUiStore((s) => s.cheatSheet);
  const set = useUiStore((s) => s.set);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/80"
      role="dialog"
      aria-modal
      aria-labelledby="cheat-sheet-title"
    >
      <Panel className="w-[560px] max-w-[95vw] rounded-md shadow-overlay">
        <PanelHeader title="Shortcuts and symbols" titleId="cheat-sheet-title">
          <Button size="hud" variant="ghost" onClick={() => set({ cheatSheet: false })} autoFocus>
            Close <Kbd>Esc</Kbd>
          </Button>
        </PanelHeader>
        <PanelBody className="space-y-4">
          {practice && (
            <p className="text-small text-text-2" data-testid="cheat-sheet-held">
              Practice clock held while this list is open.
            </p>
          )}
          <dl className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-1.5 text-body">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="contents">
                <dt className="text-readout text-text-1">{s.keys}</dt>
                <dd className="text-text-2">{s.action}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-1.5 border-t border-line-1 pt-3">
            <p className="text-label">Affiliation (APP-6): shape, letter and colour</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body">
              {AFFILIATIONS.map((a) => (
                <li key={a} className="flex items-center gap-1.5">
                  <AffiliationSymbol affiliation={a} size={16} />
                  {AFFILIATION_STYLE[a].label}
                </li>
              ))}
              <li className="flex items-center gap-1.5 text-text-2">
                <AffiliationSymbol affiliation="UNKNOWN" size={16} filled />
                Filled = marked detected
              </li>
            </ul>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
