'use client';

import { StatusNotice } from '@/components/hud/primitives';
import { formatBearing } from '@/lib/hud/derive';
import { useHudStore } from '@/lib/sim/store';
import { cn } from '@/lib/utils';

const HEAD = 'sticky top-0 z-[1] h-7 bg-bg-2 px-2 text-left text-label font-medium';
const CELL = 'h-8 px-2 whitespace-nowrap';

/** RF detector strobes (SPEC §6.3): bearing, band and friendly ID — never range. */
export function RfPanel() {
  const hud = useHudStore((s) => s.hud);
  const strobes = hud?.rfStrobes ?? [];
  if (strobes.length === 0) {
    return (
      <StatusNotice title="No RF emissions heard.">
        Drones on silent links (GNSS waypoints, fibre-optic) never show here.
      </StatusNotice>
    );
  }
  return (
    <table className="w-full border-collapse text-readout" aria-label="RF strobes">
      <thead>
        <tr>
          <th className={HEAD}>Strobe</th>
          <th className={HEAD}>Sensor</th>
          <th className={cn(HEAD, 'text-right')}>Brg</th>
          <th className={HEAD}>Band</th>
          <th className={HEAD}>Friendly ID</th>
          <th className={cn(HEAD, 'text-right')}>Heard</th>
        </tr>
      </thead>
      <tbody>
        {strobes.map((s) => (
          <tr key={s.id} className="border-t border-line-1">
            <td className={cn(CELL, 'text-text-1')}>{s.id}</td>
            <td className={cn(CELL, 'text-text-2')}>{s.sensorId}</td>
            <td className={cn(CELL, 'text-right')}>{formatBearing(s.bearingDeg)}</td>
            <td className={CELL}>{s.band ?? <span className="text-text-3">—</span>}</td>
            <td className={CELL}>{s.friendlyIdCode ?? <span className="text-text-3">—</span>}</td>
            <td className={cn(CELL, 'text-right')}>
              {Math.round(s.ageMs / 1000)}
              <span className="ml-1 text-text-3">s</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
