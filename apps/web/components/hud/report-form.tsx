'use client';

import { Affiliation, AltitudeBand, type ReportedClass } from '@vyuh/shared';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { AffiliationSymbol, Kbd, PanelHeader, StateChip } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import { ALTITUDE_BAND_LABEL, formatBearing, formatKm } from '@/lib/hud/derive';
import { ACTIVITY_KEYS, nearbyTracks, toggleReportTrack, type ReportDraft } from '@/lib/hud/report';
import type { Commands } from '@/lib/sim/commands';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { CLASS_MENU } from '@/lib/strings';
import { cn } from '@/lib/utils';

// Contact report form (DESIGN §11.5 Report group, SPEC §4.3). Opens over the
// action bar with R, prefilled from the selected track; the trainee picks the
// activity (1–5) and sends with Enter — three keys in all. Esc cancels.

const FIELD = 'h-7 px-2 text-small';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <label htmlFor={htmlFor} className="block text-label">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ReportForm({ commands }: { commands: Commands }) {
  const draft = useUiStore((s) => s.report);
  const hud = useHudStore((s) => s.hud);
  const activityRef = useRef<HTMLDivElement>(null);
  const open = draft !== null;

  // Focus lands on the activity choice, so 1–5 then Enter finishes the report.
  useEffect(() => {
    if (open)
      activityRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, [open]);

  if (!draft || !hud) return null;
  const first = hud.tracks.find((t) => t.id === draft.trackIds[0]);
  const offered = first ? [first, ...nearbyTracks(hud, first)] : [];
  // Tracks already in the report stay offered even if they drift apart.
  for (const id of draft.trackIds) {
    const t = hud.tracks.find((x) => x.id === id);
    if (t && !offered.includes(t)) offered.push(t);
  }
  const update = (patch: Partial<ReportDraft>) => commands.updateReport({ ...draft, ...patch });

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    const el = e.target as HTMLElement;
    const typing = el.tagName === 'INPUT';
    if (e.key === 'Escape') {
      e.preventDefault();
      commands.cancel();
      return;
    }
    if (!typing && el.tagName !== 'SELECT') {
      const a = ACTIVITY_KEYS.find((x) => x.key === e.key);
      if (a) {
        e.preventDefault();
        update({ activity: a.activity });
        // Focus follows the choice, so the ring and the selection agree.
        activityRef.current
          ?.querySelector<HTMLButtonElement>(`[data-testid="report-activity-${a.activity}"]`)
          ?.focus();
        return;
      }
    }
    if (e.key === 'Enter' && el.dataset.reportCancel === undefined) {
      e.preventDefault();
      commands.submitReport();
    }
  };

  return (
    <form
      aria-label="Contact report"
      data-testid="report-form"
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        commands.submitReport();
      }}
      className="absolute bottom-0 left-0 right-0 z-40 flex flex-col border border-line-2 bg-bg-1 shadow-overlay"
    >
      <PanelHeader title="Contact report">
        <StateChip tone="active">
          {draft.trackIds.length} track{draft.trackIds.length === 1 ? '' : 's'}
        </StateChip>
      </PanelHeader>
      <div className="space-y-1.5 p-2">
        <div role="group" aria-label="Tracks in this report" className="space-y-0.5">
          <div className="text-label">Tracks</div>
          <div className="flex flex-wrap gap-1">
            {offered.map((t) => {
              const on = draft.trackIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  disabled={on && draft.trackIds.length === 1}
                  onClick={() => commands.updateReport(toggleReportTrack(hud, draft, t.id))}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 font-mono text-small transition-colors duration-150 ease-ui focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-select disabled:cursor-default',
                    on
                      ? 'border-select bg-bg-3 text-text-1'
                      : 'border-line-2 text-text-2 hover:bg-bg-2',
                  )}
                >
                  <AffiliationSymbol affiliation={t.affiliation} size={10} />
                  {t.id}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-1">
          <Field label="Count" htmlFor="report-count">
            <Input
              id="report-count"
              type="number"
              min={1}
              max={99}
              value={draft.count}
              onChange={(e) =>
                update({ count: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })
              }
              className={cn(FIELD, 'font-mono')}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Class" htmlFor="report-class">
              <Select
                id="report-class"
                value={draft.class}
                onChange={(e) => update({ class: e.target.value as ReportedClass })}
                className={FIELD}
              >
                <option value="UNKNOWN">Unknown type</option>
                {CLASS_MENU.map((c) => (
                  <option key={c.cls} value={c.cls}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Affil." htmlFor="report-affiliation">
            <Select
              id="report-affiliation"
              value={draft.affiliation}
              onChange={(e) => update({ affiliation: e.target.value as Affiliation })}
              className={FIELD}
            >
              {Affiliation.options.map((a) => (
                <option key={a} value={a}>
                  {AFFILIATION_STYLE[a].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Height" htmlFor="report-altitude">
            <Select
              id="report-altitude"
              value={draft.altitudeBand}
              onChange={(e) => update({ altitudeBand: e.target.value as AltitudeBand })}
              className={FIELD}
            >
              {AltitudeBand.options.map((b) => (
                <option key={b} value={b}>
                  {ALTITUDE_BAND_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Heading °" htmlFor="report-heading">
            <Input
              id="report-heading"
              type="number"
              min={0}
              max={359}
              value={draft.headingDeg}
              onChange={(e) =>
                update({
                  headingDeg: ((Math.round(Number(e.target.value) || 0) % 360) + 360) % 360,
                  headingKnown: true,
                })
              }
              title={draft.headingKnown ? undefined : 'No heading estimate yet — enter one'}
              className={cn(FIELD, 'font-mono', !draft.headingKnown && 'text-text-3')}
            />
          </Field>
        </div>
        <p className="text-small text-text-2" aria-label="Location">
          <span className="text-label">Location</span>{' '}
          <span className="font-mono text-text-1">
            {formatBearing(draft.bearingDeg)} · {formatKm(draft.rangeM)}
            <span className="text-text-3"> km</span>
          </span>{' '}
          from {draft.fromSensorId}
        </p>
        <div className="space-y-0.5">
          <div className="text-label" id="report-activity-label">
            Activity
          </div>
          <div
            ref={activityRef}
            role="group"
            aria-labelledby="report-activity-label"
            className="grid grid-cols-5 gap-1"
          >
            {ACTIVITY_KEYS.map((a) => {
              const on = draft.activity === a.activity;
              return (
                <button
                  key={a.activity}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${a.label} (${a.key})`}
                  title={a.label}
                  data-testid={`report-activity-${a.activity}`}
                  onClick={() => update({ activity: a.activity })}
                  className={cn(
                    'flex h-7 min-w-0 items-center justify-center gap-1 rounded-sm border text-small transition-colors duration-150 ease-ui focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-select',
                    on
                      ? 'border-select bg-bg-3 text-text-1'
                      : 'border-line-2 text-text-2 hover:bg-bg-2',
                  )}
                >
                  <Kbd>{a.key}</Kbd>
                  <span className="text-label text-current">{a.short}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-1 pt-0.5">
          <Button
            type="button"
            size="hud"
            variant="ghost"
            data-report-cancel=""
            onClick={commands.cancel}
          >
            Cancel <Kbd>Esc</Kbd>
          </Button>
          <Button type="submit" size="hud" data-testid="report-send">
            Send report <Kbd>Enter</Kbd>
          </Button>
        </div>
      </div>
    </form>
  );
}
