'use client';

import { memo, useEffect, useState, type ReactNode } from 'react';
import { AffiliationSymbol, StatusNotice } from '@/components/hud/primitives';
import { ALTITUDE_BAND_LABEL, altitudeBand, formatBearing, formatKm } from '@/lib/hud/derive';
import { rfBadgeText } from '@/lib/rf';
import type { Commands } from '@/lib/sim/commands';
import { useHudStore, type TrackView } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { CLASS_LABEL } from '@/lib/strings';
import { cn } from '@/lib/utils';

const HEAD = 'sticky top-0 z-[1] h-7 bg-bg-2 px-2 text-left text-label font-medium';
const CELL = 'h-8 px-2 whitespace-nowrap';

/**
 * Track list — the primary control surface (DESIGN §11.5): symbol, id, class,
 * range, bearing, altitude band (never exact height), RF badge and state.
 * Keyboard focus follows the selection.
 */
/** An extra column supplied by the AAR (ground truth); the HUD never computes it. */
export interface TrackColumn {
  header: string;
  cell: (trackId: string) => ReactNode;
}

export function TrackList({ commands, column }: { commands: Commands; column?: TrackColumn }) {
  const hud = useHudStore((s) => s.hud);
  // Row elements by track id (stable for the list's life; written by the rows' refs).
  const [rows] = useState(() => new Map<string, HTMLTableRowElement>());
  const selectedId = hud?.selectedTrackId ?? null;

  useEffect(() => {
    const row = selectedId ? rows.get(selectedId) : undefined;
    if (!row) return;
    // An open contact report keeps the keyboard (its selection may land a tick later).
    if (row.closest('[role=tabpanel]') && !useUiStore.getState().report) {
      row.focus({ preventScroll: true });
    }
    row.scrollIntoView({ block: 'nearest' });
  }, [rows, selectedId]);

  const tracks = hud?.tracks ?? [];
  if (tracks.length === 0) {
    return (
      <StatusNotice title="No radar tracks yet.">
        New tracks appear here and on the PPI as the radar detects them.
      </StatusNotice>
    );
  }
  return (
    <table className="w-full border-collapse text-readout" aria-label="Tracks">
      <thead>
        <tr>
          <th className={cn(HEAD, 'w-8')}>
            <span className="sr-only">Affiliation</span>
          </th>
          <th className={HEAD}>Track</th>
          <th className={HEAD}>Class</th>
          <th className={cn(HEAD, 'text-right')}>Range</th>
          <th className={cn(HEAD, 'text-right')}>Brg</th>
          <th className={HEAD}>Alt</th>
          <th className={HEAD}>RF</th>
          <th className={HEAD}>State</th>
          {column && <th className={HEAD}>{column.header}</th>}
        </tr>
      </thead>
      <tbody>
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            t={t}
            selected={t.id === selectedId}
            rows={rows}
            commands={commands}
            column={column}
          />
        ))}
      </tbody>
    </table>
  );
}

/** Same values on screen: a fresh snapshot object alone does not re-render the row. */
function sameTrack(a: TrackView, b: TrackView): boolean {
  return (
    a.status === b.status &&
    a.rangeM === b.rangeM &&
    a.bearingDeg === b.bearingDeg &&
    altitudeBand(a.altitudeAglM) === altitudeBand(b.altitudeAglM) &&
    a.markedDetected === b.markedDetected &&
    a.classifiedAs === b.classifiedAs &&
    a.affiliation === b.affiliation &&
    a.rf?.band === b.rf?.band &&
    a.rf?.friendlyIdCode === b.rf?.friendlyIdCode
  );
}

interface TrackRowProps {
  t: TrackView;
  selected: boolean;
  rows: Map<string, HTMLTableRowElement>;
  commands: Commands;
  column?: TrackColumn;
}

/**
 * One track row. Re-renders only when a value it shows changes (the HUD snapshot
 * is a new object every tick), the selection moves, or the AAR column changes.
 */
const TrackRow = memo(
  function TrackRow({ t, selected, rows, commands, column }: TrackRowProps) {
    const lost = t.status === 'LOST';
    return (
      <tr
        ref={(el) => {
          if (el) rows.set(t.id, el);
          else rows.delete(t.id);
        }}
        tabIndex={-1}
        data-track-id={t.id}
        aria-selected={selected}
        onClick={() => !lost && commands.select(t.id)}
        className={cn(
          'border-t border-line-1 outline-none',
          lost ? 'text-text-3' : 'cursor-pointer hover:bg-bg-2',
          selected && 'bg-bg-3 shadow-[inset_2px_0_0_var(--select)]',
        )}
      >
        <td className={cn(CELL, 'w-8')}>
          <AffiliationSymbol
            affiliation={t.affiliation}
            filled={t.markedDetected}
            className={lost ? 'opacity-40' : undefined}
          />
        </td>
        <td className={cn(CELL, 'text-text-1', lost && 'text-text-3 line-through')}>{t.id}</td>
        <td className={cn(CELL, 'max-w-40 truncate font-sans text-body')}>
          {t.classifiedAs ? CLASS_LABEL[t.classifiedAs] : <span className="text-text-3">—</span>}
        </td>
        <td className={cn(CELL, 'text-right')}>
          {formatKm(t.rangeM)}
          <span className="ml-1 text-text-3">km</span>
        </td>
        <td className={cn(CELL, 'text-right')}>{formatBearing(t.bearingDeg)}</td>
        <td className={CELL}>{ALTITUDE_BAND_LABEL[altitudeBand(t.altitudeAglM)]}</td>
        <td className={cn(CELL, 'text-text-2')}>
          {t.rf ? `RF ${rfBadgeText(t.rf)}` : <span className="text-text-3">—</span>}
        </td>
        <td className={cn(CELL, 'text-label')}>
          {lost ? 'LOST' : t.markedDetected ? 'DETECTED' : 'NEW'}
        </td>
        {column && <td className={cn(CELL, 'font-sans text-body')}>{column.cell(t.id)}</td>}
      </tr>
    );
  },
  (a, b) =>
    a.selected === b.selected &&
    a.rows === b.rows &&
    a.commands === b.commands &&
    a.column === b.column &&
    sameTrack(a.t, b.t),
);
