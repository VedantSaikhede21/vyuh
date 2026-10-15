# Phase 3 — requirements for Parts 3a and 3b

Source: the user's Phase 3 brief and approved answers (2026-10-14/15), saved here
so a fresh session can work from them without the original conversation. Part
3.0 (design foundation and UX pass) is complete; see `phase3-0-plan.md` and
CLAUDE.md §14.

**Process for each part:** plan → wait for approval → save the approved plan to
`docs/plans/phase3-<part>-plan.md` and commit it → build → close out → STOP.
3a starts only when the user says "start 3a"; 3b only when the user says
"start 3b".

**Before 3a starts:** the Intel integrated-GPU FPS check
(`pnpm --filter @vyuh/web e2e:fps` on an Intel laptop, with `pnpm dev`
running) was **deferred by the user on 2026-10-15** because no Intel machine is
available. It is still required before the demo and before Phase 6; do not
invent numbers for it. The user may add their own S13/S14 playtest notes later.

**3a plan:** approved 2026-10-15, `docs/plans/phase3a-plan.md`.

---

## Rules for the whole phase

- Follow CLAUDE.md. Plan before building, small conventional commits, lint + tests after each step.
- Make shared schema changes in `packages/shared` first, then `pnpm gen:schemas`.
- Ask before any new dependency. Pre-approved: `lucide-react`, `@playwright/test` (both installed); IBM Plex via `next/font` (done).
- Keep sim-core pure and deterministic; bump `SIM_VERSION` on any sim behaviour change.
- No real military data or installations; cite every source.
- If a design choice conflicts with DESIGN.md or the SPEC, stop and ask; never silently diverge.
- UX is a first-class requirement: `docs/DESIGN.md` is binding; every new or changed screen gets Playwright screenshots at 1366×768 and 1920×1080 and passes DESIGN §13.
- Commit trailer and merge rules per CLAUDE.md §12: rebase-merge, never squash.

---

## Part 3a — Scenario generator, behaviours, swarms, ROE, weather

1. **Generator** in `apps/api/app/services/generator/`, building `ScenarioRequest` → `Scenario`:
   - Determinism: seeded `random.Random` with named sub-streams; deterministic output (sorted keys, rounded floats); a `GENERATOR_VERSION` stored in the scenario.
   - Difficulty: scale everything by the SPEC §7.1 table.
   - Siting: protected asset(s), radar on local high ground near the asset, EO/IR and RF sites, effectors with ranges/ammo, `NO_KINETIC` zones over settlements or buildings where they exist, `BORDER_LINE` where the behaviour needs it.
   - Approach axes: 1–3 depending on difficulty. Attack runs prefer low, terrain-masked routes using a coarse heightmap heuristic.
   - Behaviours: every behaviour in SPEC §7, including `RECON_LOITER` orbit, `SMUGGLING_DROP` with hold + `DROP` + return, `ATTACK_RUN` with terminal `DIVE`, `SWARM_SATURATION` (leader path + followers with staggered arrival), `DECOY` (high, loud RF), `TRANSIT` for civilians, `FRIENDLY_PATROL`, and `BIRD_FLOCK`.
   - Control links and RF emissions consistent with the existing zod rules; silent-link share per difficulty.
   - AI suggestions pre-baked using `aiAssistAccuracy`, lower in night/fog.
   - Environment: time-of-day bands (day/dusk/night) and weather presets (CLEAR, HAZE, FOG, RAIN, DUST for desert later), mapped to the weather schema.
   - Generated briefing markdown: situation, mission, ROE callout, assets, intel. At low difficulty the intel may name the expected axis; at high difficulty it is vague.
2. **Terrain access on the server:** implement the approved `TERRAIN_DIR` approach (below). Python uses the heightmap only for terrain clearance and coarse routing heuristics, never as a second LOS/sensor implementation.
3. **Playability validation without duplicating sim logic** (approved design below):
   - a headless sim-core validator CLI (`pnpm --filter @vyuh/sim-core validate <file|dir>`);
   - criteria: schema-valid; all waypoints inside the map with margin and above minimum AGL; no spawn too close to assets; at least one threat; every threat detectable by some sensor with at least the minimum warning time for its difficulty; and at D1–D3 the scripted defender wins;
   - the generator regenerates a failing contact deterministically (bounded retries) rather than emitting an unplayable scenario.
4. **sim-core support** for any behaviour actions not yet modelled, with tests. Bump `SIM_VERSION` if sim behaviour changes (approved: `SIM_VERSION` 3, below).
5. **ROE semantics** written into SPEC §8 and enforced:
   - `WEAPONS_FREE`: intercept any track.
   - `WEAPONS_TIGHT`: intercept only tracks the trainee classified as a threat class with affiliation `HOSTILE`.
   - `WEAPONS_HOLD`: no intercept; EW allowed.
   - `NO_KINETIC` zones block intercept when the track or intercept point is inside the zone, with a clear disabled reason in the HUD (operator-known facts only, decision 66).
6. **`POST /scenarios/generate`** with role limits: trainees choose terrain, time band, difficulty and a random seed; instructors set everything.
7. **Practice vs Assessment mode:** Practice allows pause and contextual hints; Assessment has no pause. Trends will use Assessment only; store the mode and note this for Phase 4. (Mode is already stored and pause is Practice-only; hints and the Phase 4 note remain.)
8. **Optional, only if everything else is done:** live weather via Open-Meteo behind `OPEN_METEO_ENABLED`, cached, with a preset fallback.
9. **Tests:**
   - same request + seed ⇒ byte-identical JSON;
   - a seed sweep of 20 per difficulty in CI and 50 per difficulty locally (script), all passing the validator (CI threshold below);
   - behaviour unit tests and ROE tests;
   - the worst-case D5 entity count respects the SPEC §16 cap, with an FPS measurement.
10. Close-out per the rules above, then STOP.

### Approved decisions for 3a (assume them in the 3a plan)

- **`TERRAIN_DIR`** setting, defaulting to `apps/web/public/terrain` in dev and tests. The API Dockerfile (built from the repo root) copies only `meta.json` + `heightmap.u16` per preset into the image. Python reads the u16 with the stdlib (`array`), no numpy. One source of truth, no duplicated binaries in git.
- **`SIM_VERSION` 3** for: the `DROP` event (today `DROP` and the `RTH` waypoint action do nothing in the sim), the `WEAPONS_TIGHT` class check (today only the `HOSTILE` affiliation is checked), and `NO_KINETIC` enforcement (not enforced anywhere today).
- **`default_v3` scoring tree** for the rule "a drop before neutralisation counts as a leak". `default_v1` and `default_v2` stay immutable (CLAUDE.md §12); add tests for every new rule.
- **Entity cap:** the generator clamps the total entity count to the SPEC §16 cap (≤ 60 active entities, birds included). At D5 the table allows up to 20 threats + 12 false contacts plus every flock member, so the clamp is needed.
- **Validation: no Node in the API image.**
  - At runtime, Python runs static checks only (bounds, AGL clearance, spawn distance, entity cap), with deterministic bounded retries (attempt sub-streams).
  - The sim-core `validate` CLI (promoted from `playScripted` in `packages/sim-core/test/fixtures.ts`, using the ground-truth defender `createDefender` from `src/defender.ts`) runs in the CI seed sweep (20 per difficulty) and in a local 50-per-difficulty script.
  - **CI fails if more than 2 %** of generated scenarios fail the sensor checks (detectable, warning time, defender wins at D1–D3), so the generator is tuned rather than patched at runtime.
  - Record this reasoning in `docs/decisions.md` during 3a (not yet recorded): the existing fairness rules (UNAVOIDABLE, decision 56) already protect trainees from undetectable or unavoidable contacts.
- **Recommended next difficulty is computed on the server** (done in 3.0): `Score.recommendedDifficulty` + `recommendationBasis: "RULE_V1"` (total ≥ 80 → +1, < 50 → −1, else same; clamped 1–5), added after the scoring engine (decision 64). Phase 5 Elo replaces the rule in the same place. Generated scenarios offered from the result screen should use it.
- **Test-scenario visibility** (done in 3.0): scenarios tagged `test` (S11–S14) are hidden from trainees and visible to instructors and admins (`services/scenarios.py`, `TEST_TAG`). Generated scenarios are not test scenarios; decide in the 3a plan whether generated scenarios get their own tag so the library list stays clean.

### Findings from the Step 1 investigation (2026-10-14)

- Nothing exists yet in `apps/api` for generation. `services/scenarios.py` only lists scenarios and re-checks the zod `superRefine` cross-field rules. `ScenarioRequest` already exists in zod.
- No API Dockerfile yet; `docker-compose.yml` only runs Postgres.
- sim-core already supports `holdS`, `DIVE` and boids bird flocks. Loiter orbits, decoys (high altitude + `rfActive`) and drone swarms (leader path plus offset, staggered followers) can be built by the generator with no sim change ("Python generates, TS simulates", SPEC §19).
- Node 24 runs the sim-core `.ts` source directly, so the validator CLI needs no build step.

---

## Part 3b — Scenario library, urban terrain, scenario select and briefing

1. **`URBAN_GENERIC` preset:**
   - a generic Indian town area with dense OSM buildings, ≥ 50 km from IB/LoC, with no military areas, airfields, helipads or power/dam sites within 10 km (same checks as Phase 2);
   - show the user the bbox and the area's contents before building;
   - keep within the size budget (each preset ≤ ~10 MB) and the FPS budget (merged geometry, building LOS grid).
2. **Placeholder village buildings for `PUNJAB_PLAINS`:** deterministic procedural clusters at OSM village points, flagged as procedural in `meta.json`, and visually consistent with the real OSM buildings.
3. **Scripted scenarios S04–S10** per SPEC §7.2:
   - generator output with a fixed seed plus hand overrides, stored in seed data;
   - each has a full briefing, tags, and an "inspired by publicly reported pattern" citation in `docs/realism-sources.md`;
   - each passes the validator and has its own guard tests (detectability, warning time, scripted defender result as appropriate);
   - S06 uses `URBAN_GENERIC`. S01–S03 stay unchanged.
4. **Training / scenario select redesign** (DESIGN.md §11.3):
   - a table-first list with hillshade thumbnails (generated at build time from the heightmaps), difficulty pips, computed day/dusk/night, conditions, tags, duration, best score, assigned badge;
   - filters and sorting;
   - a "Generate scenario" panel with preview.
5. **Briefing page** (DESIGN.md §11.4):
   - 2D hillshade map with zones, assets, sensor sites and LOS coverage shading (computed with sim-core LOS on a coarse grid in a Web Worker so the UI never janks), scale bar, north arrow, and the intel axis only when the briefing states it;
   - a mission card with situation, mission, ROE callout, assets, sensors/effectors with ranges and ammo, and environment (time, sun elevation, visibility, wind);
   - a Practice/Assessment toggle, a controls reference, and Begin (Enter);
   - fits 1366×768 without scrolling the map.
6. Update SPEC §7.2, §12 Phase 3, §14 and §15 for everything that changed; add decisions.
7. **Close-out:**
   - Phase 3 done-criteria from SPEC §12 with evidence, plus the DESIGN.md §13 checklist for every new or changed screen with screenshots at both sizes;
   - FPS on `URBAN_GENERIC` and on the worst-case D5 scenario;
   - update CLAUDE.md §14;
   - STOP.

### Approved decisions for 3b

- **D4 — "Birds or Drone?":** the seeded S02 "Two Axes" stays unchanged. In 3b add "Birds or Drone?" (SPEC §7.2's bird-flock-vs-single-quad scenario) under the next free library id, and update SPEC §7.2 and §20 (judge demo flow step 3 currently says "Play S02 Birds or Drone?") to reference that id. S04–S10 are taken by the planned library and S11–S14 by test scenarios, so the next free id is **S15**; confirm it in the 3b plan (decision 59).
- Test scenarios (S11–S14) stay hidden from trainees in the redesigned list (done in 3.0, `TEST_TAG` in `services/scenarios.py`).
- The hillshade generator from 3.0 (`pnpm gen:hillshade`, `scripts/hillshade/gen-hillshade.ts`) is the starting point for build-time thumbnails and the briefing map.

---

## Open tech debt relevant to 3a / 3b

From CLAUDE.md §14 and the 3.0 close-out, as of 2026-10-15:

**Generator, sim and scoring (3a)**
- RF and EW are not yet in the procedural generator (Phase 2B).
- RF-only contacts are unactionable by design (decision 53): a `DECOY` with loud RF but no radar track cannot be engaged. Keep this in mind when designing decoys. Acting on RF strobes is a parked open idea.
- Track height leaks truth: the 2D track filter keeps the true AGL as track height (decision 51). The UI shows only LOW/MED/HIGH bands since 3.0, but the sim value is still true AGL.
- Phase 4 replay must check `sim_version`: old sessions are null / v1 / v2 and will not replay exactly after the `SIM_VERSION` 3 bump.
- The scripted guard player in `packages/sim-core/test/fixtures.ts` engages every in-range track, non-threats included. Use the ground-truth defender (`createDefender`) for validation, not the guard player.
- On `PUNJAB_PLAINS` (buildings) a 60-contact radar scan tick costs ~0.9 ms (budget 2 ms). Watch it at the D5 cap and on `URBAN_GENERIC`.
- `ABANDONED` (15 min idle) is not automated; unsent event batches live in memory only; a reloaded mid-run session cannot be resumed (Phase 1).
- Elo update is deferred to Phase 5 (decision 28); `RULE_V1` stands in until then.
- Open idea, parked for Phase 4: ROE interlocks — whether Assessment mode allows attempting ROE-violating responses (and scores them) instead of pre-disabling. The 3a ROE work pre-disables with a reason; do not build interlock scoring in 3a.

**Terrain and presets (3b)**
- `JK_MOUNTAIN` has no OSM buildings: Overpass was unreachable on 2026-10-14. Rebuild when it is back (the rebuilt heightmap is byte-identical).
- The S12 close-range IR view was not re-checked in the browser after the night-map change (Phase 2A).

**Testing, FPS and tooling**
- CI does not run the visual diffs: baselines are Windows-rendered and local-only (`apps/web/e2e/README.md`). Run `pnpm e2e` locally before merging UI work; regenerate with `pnpm --filter @vyuh/web e2e:update` (use `--update-snapshots=all` when a change is under the 1 % pixel tolerance).
- The 60-bird stress FPS case runs only on the dev hero route (`/dev/hero?s=S14&birds=60`), so its numbers are dev-mode (worst case). The 3a "worst-case D5 FPS" measurement needs a method that works on a production build (e.g. a generated D5 scenario played as a real session).
- Intel integrated-GPU FPS is not measured yet (required before 3a).
- uvicorn `--reload` does not pick up changes on Windows: restart the API by hand after Python changes.
- Known issue: the old container `sih-2026-postgres-1` holds port 5432, so `docker compose up` from this repo fails until it is stopped. Docker Desktop must be running for the local DB. Relevant when adding the API Dockerfile and compose service in 3a.
- Landing media are recorded from the real simulator (`pnpm --filter @vyuh/web record:landing`, needs ffmpeg with libvpx-vp9). Re-record them if 3a/3b change the console or result screen.

**UI (3b screens)**
- Comms shows only ~6 lines at 768 px height.
- The result screen cannot show the end reason after a reload (not stored).
- drei `<Html>` track labels log "synchronously unmount a root" errors in dev.
- Web auth guard is client-side only (decision 9).
