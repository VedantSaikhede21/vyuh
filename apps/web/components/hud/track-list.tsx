'use client';

import { useEffect, useRef } from 'react';
import { AffiliationSymbol, StatusNotice } from '@/components/hud/primitives';
import { ALTITUDE_BAND_LABEL, altitudeBand, formatBearing, formatKm } from '@/lib/hud/derive';
import { rfBadgeText } from '@/lib/rf';
import type { Commands } from '@/lib/sim/commands';
import { useHudStore } from '@/lib/sim/store';
import { CLASS_LABEL } from '@/lib/strings';
import { cn } from '@/lib/utils';

const HEAD = 'sticky top-0 z-[1] h-7 bg-bg-2 px-2 text-left text-label font-medium';
const CELL = 'h-8 px-2 whitespace-nowrap';

/**
 * Track list — the primary control surface (DESIGN §11.5): symbol, id, class,
 * range, bearing, altitude band (never exact height), RF badge and state.
 * Keyboard focus follows the selection.
 */
export function TrackList({ commands }: { commands: Commands }) {
  const hud = useHudStore((s) => s.hud);
  const rows = useRef(new Map<string, HTMLTableRowElement>());
  const selectedId = hud?.selectedTrackId ?? null;

  useEffect(() => {
    const row = selectedId ? rows.current.get(selectedId) : undefined;
    if (!row) return;
    if (row.closest('[role=tabpanel]')) row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

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
        </tr>
      </thead>
      <tbody>
        {tracks.map((t) => {
          const selected = t.id === selectedId;
          const lost = t.status === 'LOST';
          return (
            <tr
              key={t.id}
              ref={(el) => {
                if (el) rows.current.set(t.id, el);
                else rows.current.delete(t.id);
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
              <td className={cn(CELL, 'text-text-1', lost && 'text-text-3 line-through')}>
                {t.id}
              </td>
              <td className={cn(CELL, 'max-w-40 truncate font-sans text-body')}>
                {t.classifiedAs ? (
                  CLASS_LABEL[t.classifiedAs]
                ) : (
                  <span className="text-text-3">—</span>
                )}
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
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
