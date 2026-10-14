'use client';

import type { Affiliation } from '@vyuh/shared';
import { Button } from '@/components/ui/button';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import type { Commands } from '@/lib/sim/commands';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { CLASS_MENU, EFFECTOR_LABEL, ROE_HINT } from '@/lib/strings';

const AFFILIATIONS: Affiliation[] = ['HOSTILE', 'FRIENDLY', 'NEUTRAL', 'UNKNOWN'];

function Key({ k }: { k: string }) {
  return (
    <kbd className="ml-1 rounded-sm border border-border px-1 text-xs text-muted-foreground">
      {k}
    </kbd>
  );
}

/** Bottom-right action bar (SPEC §15): every action also has a keyboard shortcut. */
export function ActionBar({ commands }: { commands: Commands }) {
  const hud = useHudStore((s) => s.hud);
  const classifyMenu = useUiStore((s) => s.classifyMenu);
  const interceptArmed = useUiStore((s) => s.interceptArmed);
  const setUi = useUiStore((s) => s.set);
  if (!hud) return null;
  const selected = hud.tracks.find((t) => t.id === hud.selectedTrackId) ?? null;
  const interceptor = hud.effectors.find((e) => e.kind === 'INTERCEPT') ?? null;
  const jammer = hud.effectors.find((e) => e.kind === 'EW_JAM') ?? null;
  const spoofer = hud.effectors.find((e) => e.kind === 'EW_SPOOF') ?? null;
  const noTrack = selected === null || hud.endReason !== null;

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto text-sm">
      <div className="hud-label">
        Selected: <span className="font-mono text-foreground">{selected?.id ?? 'none'}</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="outline" disabled={noTrack} onClick={commands.markDetected}>
          Detected <Key k="D" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={noTrack}
          onClick={() => setUi({ classifyMenu: !classifyMenu, interceptArmed: false })}
        >
          Classify <Key k="C" />
        </Button>
      </div>

      {classifyMenu && !noTrack && (
        <div
          className="grid grid-cols-2 gap-1 border border-border bg-card p-1.5"
          role="menu"
          aria-label="Classify"
        >
          {CLASS_MENU.map((c) => (
            <button
              key={c.cls}
              role="menuitem"
              className="flex items-center gap-1.5 px-1.5 py-0.5 text-left text-xs hover:bg-muted"
              onClick={() => commands.classify(c.cls)}
            >
              <kbd className="font-mono text-primary">{c.key}</kbd> {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1">
        {AFFILIATIONS.map((a) => {
          const s = AFFILIATION_STYLE[a];
          const active = selected?.affiliation === a;
          return (
            <button
              key={a}
              disabled={noTrack}
              onClick={() => commands.setAffiliation(a)}
              title={`${s.label} (${s.letter})`}
              aria-pressed={active}
              className="rounded-sm border px-1 py-1 font-mono text-xs font-bold disabled:opacity-40"
              style={{
                borderColor: s.hex,
                color: active ? '#000' : s.hex,
                background: active ? s.hex : 'transparent',
              }}
            >
              {s.letter} {s.label.slice(0, 4).toUpperCase()}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="outline" disabled={noTrack} onClick={commands.monitor}>
          Monitor <Key k="M" />
        </Button>
        {interceptArmed ? (
          <Button size="sm" variant="destructive" onClick={commands.confirmIntercept}>
            Confirm <Key k="Enter" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            disabled={noTrack || !interceptor}
            onClick={commands.armIntercept}
          >
            Intercept <Key k="I" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={noTrack || !jammer}
          onClick={commands.jam}
          title="Jam the RF link of everything in a ±10° sector toward the track"
        >
          Jam <Key k="J" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={noTrack || !spoofer}
          onClick={commands.spoof}
          title="Spoof GNSS navigation in a ±10° sector toward the track"
        >
          Spoof <Key k="S" />
        </Button>
      </div>

      {hud.effectors.length > 0 && (
        <div className="mt-auto space-y-1 border-t border-border pt-1.5 font-mono text-xs">
          {hud.effectors.map((e) => {
            const left = Math.max(0, e.readyAtMs - hud.tMs);
            return (
              <div key={e.id}>
                <div className="flex justify-between gap-2">
                  <span className="hud-label">
                    {EFFECTOR_LABEL[e.kind]} {e.id}
                  </span>
                  <span>
                    {e.ammo === null ? '∞' : e.ammo} · {(e.rangeM / 1000).toFixed(1)} km ·{' '}
                    {left > 0 ? `${(left / 1000).toFixed(1)} s` : 'ready'}
                  </span>
                </div>
                <div className="h-1 bg-muted" aria-label={`${e.id} cooldown`}>
                  <div
                    className="h-full bg-warning"
                    style={{ width: `${e.cooldownMs ? (left / e.cooldownMs) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className="text-muted-foreground">{ROE_HINT[hud.roe]}</div>
        </div>
      )}
    </div>
  );
}
