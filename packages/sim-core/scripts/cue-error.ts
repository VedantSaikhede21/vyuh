// How far the radar cue points from the target, seen from the EO mast (decision 176).
//
//   node packages/sim-core/scripts/cue-error.ts [S01 S14 …]
//
// Plays each scripted scenario with no trainee input and, every tick, compares the
// pointing the camera's CUE mode uses (filtered radar track position at its estimated
// height) with the true contact position. Prints |azimuth| and |elevation| errors in
// degrees by range band (p50 / p90 / p95). Used to size the cue's search field of view.

import { sampleHeight } from '../src/terrain.ts';
import { createSim } from '../src/index.ts';
import { loadScripted } from '../test/fixture-logs.ts';
import { presetWorld } from '../test/fixtures.ts';

const ids = process.argv.slice(2);
const SCENARIOS = ids.length > 0 ? ids : ['S01', 'S04', 'S06', 'S13', 'S14', 'S15'];
const BANDS = [500, 1000, 2000, 3000, Infinity] as const;

const errs = BANDS.map(() => ({ az: [] as number[], el: [] as number[] }));

const deg = (r: number) => (r * 180) / Math.PI;
function pointing(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return {
    az: deg(Math.atan2(dx, dz)),
    el: deg(Math.atan2(dy, Math.hypot(dx, dz))),
    r: Math.hypot(dx, dz),
  };
}

for (const id of SCENARIOS) {
  const scenario = loadScripted(id);
  const world = presetWorld(scenario.terrain.preset);
  const sim = createSim(scenario, world, { mode: 'PRACTICE' });
  const eo = scenario.sensors.find((s) => s.kind === 'EO_IR');
  if (!eo) continue;
  while (sim.getState().endReason === null) {
    sim.tick();
    const s = sim.getState();
    const mast = s.sensorPositions[eo.id];
    if (!mast) continue;
    for (const t of s.tracks) {
      if (t.status !== 'ACTIVE') continue;
      const c = s.contacts.find((x) => x.id === t.contactId);
      if (!c || c.status !== 'ACTIVE') continue;
      const est = {
        x: t.pos.x,
        y: sampleHeight(world.heightmap, t.pos.x, t.pos.z) + t.altitudeAglM,
        z: t.pos.z,
      };
      const a = pointing(mast, est);
      const b = pointing(mast, c.pos);
      const bucket = errs[BANDS.findIndex((m) => b.r < m)];
      if (!bucket) continue;
      let daz = Math.abs(a.az - b.az);
      if (daz > 180) daz = 360 - daz;
      bucket.az.push(daz);
      bucket.el.push(Math.abs(a.el - b.el));
    }
  }
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]?.toFixed(2) ?? '—';
};
console.log('range band      n     az p50/p90/p95       el p50/p90/p95');
BANDS.forEach((m, i) => {
  const e = errs[i] ?? { az: [], el: [] };
  const lo = i === 0 ? 0 : (BANDS[i - 1] ?? 0);
  console.log(
    `${String(lo).padStart(5)}–${String(m).padEnd(8)} ${String(e.az.length).padStart(6)}   ` +
      `${pct(e.az, 0.5)} / ${pct(e.az, 0.9)} / ${pct(e.az, 0.95)}     ` +
      `${pct(e.el, 0.5)} / ${pct(e.el, 0.9)} / ${pct(e.el, 0.95)}`,
  );
});
