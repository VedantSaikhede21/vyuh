# Phase 3 · Part 3a — Scenario generator, behaviours, swarms, ROE, weather

> **Status: APPROVED 2026-10-15** with the refinements recorded under
> "Approved answers". Build on `feat/phase3a`; stop at the Step 8 checkpoint.

Inputs: `docs/plans/phase3-requirements.md` (full 3a requirements, approved
decisions, tech debt), SPEC §7, §7.1, §8, §11, §12 Phase 3, §16, CLAUDE.md.
Part 3.0 is complete on `feat/phase3`.

**Intel integrated-GPU FPS:** deferred by the user on 2026-10-15 (no Intel
machine available); still pending at approval (no result supplied). It is not
waived: measure it before the demo and before Phase 6. All FPS evidence so far
is from an AMD Radeon integrated GPU. Step 12 also reports the worst-case D5
scenario's entity count and draw calls so the Intel headroom can be judged.

---

## What exists today (investigated 2026-10-15)

- **API:** no generator. `services/scenarios.py` lists scenarios and re-checks the zod `superRefine` rules; `routers/scenarios.py` has `GET /scenarios` and `GET /scenarios/{id}` only. Scoring trees `default_v1.json`, `default_v2.json`. `Settings` has no terrain or rate-limit settings. No API Dockerfile; compose runs Postgres only.
- **Schemas:** `ScenarioRequest` exists (terrainPreset, timeOfDay `HH:mm`, date?, weather object or `LIVE`, difficulty, seed, threatMix?, swarmSize?, falseContactDensity?, aiAssistAccuracy?, durationS, roe). `Scenario` has `request?` but no generator version. `ScenarioKind` has `GENERATED`. `WaypointAction` = DROP / DIVE / RTH. No time-band or weather-preset enums.
- **sim-core** (`SIM_VERSION` 2):
  - `holdS` and terminal `DIVE` work; boids bird flocks work.
  - `DROP` does nothing, and the waypoint action `RTH` does nothing (an RTH *control mode* exists for EW link loss).
  - `roeAllowsIntercept` checks only `affiliation === 'HOSTILE'` under WEAPONS_TIGHT; no class check.
  - `NO_KINETIC` zones are parsed but enforced nowhere.
  - `createDefender` (ground truth) exists; `playScripted` in `test/fixtures.ts` is the old guard player that engages everything in range.
- **Terrain:** `apps/web/public/terrain/<preset>/` holds `meta.json`, `heightmap.u16` (512 KB), `heightmap.png`, `buildings.geojson` (PUNJAB_PLAINS 27 KB; JK_MOUNTAIN empty).
- **CI:** TS lint + vitest; ruff + pytest; terrain pipeline; gen:schemas no-diff. No generator sweep.

---

## Approved answers (2026-10-15)

1. **Settlement data for `NO_KINETIC` siting:** the API image also copies `buildings.geojson` (≤ 30 KB per preset) next to `meta.json` + `heightmap.u16`; read with the stdlib `json`. No pipeline change.
2. **Intercept blocked by a `NO_KINETIC` zone:** new additive `ResponseResult` value `BLOCKED_NO_KINETIC`, distinct from `BLOCKED_BY_ROE`.
3. **Which point the gate tests:** the track's filtered position estimate (operator-known, decision 66). Decision to record: intercepts resolve instantly when ordered, so the intercept point coincides with the track position; checking the estimated track position is equivalent to requirement §5 ("track or intercept point"), not a reduction of it. SPEC §8 wording is updated to match. If intercept time-of-flight is ever modelled, the check must move to the predicted intercept point.
4. **Is a `DROP` visible live:** no, with one rule. `CONTACT_DROPPED` is a system event used for scoring and shown on the result screen ("Payload dropped at 02:41"). If the EO camera is in TRACK (`TRK`) on the dropping contact's track at the moment of the drop, the Comms log appends `<trackId> PAYLOAD RELEASE OBSERVED`. This is sim-derived and deterministic (no new event type): `CONTACT_DROPPED` carries the observing track as an optional top-level `trackId` (event convention: ids never inside `payload`), which sim-core fills only when the EO tracker is in TRACK on that contact's track. Vitest covers both cases.
5. **Time bands and sun in Python:** a small NOAA sunrise/sunset function (stdlib `math`), cross-checked in CI against suncalc values exported by a sim-core test; the validator asserts `isNight` matches suncalc.
6. **Generated scenario visibility:** `kind = GENERATED`, tag `generated`, `created_by` = requester; hidden from the library list; visible by id to its creator and to instructors/admins. The 3b list redesign decides how generated runs are listed.
7. **Trainee "Generate" UI:** 3b. 3a delivers the API and tests; the D5 FPS check drives the API directly.
8. **`DUST`:** enum value added now; the generator never picks it until a desert preset exists.
9. **Practice hints:** the three rules below, Practice only, Comms lines with a muted "HINT" tag, at most once per track. Hint text uses only operator-known facts (same rule as the ACQ reason, decision 66) — never true class, true range, contact id or truth-only state.
   - a track ACTIVE > 20 s and never selected → "Hint: T004 has not been looked at. Tab selects it.";
   - CUE for > 10 s with no lock → "Hint: zoom in (+) or wait for the range to close.";
   - Intercept disabled by WEAPONS_TIGHT → "Hint: classify (C) and declare hostile (H) first."
10. **Checkpoint:** stop after Step 8 (sweep green) and show a table of one generated scenario per difficulty (contacts, behaviours, axes, time band, weather, ROE, warning time, defender result), plus the sweep result, before the API endpoint and HUD work.

---

## Steps (each a small conventional commit; lint + tests after each)

0. **`docs: phase 3a plan`.** Save the approved plan (answers recorded), mark Intel FPS deferred in CLAUDE.md §14.

1. **`feat(shared): generator request, time band, weather preset, drop event`** — `packages/shared` first, then `pnpm gen:schemas`:
   - enums: `TimeBand` (DAY, DUSK, NIGHT); `WeatherPreset` (CLEAR, HAZE, FOG, RAIN, DUST); `SystemEventType` + `CONTACT_DROPPED`; `ResponseResult` + `BLOCKED_NO_KINETIC` (if Q2 approved).
   - `GenerateRequest`: `{ terrainPreset, difficulty, seed, timeBand?, weatherPreset?, durationS?, roe?, threatMix?, swarmSize?, falseContactDensity?, aiAssistAccuracy? }`. The generator resolves it into a full `ScenarioRequest`, which is what `scenario.request` stores.
   - `Scenario.generatorVersion?: int` (additive, optional; scripted scenarios omit it). No `schemaVersion` bump: all changes are additive.
   - Response: the existing `GenerateScenarioResponse = { scenarioId, scenario }` (already in `api.ts`).
   - Python: re-check any new cross-field rules in `services/scenarios.py`.

2. **`feat(sim): drop, RTH waypoint, ROE class check, no-kinetic gate (SIM_VERSION 3)`** — sim-core:
   - `DROP`: on arriving at a `DROP` waypoint, a contact that is ACTIVE and not defeated emits `CONTACT_DROPPED {x, z}` with an optional top-level `trackId` (once per contact), then continues its path. `trackId` is set only when the EO tracker is in TRACK on that contact's track at that tick (Q4).
   - `RTH` waypoint action: on arrival, switch to the existing RTH control (return to the first waypoint and despawn).
   - `roeAllowsIntercept`: WEAPONS_TIGHT needs `classifiedAs` ∈ ThreatClass **and** affiliation HOSTILE; WEAPONS_HOLD never; WEAPONS_FREE always.
   - `NO_KINETIC`: intercept blocked when the track estimate is inside a `NO_KINETIC` polygon (point-in-polygon in a new `zones.ts`); result per Q2; checked after ROE, before cooldown/ammo, so it spends nothing.
   - `createDefender`: still sets the true class; never orders an intercept that the new gates would block; uses jam/spoof on susceptible threats inside `NO_KINETIC`, otherwise holds.
   - `SIM_VERSION = 3`; decision entry.
   - Tests: `behaviours.test.ts` (drop emitted once, not after EW defeat, RTH waypoint despawns at the start, `trackId` set under EO TRACK and absent otherwise), `roe.test.ts` (FREE / TIGHT class + affiliation / HOLD / NO_KINETIC inside-outside-edge, nothing spent when blocked), determinism and exact replay, S01–S14 guard tests still pass.

3. **`feat(api): default_v3 scoring tree`**:
   - `default_v3.json` = `default_v2` + a drop rule: a threat with `CONTACT_DROPPED` before it was neutralised is `LEAKED`, with the feedback "Payload dropped before neutralisation." A drop after EW defeat cannot happen (the sim stops it). `default_v1`/`v2` unchanged.
   - `metrics.py` reads `CONTACT_DROPPED`; plausibility accepts the new event and result values.
   - Tests: every new leaf; v1 and v2 golden re-scores unchanged.

4. **`feat(api): TERRAIN_DIR and terrain reader`**:
   - `Settings.terrain_dir` (default: repo `apps/web/public/terrain`, resolved from the API package path); `.env.example`.
   - `services/terrain.py`: load `meta.json`, `heightmap.u16` with `array('H')` (little-endian, row 0 = south), bilinear `height_at(x, z)`, a coarse grid (e.g. 64²) for routing, and building footprints per Q1. Never used for LOS or sensors.
   - `apps/api/Dockerfile` (built from the repo root) copying only the needed preset files; a compose `api` service. Note the known port-5432 container clash in the README.
   - Tests: heights match sim-core's sampler at fixed points (fixture exported by a sim-core test), missing preset → `VALIDATION_ERROR`.

5. **`feat(api): generator core`** in `services/generator/` (pure functions, no DB):
   - `streams.py`: named sub-streams `random.Random(hash(seed, name))` using a stable hash (`hashlib.sha256`), never Python's `hash()`.
   - `difficulty.py`: the SPEC §7.1 table as data; ammo = ceil(threats × factor).
   - `environment.py`: time band → `HH:mm` and `isNight` (Q5); weather presets → `Weather`. Starting values: CLEAR vis 20 km / cloud 10 %; HAZE 6 km; FOG 0.8 km; RAIN 5 km + 8 mm/h; wind seeded 0–8 m/s.
   - `siting.py`: protected asset near the map centre on flat-enough ground; radar on the highest point within ~800 m of the asset (mast height added); EO/IR and RF co-sited; effectors at the asset; `NO_KINETIC` polygons around building clusters (Q1); `BORDER_LINE` across the map for smuggling.
   - `routes.py`: 1–3 approach axes by difficulty; spawn at the §7.1 distance; low attack routes pick the coarse-grid path that minimises exposure to the radar site (a cheap visibility proxy on the coarse grid, not a second LOS model).
   - `behaviours.py`: path builders for RECON_LOITER (orbit polygon, 80–150 m AGL), SMUGGLING_DROP (low, cross border, hold 10–20 s with `DROP`, then `RTH`), ATTACK_RUN (low, terminal `DIVE`), SWARM_SATURATION (leader path + offset followers, staggered spawns, `groupId`), DECOY (high, `rfActive`, loud band), TRANSIT (civilian, keeps clear of assets), FRIENDLY_PATROL (loop near own position, sometimes `friendlyIdCode`), BIRD_FLOCK (`groupId`, boids).
   - `contacts.py`: class per behaviour, control link with the silent-link share per difficulty, emissions consistent with the zod rules, pre-baked `aiSuggestion` (accuracy from §7.1 or the request, −0.1 at night, −0.1 in fog; a wrong suggestion picks a plausible confusable class).
   - Entity cap: total contacts ≤ 60 (SPEC §16). Trim order: false contacts → flock members → swarm followers; the threat count never drops below the §7.1 minimum.
   - `briefing.py`: markdown with Situation, Mission, ROE (callout), Assets, Intel (axis named at D1–D2, vague at D4–D5).
   - `static_checks.py`: bounds with margin, min AGL against the heightmap, spawn distance from assets, entity cap, at least one threat; a failing contact is regenerated from an attempt sub-stream (bounded, e.g. 8 tries) before giving up with an error.
   - Output: rounded floats (0.1 m, 0.01 s), stable ordering, `generatorVersion = 1`, `scoringTreeId = default_v3`; validated by the generated Pydantic models plus the Python cross-field checks.
   - Tests: same request + seed ⇒ byte-identical JSON; each behaviour's path shape; difficulty scaling monotonic; cap; static checks and retries; NOAA vs suncalc fixture.

6. **`feat(sim): validate CLI`**:
   - `src/validate.ts` (pure): `validateScenario(scenario, world) → { ok, checks[] }`. Criteria: schema-valid; waypoints inside the map with margin and above min AGL; no spawn too close to assets; ≥ 1 threat; every threat gets a sensor track with at least the warning time for its difficulty; `isNight` matches suncalc; at D1–D3 the ground-truth defender leaves no threat `LEAKED`.
   - `scripts/validate.ts` CLI: `pnpm --filter @vyuh/sim-core validate <file|dir> [--max-fail-pct 2] [--json]`; loads presets from `apps/web/public/terrain`.
   - Tests on S01–S14 (all pass) and on deliberately broken fixtures (each criterion fails alone).

7. **`test: generator seed sweep`**:
   - `apps/api/scripts/gen_sweep.py --per-difficulty N --out DIR` (every preset × difficulty, seeds from a fixed list).
   - CI job "generator sweep": `gen_sweep.py --per-difficulty 20` → `validate DIR --max-fail-pct 2`. Fails above 2 % (2 of 100).
   - Local `pnpm sweep:generator` runs 50 per difficulty.
   - Decision entry with the reasoning (fairness rules already protect trainees: UNAVOIDABLE, decision 56).

8. **Checkpoint** (Q10): show the per-difficulty table and the sweep result; wait for the user's OK.

9. **`feat(api): POST /scenarios/generate`**:
   - Router thin, logic in `services/generator`. Trainee: only `terrainPreset`, `timeBand`, `difficulty`, `seed` (anything else → 403 `FORBIDDEN`); instructor/admin: every field. Stored per Q6. Response `GenerateScenarioResponse`.
   - Rate limit per user (`GENERATE_RATE_LIMIT_PER_MIN`, default 10, in-memory) → 429 `RATE_LIMITED`.
   - Tests: RBAC per role, determinism through the API, 429, stored kind/tag/owner, library list unchanged.

10. **`feat(web): ROE and no-kinetic reasons, zones on the map, practice hints`** (UI — read DESIGN.md first):
    - `lib/hud/derive.ts`: disabled reasons "Weapons tight: classify as a threat and declare hostile" and "Track is inside a no-kinetic zone"; shortcut gating via the existing `allowed()`.
    - Draw `NO_KINETIC` polygons and the `BORDER_LINE` in the tactical view and on the PPI if they are not drawn already (neutral chrome per DESIGN, labelled).
    - Practice hints per Q9; none in Assessment.
    - Result screen: "Payload dropped at mm:ss" on the contact row.
    - Comms: `<trackId> PAYLOAD RELEASE OBSERVED` when `CONTACT_DROPPED` carries a `trackId` (Q4), with a unit test for both cases.
    - Visual baselines and a11y specs updated; screenshots at both sizes, DESIGN §13.

11. **`docs: ROE semantics and generator in SPEC`**: SPEC §8 ROE table (FREE / TIGHT with class check / HOLD / NO_KINETIC, with the "track or intercept point" wording per Q3), §7.1 time bands and weather presets, §11 generate payload (`GenerateRequest`), §12 Phase 3 status; note in §9 / §12 Phase 4 that trends use Assessment sessions only. Decisions for every non-obvious choice.

12. **FPS and tick at the cap**: generate the worst-case D5 scenario (60 entities); `fps.spec.ts` gets a case that creates it through the API and plays it as a real session (works on a production build); sim tick bench at 60 entities on PUNJAB_PLAINS (budget 2 ms). Report the scenario's entity count and draw calls as well as FPS, to judge Intel headroom.

13. **Optional** (only if 0–12 are done): live weather via Open-Meteo behind `OPEN_METEO_ENABLED`, cached, preset fallback; `LIVE` in the request.

14. **Close-out**: done-criteria with evidence, lint/tests/pytest/gen:schemas/build, `pnpm e2e`, FPS, CLAUDE.md §14, then STOP.

---

## Tests to add (summary)

- sim-core: drop, RTH waypoint, ROE matrix, NO_KINETIC gate, defender under the new gates, validator criteria, determinism and replay under SIM_VERSION 3.
- API: `default_v3` leaves, v1/v2 golden unchanged, terrain reader vs sim-core fixture, generator determinism (byte-identical), behaviours, difficulty table, entity cap, static checks and retries, NOAA vs suncalc, RBAC and rate limit on `/scenarios/generate`.
- CI: generator sweep (20 per difficulty, fail above 2 %).
- E2E: new disabled reasons, zones visible, hints in Practice only; D5 FPS case.

## Risks

- **Generator tuning time:** reaching ≤ 2 % sweep failures may need several passes (especially warning time at D5 with 2.5 km spawns and silent links). Mitigation: the checkpoint after Step 8.
- **SIM_VERSION 3:** sessions recorded on v1/v2 will not replay exactly (Phase 4 must check `sim_version`). Scripted S01–S14 behaviour may change under the WEAPONS_TIGHT class check; guard tests catch it.
- **Python vs sim-core drift:** heights, sun and siting use Python copies of simple maths; cross-check fixtures in CI keep them aligned, and the validator is the final judge.
- **Entity cap vs FPS:** 60 entities with many tracks on PUNJAB_PLAINS costs ~0.9 ms per radar scan tick; measure at the cap.
- **No dependency additions planned.** Open-Meteo (optional Step 13) would use `httpx`, already an API dependency.
