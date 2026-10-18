// Sim tick benchmark (SPEC §16: sim tick ≤ 2 ms). Run: pnpm --filter @vyuh/sim-core bench
// Default: 60 contacts on JK_MOUNTAIN, one radar (scan every 2 s) and an EO/IR
// camera locked wide on the first track, so radar LOS, EO frustum and EO LOS all
// run; `bench --preset URBAN_GENERIC` runs the same case on another preset. With a
// scenario file (`bench <scenario.json>`, e.g. a generated D5 at the 60-entity
// cap) it runs that scenario on its own preset instead. `--runs N` repeats the
// run and also prints the per-tick best of N, which keeps the algorithmic peak
// but drops one-off OS and GC hiccups on a busy machine.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Scenario as ScenarioSchema, type ContactSpec, type Scenario } from '@vyuh/shared';
import { createSim } from '../src/index.ts';
import { presetWorld, testScenario } from '../test/fixtures.ts';

const args = process.argv.slice(2);
const presetFlag = args.indexOf('--preset');
const builtInPreset = presetFlag >= 0 ? (args[presetFlag + 1] ?? 'JK_MOUNTAIN') : 'JK_MOUNTAIN';
const runsFlag = args.indexOf('--runs');
const runs = runsFlag >= 0 ? Math.max(1, Number(args[runsFlag + 1] ?? 1)) : 1;
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const N = 60;
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
const builtInOrigin = presetWorld(builtInPreset).meta?.origin ?? { lat: 33.75, lon: 75.875 };
const builtIn: Scenario = testScenario({
  terrain: { preset: builtInPreset, origin: builtInOrigin },
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

const scenario: Scenario = file
  ? ScenarioSchema.parse(
      JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8')),
    )
  : builtIn;
const world = presetWorld(scenario.terrain.preset);

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

function stats(raw: readonly number[]): string {
  const times = [...raw].sort((a, b) => a - b);
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  const pct = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))] ?? 0;
  return (
    `ticks ${times.length} · mean ${mean.toFixed(3)} ms · p50 ${pct(0.5).toFixed(3)} · ` +
    `p99 ${pct(0.99).toFixed(3)} · max ${pct(1).toFixed(3)} ms (budget 2 ms)`
  );
}

run(); // warm-up (JIT)
const label = `${file ?? `built-in 60 contacts, ${builtInPreset}`} · ${scenario.contacts.length} contacts`;
let best: number[] = [];
for (let r = 0; r < runs; r++) {
  const times = run();
  best = r === 0 ? times : best.map((t, i) => Math.min(t, times[i] ?? t));
  console.log(`${label} · ${stats(times)}`);
}
if (runs > 1) console.log(`${label} · per-tick best of ${runs} · ${stats(best)}`);
