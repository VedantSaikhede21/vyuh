# Phase 3 · Part 3b — Scenario library, urban terrain, scenario select and briefing

> **Status: APPROVED 2026-10-16** with the adjustments recorded under
> "Approved answers". Build on `feat/phase3b`; stop at Checkpoint A (Step 5)
> and Checkpoint B (Step 13).

Inputs: `docs/plans/phase3-requirements.md` (3b section, approved decisions
D4 etc.), SPEC §7, §7.1, §7.2, §12 Phase 3, §14, §15, §20, DESIGN.md (all,
especially §11.3, §11.4, §13), CLAUDE.md §14.

**Playtest notes:** none yet. **Intel integrated-GPU FPS:** still pending —
required before the demo and Phase 6. After Step 2 the user gets the exact
command for a teammate to run on the Intel laptop; work continues meanwhile.

---

## Step 1 investigation findings (2026-10-16)

- **JK D4 seed 37 stutter (CLAUDE.md §14 tech debt) is GPU headroom, not a
  main-thread hitch.** Production build, real `fps.spec` case, 2 runs per
  viewport: 1920×1080 84 / 92 fps, p95 16.7 ms; 1366×768 120 / 120 fps, p95
  8.4 ms (44 draws, 26 entities). PUNJAB D5 seed 6 in the same session: 84 fps,
  p95 16.7 ms. Chrome trace (10 s at ~70 s): renderer main thread had 3 tasks
  > 20 ms (one was the profiler starting); rAF callbacks p95 3.5 ms; 7 minor GCs,
  max 3.7 ms. The GPU process main thread was ~100 % busy: 644 WebGL
  command-buffer flushes > 8 ms (max 19.9 ms). ~510 k vertices per frame
  (screen + EO target) and the jump to 120 fps at half the pixels point to
  fill-rate/fragment cost. The earlier 75 fps / p95 24.8 ms came from a
  back-to-back 16-case run where outside load (most likely heat) pushed frames
  past one 16.7 ms interval.
- **Presets:** PUNJAB_PLAINS (41 OSM buildings) and JK_MOUNTAIN (36), ~0.9 MB
  each. `build_preset.py` already takes a bbox/centre, OSM buildings and the
  10 MB check.
- **Generator:** preset-agnostic (`TERRAIN_DIR` by name; the API image copies
  the whole terrain folder). Risks for a dense town: single-link settlement
  clustering can merge a town into one zone that leaves no asset position;
  `visibility.py` ignores buildings.
- **Building LOS:** 100 m grid cells, 10 m LOS steps, every footprint in the
  cell tested per sample — too slow for a dense town.
- **Training / briefing:** the list creates the session on click (mode chosen
  on the list); the briefing is the pre-start state of
  `train/session/[id]/page.tsx`. `ScenarioListItem` has no best score; the
  assignments table exists in the ORM only (Phase 4).
- **Hillshade:** `scripts/hillshade/gen-hillshade.ts` (stdlib PNG writer, token
  colours) makes only the login background.
- **Not modelled:** sun glare in EO; the spectrogram view (Phase 5).

## Approved answers (2026-10-16)

1. **Stutter fix:** repeatable FPS method; adaptive pixel ratio (cap 1.25,
   drei `PerformanceMonitor`), checked at 125 % / 150 % display scaling; EO/IR
   at a fixed 30 fps and reduced resolution when not zoomed; terrain fragment
   shader cost checked. Report before/after mean FPS and p95 at 1920×1080 and
   1366×768, 100 % and 150 % scaling.
2. **Adaptive pixel ratio is disabled (fixed) in e2e, visual and checkpoint
   runs** so screenshots stay deterministic; the FPS spec reports both fixed
   and adaptive results.
3. **S08 "Fog Line":** winter fog on PUNJAB_PLAINS. Update SPEC §7.2.
4. **Time-of-day bands:** one shared helper in `packages/shared` with the
   generator's band definitions (decision 74), covered by the Python
   cross-check, used for every time-of-day label. Bands: NIGHT sun < −6°;
   DUSK −6° to < 15°; DAY ≥ 15°. Each generator band falls inside its label.
   The DUSK band is labelled **"Dawn"** when the sun is rising (morning) and
   **"Dusk"** when setting (evening); the band value stays DUSK; the tooltip
   shows the sun elevation.
5. **Assigned badge:** omitted until Phase 4. **Best score:** additive API field.
6. **S15 "Birds or Drone?":** confirmed; update SPEC §7.2 and §20. Solved with
   radar behaviour + EO in 3b; §20 notes the spectrogram arrives in Phase 5.
7. **No glare in 3b** (S09 puts one axis on the sun's bearing); glare model
   parked in Open ideas.
8. **Generate panel weather:** shown to instructors/admins; disabled for
   trainees with "Set by difficulty. Instructors can choose weather."
9. **Separate briefing page** `/train/scenario/[id]`; Begin creates the session
   in the chosen mode. Result screen: "Next scenario" opens that scenario's
   briefing; "Retry same seed" may start directly.
10. **S04:** no contact report (form arrives in Phase 4); Phase 4 tech debt:
    "S04 should exercise the contact report".
11. **S06:** at least one civilian drone passes inside the jam sector of the
    hostile's bearing during the hostile's approach, so jamming needs timing
    or aiming; in S06's guard test.
12. **Briefing coverage altitude selector:** 15 / 50 / 150 m AGL, default 50 m,
    computed lazily per altitude in the worker and cached; the label shows the
    selected altitude.
13. **URBAN_GENERIC:** a small town (~3–5 km across) inside an otherwise rural
    14 km box; `buildings.geojson` well under 10 MB (simplify if needed);
    building LOS with smaller cells + a per-cell max-height early-out, sim tick
    ≤ 2 ms with 60 contacts; generator places the asset at the town edge, caps
    no-kinetic zone size, and uses a coarse building-height grid for siting
    only (sim-core stays the only LOS judge); sweeps 0 failures; building LOD /
    culling in the tactical and EO views.
14. **Procedural Punjab villages:** every changed guard test or zone siting is
    reported with its reason, never silently accepted.

---

## Steps

Each step is one or more small conventional commits; lint + tests for the
touched packages after each.

### 0. Commit this plan

### 1. Repeatable FPS method (`perf(web)`)
`fps.spec.ts`: one uncounted warm-up pass per case, 30 s cool-down between
cases, median of 3 runs for mean FPS and p95, pixel ratio in the result; a
scale-factor variant (`--force-device-scale-factor=1.25 / 1.5`) stands in for
Windows display scaling. Baseline (before any fix): JK D4 seed 37, PUNJAB D5
seed 6, S13, S14 at both viewports, 100 % and 150 %.

### 2. GPU headroom (`perf(web)`), one commit per change, A/B with Step 1
- a. Canvas pixel ratio capped at 1.25; `PerformanceMonitor` steps it down
  (1.25 → 1.0 → 0.85) when frame time stays high and back up with hysteresis.
  Fixed under automation (answer 2). HUD text is DOM, so only the canvas scales.
- b. EO/IR render target re-rendered at a fixed 30 fps (33 ms steps); display
  only — sim state and EO auto-track unaffected.
- c. EO render target sized to panel × pixel ratio × 0.75 at zoom 1×, full size
  when zoomed.
- d. Terrain fragment shader: A/B the map-edge fade + fog and Lambert vs an
  unlit vertex-colour shader; change only if significant and visually equal.
- e. Report MSAA cost at 1080p; propose a change only if it matters.

Output: before/after table. Then give the user the Intel-laptop command
(including the 150 % variant) and continue.

### 3. Shared DAY/DUSK/NIGHT helper (`feat(shared)`)
`packages/shared/src/time-band.ts`: thresholds + `timeBandForElevation(elDeg)`
(pure) + the Dawn/Dusk label rule (rising vs setting). sim-core
`timeBandAt(meta, date, time)` (suncalc). `pnpm gen:schemas` exports the
thresholds to `apps/api/app/seed/generated/time_bands.json`; `environment.py`
reads them. `sun_elevations.json` cross-check fixture gains the expected band;
pytest checks Python against it. Generator output must stay byte-identical.

### 4. Faster building LOS (`perf(sim)`, results identical, no `SIM_VERSION` bump)
Grid cells 100 m → ~25 m (tuned) with each cell's max building top; samples
above it skip the footprint tests. Proof: guard, determinism and replay tests
unchanged, plus a 10 k-random-ray old-vs-new equality test on every preset.
`bench.ts` before/after.

### 5. URBAN_GENERIC preset (`feat(terrain)`)
Shortlist 3 towns; Overpass vetting within 10 km of the box for
`landuse=military`, `military=*`, `aeroway=aerodrome|helipad|airstrip`,
`power=plant`, `waterway=dam`, plus distance to the IB/LoC.
**→ Checkpoint A:** bbox, centre, size, building count, estimated geojson size
and vetting results per candidate; wait for the OK. Then build (with
`--simplify-m` if needed; target ≤ 3 MB buildings), cite in
`docs/realism-sources.md`. Rendering: merged buildings split into the
terrain's 4×4 tiles for frustum culling, plus a distance LOD that drops
buildings under ~2 px; display only. Bench ≤ 2 ms tick with 60 contacts.

### 6. Procedural Punjab villages (`feat(terrain)`)
`build_preset.py --procedural-villages`: at OSM `place=village|hamlet` points
with no OSM building within 300 m, a deterministic cluster (hash of the OSM
id) of 15–40 rectangles, 6–9 m tall, sized/oriented like the preset's real
footprints, `procedural: true` in `buildings.geojson`. `meta.json` gains
`proceduralBuildings {count, rule, seed}` and `revision` (zod additive first).
Report every S01/S02/S03/S12/S14 guard-test change and the PUNJAB zone-siting
change (zone count, sizes, asset positions) with reasons. Phase 4 tech debt:
replay of older PUNJAB sessions must check the preset revision.

### 7. Generator support for URBAN_GENERIC (`feat(api)`)
Asset at the town edge (200–800 m outside the largest cluster); no-kinetic
zones capped at ~1.2 km a side (large clusters split); 50 m max-building-height
grid in `services/terrain.py` used only by `visibility.py` and siting. Sweeps
(CI 20 / local 50 per difficulty) cycle all three presets; target 0 failures
by retuning the generator, not the validator. Byte-identical test for URBAN
D1–D5.

### 8. Scripted library S04–S10, S15 (`feat(seed)`)
Sources in `apps/api/app/seed/scenarios/src/<id>.json` (generator request with
fixed seed, JSON merge-patch overrides, briefing, tags, citation key);
`scripts/scenarios/build_scripted.py` writes `seed/scenarios/<id>.json`; a
pytest fails on drift while the generator version matches.

| Id | Preset · time | Content |
|---|---|---|
| S04 | PUNJAB · night · D3 | Heavy-quad smuggling drop across the border, RF_MANUAL (RF bearing), IR to identify |
| S05 | JK · day · D3 | Fibre-optic FPV along a valley; jammer present but useless; speed tuned for the 45 s warning |
| S06 | URBAN · day · D3 | 3–4 civilian hobby drones (≥ 1 inside the hostile's jam sector during its approach), no-kinetic zones over the town, one RF-linked hostile quad |
| S07 | PUNJAB · dusk · D4 | Loud high decoy + silent low loitering munition on another axis |
| S08 | PUNJAB · winter day · D4 | Fog 0.8 km (January), radar-led, friendly patrol + birds |
| S09 | PUNJAB · dusk · D4 | 8-drone swarm on 2 axes, one on the sun's bearing |
| S10 | PUNJAB · night + rain · D5 | 2–3 swarms, 2 decoys, birds, friendly helicopter, ammo < threats, ≤ 60 entities |
| S15 | PUNJAB · day · D2 | Birds or Drone?: 2 bird flocks + one small quad on a nearby bearing |

Guard tests (`packages/sim-core/test/library-scenarios.test.ts`): all pass the
validator; D2–D3 defender wins; D4–D5 defender results recorded. Per scenario:
S04 drop crosses the border, IR identifies; S05 never RF-strobed, jam has no
effect; S06 hostile over a no-kinetic zone, civilians present, a civilian in
the hostile's ±10° jam sector during its approach; S07 decoy strobes before
the threat is tracked; S08 no EO identification beyond 0.8 km; S09 8 members
on 2 axes; S10 cap held, ammo < threats; S15 bird tracks before the quad
track within ±15° of its bearing. S01–S03, S11–S14 byte-unchanged.
Citations in `docs/realism-sources.md`.

### 9. API: best score (`feat(api)`)
`ScenarioListItem.bestScore: number | null` (requester's best completed
total). zod → `gen:schemas` → service. Trainee list: S01–S10, S15.

### 10. Hillshade images (`feat(web)`)
`gen-hillshade.ts --all` → `public/terrain/<P>/thumb.png` (64×40 @2×) and
`map.png` (1024 px); committed; CI no-diff check.

### 11. Training list + Generate panel (DESIGN §11.3)
Table (32 px rows): thumbnail, name + code, pips, time-of-day icon + label,
conditions, tags, duration, best score. Filters (difficulty, terrain, time of
day, tags), sort (difficulty / name / best), state in the URL, keyboard
(arrows + Enter). Generate panel: terrain, time, weather (answer 8),
difficulty, seed + Random; "Generate and preview" → briefing; labelled
loading, worded error + retry, 429 countdown with disabled reason. Empty /
loading / error states.

### 12. Briefing page (DESIGN §11.4) at `/train/scenario/[id]`
Left: canvas map over `map.png` — zones, border, assets, sensor sites; LOS
coverage from a Web Worker (sim-core LOS, 64×64 grid per radar / EO site)
with the altitude selector (answer 12) and labelled progress; scale bar,
north arrow; intel axis only when the briefing states it. Right: mission card
(situation, mission, ROE callout, assets, sensors/effectors with ranges and
ammo, environment: date/time, time-of-day label, sun elevation, visibility,
wind), Practice/Assessment toggle, controls quick reference, Begin (Enter).
Fits 1366×768 without scrolling the map. Result-screen buttons per answer 9;
e2e helpers updated (`start-session` moves to Begin).

### 13. Checkpoint B
`apps/web/e2e/checkpoint-3b.spec.ts` (`@checkpoint`) → `apps/web/e2e/checkpoint/`:
training list, Generate panel (idle, loading, rate-limited), briefing for S06
and S04, at 1366×768 and 1920×1080; described against DESIGN §13. Wait for the
OK, then update visual baselines.

### 14. Docs and media
SPEC §7.2 (S08, S15, preset column), §12, §14, §15, §20; decisions; Open ideas
(glare); Phase 4 tech debt (S04 contact report, preset revision in replay);
re-record the landing hero and crops.

### 15. Close-out
Lint, unit tests, `uv run pytest`, `gen:schemas` no diff, production
`next build`, `pnpm e2e` on the final code, both sweeps with URBAN (target 0
failures); SPEC §12 Phase 3 done-criteria with evidence; DESIGN §13 per screen
with screenshots at both sizes; FPS (production) for S06, the worst D5 case
and JK D4 seed 37 (FPS, p95, draws, entities); CLAUDE.md §14; stop.

## Risks
- URBAN_GENERIC FPS at 1080p — Step 2 + building tiles/LOD; report rather than
  cut buildings silently.
- Urban warning times (buildings near the radar) — radar on high ground at the
  town edge; coarse grid steers routes.
- S05 FPV speed vs the 45 s warning.
- S10 near the 60-entity cap and the FPS budget.
- Procedural villages may move zone siting or affect S12 / S14 (reported).

## New dependencies
None.
