'use client';

import type { Affiliation } from '@vyuh/shared';
import { Button } from '@/components/ui/button';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import type { Commands } from '@/lib/sim/commands';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { CLASS_MENU, ROE_HINT } from '@/lib/strings';

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
  const cooldownLeft = interceptor ? Math.max(0, interceptor.readyAtMs - hud.tMs) : 0;
  const noTrack = selected === null || hud.endReason !== null;

  return (
    <div className="flex h-full flex-col gap-2 text-sm">
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
        <Button size="sm" variant="outline" disabled title="EW jamming arrives in a later phase">
          Jam <Key k="J" />
        </Button>
        <Button size="sm" variant="outline" disabled title="EW spoofing arrives in a later phase">
          Spoof <Key k="S" />
        </Button>
      </div>

      {interceptor && (
        <div className="mt-auto space-y-1 border-t border-border pt-2 font-mono text-xs">
          <div className="flex justify-between">
            <span className="hud-label">Interceptor {interceptor.id}</span>
            <span>
              {interceptor.ammo === null ? '∞' : interceptor.ammo} rnd ·{' '}
              {(interceptor.rangeM / 1000).toFixed(1)} km
            </span>
          </div>
          <div className="h-1.5 bg-muted" aria-label="Interceptor cooldown">
            <div
              className="h-full bg-warning"
              style={{
                width: `${interceptor.cooldownMs ? (cooldownLeft / interceptor.cooldownMs) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="text-muted-foreground">
            {cooldownLeft > 0 ? `Reloading ${(cooldownLeft / 1000).toFixed(1)} s` : 'Ready'} ·{' '}
            {ROE_HINT[hud.roe]}
          </div>
        </div>
      )}
    </div>
  );
}
