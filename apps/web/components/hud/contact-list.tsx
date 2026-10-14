'use client';

import { AffiliationSymbol } from './primitives';
import { rfBadgeText } from '@/lib/rf';
import type { Commands } from '@/lib/sim/commands';
import { useHudStore } from '@/lib/sim/store';
import { CLASS_LABEL, pad3 } from '@/lib/strings';
import { cn } from '@/lib/utils';

/** Track table (SPEC §15): state goes UNKNOWN → classified, with APP-6 frame, colour + letter. */
export function ContactList({ commands }: { commands: Commands }) {
  const hud = useHudStore((s) => s.hud);
  const tracks = hud?.tracks ?? [];
  if (tracks.length === 0) {
    return <p className="text-label p-3">No radar tracks yet. Watch the PPI.</p>;
  }
  return (
    <table className="w-full border-collapse text-readout">
      <thead>
        <tr className="text-label text-left">
          <th className="px-2 py-1">Track</th>
          <th className="px-2 py-1">Aff</th>
          <th className="px-2 py-1">Class</th>
          <th className="px-2 py-1">RF</th>
          <th className="px-2 py-1 text-right">Brg</th>
          <th className="px-2 py-1 text-right">Rng m</th>
          <th className="px-2 py-1 text-right">Alt m</th>
          <th className="px-2 py-1 text-right">Spd</th>
          <th className="px-2 py-1">State</th>
        </tr>
      </thead>
      <tbody>
        {tracks.map((t) => {
          const selected = t.id === hud?.selectedTrackId;
          const lost = t.status === 'LOST';
          return (
            <tr
              key={t.id}
              onClick={() => !lost && commands.select(t.id)}
              aria-selected={selected}
              className={cn(
                'border-t border-line-1',
                lost ? 'text-text-2 line-through' : 'cursor-pointer hover:bg-bg-3',
                selected && 'bg-bg-3 outline outline-1 outline-select',
              )}
            >
              <td className="px-2 py-1 font-semibold">{t.id}</td>
              <td className="px-2 py-1">
                <AffiliationSymbol affiliation={t.affiliation} filled={t.markedDetected} />
              </td>
              <td className="px-2 py-1">
                {t.classifiedAs ? CLASS_LABEL[t.classifiedAs] : 'UNKNOWN'}
              </td>
              <td className="px-2 py-1 text-small">{t.rf ? rfBadgeText(t.rf) : '—'}</td>
              <td className="px-2 py-1 text-right">{pad3(t.bearingDeg)}</td>
              <td className="px-2 py-1 text-right">{Math.round(t.rangeM)}</td>
              <td className="px-2 py-1 text-right">{Math.round(t.altitudeAglM)}</td>
              <td className="px-2 py-1 text-right">
                {t.speedMps === null ? '—' : t.speedMps.toFixed(0)}
              </td>
              <td className="px-2 py-1 text-small">
                {lost ? 'LOST' : t.markedDetected ? 'DETECTED' : 'NEW'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
