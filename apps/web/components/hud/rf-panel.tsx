'use client';

import { useHudStore } from '@/lib/sim/store';
import { pad3 } from '@/lib/strings';

/** RF detector strobes (SPEC §6.3): bearing, band and friendly ID — never range. */
export function RfPanel() {
  const hud = useHudStore((s) => s.hud);
  const strobes = hud?.rfStrobes ?? [];
  if (strobes.length === 0) {
    return (
      <p className="text-label p-3">
        No RF emissions heard. Silent links (GNSS, fibre-optic) never show here.
      </p>
    );
  }
  return (
    <table className="w-full border-collapse text-readout">
      <thead>
        <tr className="text-label text-left">
          <th className="px-2 py-1">Strobe</th>
          <th className="px-2 py-1">Sensor</th>
          <th className="px-2 py-1 text-right">Brg</th>
          <th className="px-2 py-1">Band</th>
          <th className="px-2 py-1">Friendly ID</th>
          <th className="px-2 py-1 text-right">Age s</th>
        </tr>
      </thead>
      <tbody>
        {strobes.map((s) => (
          <tr key={s.id} className="border-t border-line-1">
            <td className="px-2 py-1 font-semibold">{s.id}</td>
            <td className="px-2 py-1">{s.sensorId}</td>
            <td className="px-2 py-1 text-right">{pad3(s.bearingDeg)}</td>
            <td className="px-2 py-1">{s.band ?? '—'}</td>
            <td className="px-2 py-1">{s.friendlyIdCode ?? '—'}</td>
            <td className="px-2 py-1 text-right">{(s.ageMs / 1000).toFixed(0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
