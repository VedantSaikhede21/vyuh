// Sim tick benchmark (SPEC §16: sim tick ≤ 2 ms). Run: pnpm --filter @vyuh/sim-core bench
// 60 contacts on JK_MOUNTAIN, one radar (scan every 2 s) and an EO/IR camera
// locked wide on the first track, so radar LOS, EO frustum and EO LOS all run.

import type { ContactSpec, Scenario } from '@vyuh/shared';
import { createSim } from '../src/index.ts';
import { presetWorld, testScenario } from '../test/fixtures.ts';

const N = 60;
const world = presetWorld('JK_MOUNTAIN');
const contacts: ContactSpec[] = Array.from({ length: N }, (_, i) => {
  const b = (i / N) * 2 * Math.PI;
  const r = 2500 + (i % 5) * 400;
  return {
    id: `c${String(i + 1).padStart(2, '0')}`,
    class: 'QUAD_SMALL',
    isThreat: true,
    affiliation: 'HOSTILE',
    controlLink: 'RF_MANUAL',
    behaviour: 'ATTACK_RUN',
    spawnTMs: 0,
    path: [
      { x: Math.sin(b) * r, y: 40 + (i % 4) * 30, z: Math.cos(b) * r, speedMps: 15 },
      { x: 0, y: 0, z: 0, speedMps: 15, action: 'DIVE' },
    ],
    emissions: { rfActive: true },
  };
});
const scenario: Scenario = testScenario({
  terrain: { preset: 'JK_MOUNTAIN', origin: { lat: 33.75, lon: 75.875 } },
  sensors: [
    ...testScenario().sensors,
    {
      id: 'eo1',
      kind: 'EO_IR',
      x: 0,
      y: 8,
      z: 0,
      fovDegMin: 1.5,
      fovDegMax: 30,
      resolution: [640, 360],
    },
  ],
  contacts,
  durationS: 120,
});

function run(): number[] {
  const sim = createSim(scenario, world);
  const times: number[] = [];
  let locked = false;
  while (sim.getState().endReason === null) {
    const t = sim.getState().tracks.find((x) => x.status === 'ACTIVE');
    if (t && !locked) {
      locked = true;
      sim.dispatch({
        type: 'CAMERA_SLEWED',
        trackId: t.id,
        payload: { azDeg: 0, elDeg: 0, zoom: 1 },
      });
    }
    const t0 = performance.now();
    sim.tick();
    times.push(performance.now() - t0);
  }
  return times;
}

run(); // warm-up (JIT)
const times = run().sort((a, b) => a - b);
const mean = times.reduce((s, t) => s + t, 0) / times.length;
const pct = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))] ?? 0;
console.log(
  `ticks ${times.length} · mean ${mean.toFixed(3)} ms · p50 ${pct(0.5).toFixed(3)} · ` +
    `p99 ${pct(0.99).toFixed(3)} · max ${pct(1).toFixed(3)} ms (budget 2 ms)`,
);
