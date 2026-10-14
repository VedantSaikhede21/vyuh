# Phase 2 Part B — Sensors, false contacts, EW and scoring: approved plan

Approved 2026-10-14. Branch `feat/phase2b-sensors` (from `main` at `2f035d3`, which contains all of Part A). Spec: SPEC §3, §4.2, §5, §6.1, §6.3, §7, §8, §9 (esp. §9.2, §9.6), §12 (Phase 2), §14, §15.1, §15.2, §16.

**Done when (SPEC §12 Phase 2 + task):** a night scenario where a fibre-optic FPV is invisible to RF and a bird flock creates radar tracks plays correctly; scoring penalises engaging the friendly drone; sources logged; FPS re-measured against SPEC §16. Evidence = test names + command output, checked one by one at the end (commit 14).

## How to work this plan

- One commit per numbered step, conventional message, in this order. Run lint + tests for every package touched before committing (`pnpm lint`, `pnpm test`, `cd apps/api && uv run pytest`, `pnpm gen:schemas` must give no diff).
- sim-core stays pure and deterministic: no React/Three/DOM, no `Math.random`/`Date.now`, iterate in id order, each new random source gets its own named stream.
- Shared schema changes go in `packages/shared` first, then `pnpm gen:schemas`. Never hand-edit generated files.
- No new dependencies are needed or approved for Part B.
- All numbers are representative; record every source in `docs/realism-sources.md`.
- Log each rule below as a decision in `docs/decisions.md` (numbering continues from 46, in commit order, as listed per step) in the commit that implements it, and update the SPEC sections named.
- **Stop and report** (do not tune around it) if the S01 scripted-scenario guard (decision 43: 45 s warning + "a scripted defence neutralises every threat") fails at commit 4.
- Local DB: the container `sih-2026-postgres-1` holds port 5432 and is the one in use (CLAUDE.md §14 Known issues). Start it with `docker start sih-2026-postgres-1`.

## Facts established during planning (2026-10-14)

- `default_v1` has scored sessions (S01: 2 scores, S03: 1), so it is **immutable**. All scoring changes go into a new `trees/default_v2.json`.
- Sessions exist for S01 (27), S03 (1), S11 (14), S12 (4); S02 has none. `seed_scenarios` never updates the content of a scenario that has sessions, so S01/S03/S11/S12 keep `default_v1` in the DB. Only S02 and the new S13/S14 can use `default_v2`. This is fine: v2 changes concern RF, EW and non-threats, which the old scenarios do not contain.
- `threat_types` table has 0 rows (nothing seeds it yet).
- `default_v1` already contains `FRATRICIDE` −40, `WRONGLY_ENGAGED` −25, `NON_THREAT_IDENTIFIED` +5, `NOT_DETECTABLE` (excluded) and the `identifiableWhenClassified` leaf. `FRATRICIDE`/`WRONGLY_ENGAGED` currently count only *fired intercepts*. `Penalty.unavoidable` exists and the engine skips it, but nothing sets it.
- H/F/N/U affiliation shortcuts and Enter-to-confirm intercept already work. J/S/R/Y/X show "later phase".
- `CLASS_PROFILES` (`packages/shared/src/threats.ts`) already has all 10 classes. `RfSensor` and `emissions.{rfActive, rfBand, friendlyIdCode}` exist in the schema but nothing uses them.
- `ContactSpec.path` is `.min(1)`, so flock followers can carry a single start waypoint.
- Track positions are raw radar measurements (σ 10 m range, σ 1° bearing); the EO lock aims at them, so at 1.5° FOV the target is often out of frame. Radar updates only every 2 s scan, so an 18 m/s drone moves 36 m between updates.
- Every drone renders with the same quad geometry. Track labels in `apps/web/components/sim/track-markers.tsx` are drei `<Html>` DOM elements, one per track (an FPS risk with bird flocks).
- PROCEDURAL_HILLS has no `meta.json`; `apps/web/lib/terrain/load-world.ts` handles built-in presets without network.
- There is no API Dockerfile yet; Python must not read files from `packages/` at runtime.
- 42 stale sessions are stuck in `ACTIVE` (known "ABANDONED not automated" debt; ignore).

## Approved design rules

Rule numbers below are plan-local and are cited as "rule N" in the build steps. "Decision N" always means an entry in `docs/decisions.md`.

1. **RF output = strobes + track badge.** RF gives bearing ± error, band and friendly ID code only. Strobes are sim state, not events. A radar track gets an RF badge when a strobe's bearing is within the gate. No new event type.
2. **RF-only contacts are not "detectable" for scoring.** Strobes are not events and the trainee cannot act on a strobe, so a contact never tracked by radar still gets `NOT_DETECTABLE`.
3. **EW_JAM is a ±10° sector** from the jammer toward the ordered track, out to `rangeM`. Every `RF_MANUAL` contact in the sector is affected (id order), friendlies and civilians included.
4. **EW_SPOOF uses the same ±10° sector** and affects `AUTONOMOUS_GNSS` contacts in it. (SPEC is silent on spoof geometry; write it into §8.)
5. **A successful jam/spoof = `NEUTRALISED`** (`RESPONSE_OUTCOME.result = NEUTRALISED` for the ordered track's contact, `CONTACT_NEUTRALISED {by: EW_JAM|EW_SPOOF}`). The contact keeps flying visibly (lands / returns home / drifts) but is `defeated`: it can no longer reach an asset and counts as resolved for `ALL_RESOLVED`.
6. **EW is not gated by ROE or `NO_KINETIC` zones** (non-kinetic; SPEC §8 restricts only INTERCEPT). State this in SPEC §8.
7. **Intercepting a contact already defeated by EW** returns `NO_EFFECT` and uses no round.
8. **Collateral is a list:** `RESPONSE_OUTCOME.payload.collateral` changes from `{contactId}` to `{contactIds: string[]}` (one jam can hit several contacts). No stored log contains `collateral` yet, so no `schemaVersion` bump. Update SPEC §4.2.
9. **`FRIENDLY_JAMMED` −15** (new `ContactOutcome` value and v2 leaf): a friendly affected by a jam, whether targeted or collateral. Firing an intercept at a friendly stays `FRATRICIDE` −40.
10. **`CIVILIAN_JAMMED` −5** (new `ContactOutcome` value and v2 leaf): a civilian contact affected by a jam **only as collateral**. Feedback: "A civilian drone in the jam sector lost its link — check the sector before jamming." A jam or spoof **ordered on a non-threat's own track** (or an intercept fired at it) is `WRONGLY_ENGAGED` −25 (friendlies: see 9). Birds are never penalised (they have no RF link, so they cannot be jammed).
11. **UNAVOIDABLE affects only the decision component.** For a threat that was *not* neutralised, if `reachedAssetTMs − firstDetectableTMs < max(shortest cooldown among effectors able to engage it, 10 s)`, the decision component for that contact gets an excluded `DECISION_UNAVOIDABLE` leaf with feedback. Detection and classification still score normally. "Able to engage": INTERCEPT always; EW_JAM if `RF_MANUAL`; EW_SPOOF if `AUTONOMOUS_GNSS`. **No separate LEAKED penalty** (a leak already forfeits the decision points; a penalty would double-count). Record in SPEC §9.6 and decisions.
12. **Rain = two-way SNR loss** — an **accepted divergence** from SPEC §6.1's "× rain factor". Specific attenuation γ = 0.0101 · R^1.276 dB/km (R = `rainMmph`; representative X-band coefficients in the style of ITU-R P.838), SNR loss = 2 · γ · range_km. The effect grows with range, as it should. Record in SPEC §6.1 and decisions as an accepted divergence.
13. **Clutter:** Pd × 0.4 when contact AGL < 15 m and horizontal range < 2 km (SPEC §6.1 as written).
14. **Alpha-beta track filter, 2D (x, z), with per-tick prediction.** α 0.5, β 0.2 (representative), Δt = time since last update. Between scans the track estimate is extrapolated `pos + vel·Δt` every tick; the EO lock aims at this predicted estimate. The track list and PPI show filtered range/bearing. **Decision on track height:** the filter is 2D because radar height is not measured with noise today and a 3D filter would add an elevation-noise draw; track height therefore stays the true AGL. Add tech debt "track height leaks truth".
15. **Display-only seeder rule:** for a scenario that has sessions, `seed_scenarios` may update **only `name`, `briefing` and `tags`**, and only when every other field of the content is identical. Anything else stays blocked as today.
16. **`SIM_VERSION`:** an integer constant exported by sim-core, bumped whenever sim behaviour changes. Sessions store it (`sessions.sim_version`); the client sends it on session create. Phase 4 replay must check it.
17. **Class profiles reach Python as a generated file:** `pnpm gen:schemas` also writes `apps/api/app/seed/generated/class_profiles.json` (with a `"_generated": "GENERATED FILE — DO NOT EDIT"` key) from `CLASS_PROFILES`. The CI no-diff check covers it. Python never reads `packages/` at runtime.
18. **Tree format extension:** leaves keep `excluded: bool` (v1 must load unchanged) and gain optional `excludeComponents: ["decision", …]`. The engine uses **per-component denominators** (a component's mean is over threat contacts not excluded for that component). v1 scores must be identical before and after.

## Build order (one commit per step)

### 1. `fix(web,seed): show computed isNight in the scenario list and fix S01's briefing dash`
- `packages/shared/src/api.ts`: add `terrainPreset`, `date`, `time` to `ScenarioListItem` (additive); `pnpm gen:schemas`; fill them in `apps/api/app/services/scenarios.py:list_item`.
- `apps/web/app/train/page.tsx` (line ~128 shows `s.isNight`): load each distinct preset's `meta.json` once (cached; reuse the built-in path in `lib/terrain/load-world.ts` for PROCEDURAL_HILLS, which has no meta) and compute `isNight` with sim-core `computeEnvironment`. Show the stored value until the meta has loaded. (Chosen over porting suncalc to Python to avoid two implementations that could disagree.)
- `apps/api/app/seed/scenarios/S01.json`: the ROE line contains a literal U+FFFD (`WEAPONS FREE � engage …`). Replace it with `—`. Check the other scenario files for U+FFFD too.
- `apps/api/app/seed/scenarios.py`: display-only rule (rule 15). If a scenario has sessions and the new content differs from the stored content **only** in `name`, `briefing` and/or `tags`, update those; otherwise keep today's warning-and-skip.
- Pytest: (a) a display-only update to a used scenario is applied; (b) **every gameplay field of the stored content is byte-identical before and after** (compare the JSON with `name`/`briefing` removed, serialised with sorted keys); (c) a change to any gameplay field of a used scenario is still refused.
- Decision 46 (display-only seeder rule).

### 2. `chore(terrain): retry the JK_MOUNTAIN building fetch`
- Re-run `scripts/terrain/build_preset.py` for JK_MOUNTAIN with buildings, **once**. Same arguments as Part A (decision 29: centre 33.750 N 75.875 E, 14 km, 512 px, `--utc-offset-min 330`).
- Verify `heightmap.u16` is byte-identical to the committed one.
- If buildings arrive: commit them, set `buildingsStatus`, re-run `packages/sim-core/test/phase2a-scenarios.test.ts` (S11 LOS can change) and the committed-preset validity test, remove the JK tech-debt item.
- If Overpass is still unavailable: commit nothing, skip this step and say so in the final report.

### 3. `feat(shared,api): Part B schema, SIM_VERSION and sessions.sim_version`
- `packages/shared`:
  - `ClassProfile` gains `typicalLinks: ControlLink[]` and `category` (SPEC §7 table; `HELICOPTER_FRIENDLY` → `NONE`).
  - `ContactOutcome` gains `FRIENDLY_JAMMED` and `CIVILIAN_JAMMED`.
  - `RESPONSE_OUTCOME.payload.collateral` → `{ contactIds: string[] }` (rule 8).
  - Scenario `superRefine`: `emissions.rfActive` must be false when `controlLink` is `AUTONOMOUS_GNSS`, `FIBRE_OPTIC` or `NONE`; `friendlyIdCode` requires `rfActive`. Mirror both rules in Python `scenario_rule_violations` (cross-field rules are not in JSON Schema).
  - Session create request gains `simVersion: int ≥ 1`; session responses expose it.
  - `gen:schemas` also writes `apps/api/app/seed/generated/class_profiles.json` (rule 17).
- `packages/sim-core`: export `SIM_VERSION = 1` (= Part A behaviour).
- `apps/web`: send `SIM_VERSION` on session create.
- `apps/api`: Alembic migration adding nullable `sessions.sim_version` (old rows stay null); store it on create.
- Tests: zod + pytest for the RF/link rules; pytest that `sim_version` is stored and returned; Python check that the generated profiles file matches the zod enum.
- Decisions: 47 (collateral list), 48 (SIM_VERSION), 49 (generated class profiles). SPEC §4.2 (collateral), §10 (`sim_version` column), §11 (session create payload).

### 4. `feat(sim): full radar model and alpha-beta track filter`
- `sensors/radar.ts`: clutter (rule 13) and rain loss (rule 12). Neither adds random draws: keep exactly 5 draws per active contact per scan.
- `tracks.ts` / `sim.ts`: 2D alpha-beta filter on position + velocity (rule 14); each tick, predict active tracks forward; `followLock` aims at the predicted estimate. `headingDeg`/`speedMps` come from the filter velocity. Track `rangeM`/`bearingDeg` shown in the HUD are the filtered values.
- Bump `SIM_VERSION` to 2.
- Regenerate the API fixtures (`packages/sim-core/scripts/export-api-fixtures.ts`, decision 26) — expected change, not a bug.
- Run the S01 guard. **If it fails, stop and report.**
- Tests: Pd curve (0.5 at `refRangeM` for 0.01 m², monotonic, RCS^¼ range ratio), clutter on/off at the 15 m / 2 km edges, rain loss grows with range and rain rate, 5-draw invariance, filter error lower than raw measurement and converging on a constant-velocity target, prediction between scans, locked target stays inside a 1.5° FOV in S11, S11/S12 Part A tests still pass, determinism.
- Decisions 50 (rain as SNR loss, accepted divergence; update SPEC §6.1), 51 (alpha-beta 2D + prediction; track height stays truth). Remove "EO video auto-track" from Open ideas if the lock test shows the target stays in frame.

### 5. `feat(sim): RF detector`
- New `sensors/rf.ts`: scan every 1 s on stream `rf:<sensorId>`, fixed draws per active contact per scan (whether detected or not). Detected when `rfActive`, range ≤ `rangeM`, and in LOS (shared LOS cache). Output: bearing + gaussian noise (σ = `bearingErrDeg` / 2), band, `friendlyIdCode` if set. No range.
- Strobes are sim state (`state.rfStrobes`), ids `E01…` associated by ground truth (like decision 23), expire 3 s after the last detection.
- Each tick, a radar track takes the nearest strobe within `bearingErrDeg` as its `rf` badge (band + ID code), or null.
- No new events. Bump `SIM_VERSION` only if an existing scenario's replay changes (the fixture staleness test shows this).
- Tests: silence for each of `AUTONOMOUS_GNSS`, `FIBRE_OPTIC`, `NONE` (and `rfActive: false`); `RF_MANUAL` detected in range, not beyond, not when masked; bearing error bounded; badge gating; determinism.
- Decision 52 (RF strobes + badge, no events, RF-only not detectable). SPEC §6.3.

### 6. `feat(sim): contact control modes and boids`
- `ContactState` gains `control: 'PATH' | 'HOVER_LAND' | 'RTH' | 'DRIFT' | 'BOID'` and `defeated: boolean`. A `behaviours/` module holds link-loss reactions and the boid step.
- New `boids.ts`: for each `groupId` with behaviour `BIRD_FLOCK`, the lowest-id member is the leader and flies the group path; the others use separation / alignment / cohesion + leader-follow with fixed weights, plus a random altitude wander on stream `birds:<groupId>`. Fixed id iteration order; members keep a minimum AGL.
- Tests: boids determinism (two runs identical), flock cohesion bounded, no bird below minimum AGL, a bird flock creates radar tracks (SPEC §6.1 "intentional"), new stream does not shift other streams.

### 7. `feat(sim): EW_JAM and EW_SPOOF effectors`
- `effectors.ts`: dispatch by kind (`resolveIntercept`, `resolveJam`, `resolveSpoof`); remove the Phase 1 "not available yet" rejection in `sim.ts` `validate`.
- EW_JAM (rules 3, 5, 6): sector ±10° toward the ordered track out to `rangeM`; P = 0.9 per affected `RF_MANUAL` contact, rolled on the `effectors` stream only when the effector fires (in id order). Reactions by behaviour: `ATTACK_RUN`, `SWARM_SATURATION` → `HOVER_LAND`; `RECON_LOITER`, `SMUGGLING_DROP`, `TRANSIT`, `DECOY`, `FRIENDLY_PATROL` → `RTH` (fly to `path[0]`, then despawn). Ordered contact not `RF_MANUAL` → `NO_EFFECT` (cooldown still consumed). Affected non-target contacts go into `collateral.contactIds`.
- EW_SPOOF (rule 4): same sector, P = 0.8 against `AUTONOMOUS_GNSS`; target → `DRIFT` (lateral route offset growing to ~400 m by arrival, so a dive misses the asset); others → `NO_EFFECT`.
- Both: range, cooldown, optional ammo; results from §4.2 (`NEUTRALISED`, `NO_EFFECT`, `MISSED`, `OUT_OF_RANGE`, `COOLDOWN`, `NO_AMMO`). Not ROE-gated. Defeated contacts cannot reach assets and count as resolved. Intercept on a defeated contact → `NO_EFFECT`, no round (rule 7).
- Tests: one per rule — jam effective vs `RF_MANUAL`, `NO_EFFECT` vs GNSS and fibre-optic; spoof effective vs GNSS, `NO_EFFECT` vs RF_MANUAL and fibre-optic; out of range; sector edge in/out; cooldown; ammo; friendly caught as collateral; civilian caught as collateral; each reaction; defeated contact never reaches asset; intercept on defeated; determinism.
- Decision 53 (sector, not ROE-gated, success = NEUTRALISED, reactions). SPEC §8.

### 8. `feat(web,seed): per-class contact meshes and threat-type seed`
- `apps/web/components/sim/drones.tsx`: one `InstancedMesh` per shape family — quad (QUAD_SMALL, QUAD_HEAVY, FPV, FRIENDLY_QUAD, CIVILIAN_HOBBY), fixed-wing (FIXED_WING_SMALL, LOITERING_GENERIC), bird (BIRD_SMALL, BIRD_LARGE; wing flap via per-instance scale), helicopter — scaled by `sizeM`. About 4 draw calls; IR heat per instance as today.
- API: seed `threat_types` from `seed/generated/class_profiles.json` (idempotent).
- Pytest: every `ContactClass` has a row with the right `is_threat`, RCS and links.

### 9. `feat(web): APP-6 affiliation shapes`
- Simplified APP-6 frames, always with the letter: hostile diamond, friendly circle, neutral square, unknown quatrefoil. One shape component (SVG) used in the track list; the same shapes drawn on the PPI canvas and as 3D track-marker geometry. Colours stay in `lib/affiliation.ts`.
- FPS: render `<Html>` labels only for the selected track and tracks marked detected.
- Verify H/F/N/U still work (already wired).

### 10. `feat(web): RF panel and EW controls`
- RF panel as a tab in the HUD: strobe list (id, bearing, band, ID code) + strobe lines on the PPI; RF badge column in the track list.
- Action bar: Jam and Spoof buttons with cooldown and ammo; wire `J` and `S` in `components/hud/shortcuts.tsx` (`R`, `Y`, `X` stay "later phase"). Intercept still needs `Enter`.
- Keep the layout usable at 1366×768.

### 11. `feat(scoring): default_v2 tree`
- `metrics.py`: EW orders and results per contact; ineffective EW orders (`NO_EFFECT` because of link type); collateral parsed from `RESPONSE_OUTCOME.collateral.contactIds`; `reachedAssetTMs`; `respondingEffectorCooldownMinS`; `unavoidableDecision` (rule 11); outcomes `FRIENDLY_JAMMED`, `CIVILIAN_JAMMED`; `WRONGLY_ENGAGED` also when a jam/spoof is ordered on a non-threat's own track.
- `tree.py` / `engine.py`: `excludeComponents` and per-component denominators (rule 18).
- `trees/default_v2.json` = v1 plus:
  - decision branch: `decisionNeutralised` → else `DECISION_UNAVOIDABLE` (excludes `decision` only) → else engaged/ordered leaves generalised to EW;
  - `DECISION_INEFFECTIVE_EW` (5 points; feedback e.g. "Jamming has no effect on a fibre-optic drone.");
  - a feedback-only note when an ineffective EW order preceded a later success;
  - `DECISION_NEUTRALISED` feedback names the method (jammed / spoofed / N round(s));
  - non-threat branch: `FRATRICIDE` −40 (intercept fired at friendly), `FRIENDLY_JAMMED` −15, `WRONGLY_ENGAGED` −25, `CIVILIAN_JAMMED` −5 (collateral only, feedback per rule 10), `NON_THREAT_IDENTIFIED` +5, left-alone; birds penalty-free.
  - `NOT_DETECTABLE` and `identifiableWhenClassified` carried over unchanged.
- Pytest: every new leaf and fairness rule (the existing leaf-coverage test in `tests/test_scoring.py` must cover v2); UNAVOIDABLE threshold both sides incl. the 10 s floor; detection/classification still scored when decision is excluded; `CIVILIAN_JAMMED` only for collateral (targeted civilian = `WRONGLY_ENGAGED`); birds never penalised; **v1 fixtures re-score identically**.
- Decisions 54 (FRIENDLY_JAMMED −15, CIVILIAN_JAMMED −5), 55 (UNAVOIDABLE decision-only, no leak penalty). SPEC §9.2, §9.6.

### 12. `feat(seed): S13 Silent Ridge and S14 Mixed Sky test scenarios`
Both tagged `test`, `scoringTreeId: default_v2`, with RADAR, EO_IR, RF sensors and EW_JAM, EW_SPOOF, INTERCEPT effectors. Add to `TAGS` in `seed/scenarios.py`.
- **S13 Silent Ridge** — JK_MOUNTAIN, night: a `FIBRE_OPTIC` FPV `ATTACK_RUN` (`rfActive: false`) masked by the ridge until late; **plus a small bird flock**, so SPEC §12's single-scenario wording ("a night scenario where a fibre-optic FPV is invisible to RF and a bird flock creates radar tracks") is met literally.
- **S14 Mixed Sky** — PUNJAB_PLAINS, day: a bird flock, one hostile `RF_MANUAL` quad, and a `FRIENDLY_QUAD` on `FRIENDLY_PATROL` with **no `friendlyIdCode`**, flying inside the jam sector toward the hostile.
- Both must pass `scenario_rule_violations` and the scripted-scenario guard.
- Tests (sim-core): S13 — FPV never has an RF strobe, bird flock creates radar tracks, FPV first tracked late; S14 — birds tracked, jam toward the hostile also affects the friendly. Export real sim logs as API fixtures; pytest: engaging the friendly in S14 is penalised (`FRATRICIDE` for an intercept, `FRIENDLY_JAMMED` for a jam).

### 13. `docs: Part B sources, decisions, SPEC and status`
- `docs/realism-sources.md`: radar equation (SNR ∝ RCS/R⁴), representative RCS values, clutter, rain attenuation (ITU-R P.838-style coefficients), alpha-beta filter, bird false alarms in C-UAS, fibre-optic FPV inspiration, boids (Reynolds 1987), drone link-loss failsafe behaviour (hover/land/RTH), APP-6 frame shapes.
- `docs/decisions.md`: 46–55 as listed above (if any is not yet logged).
- SPEC: §4.2, §6.1, §6.3, §8, §9.6, §10, §11 as listed per commit (check all are done).
- CLAUDE.md §14: status, evidence, tech debt:
  - replace "record a sim version per session" (if present) with **"Phase 4 replay must check `sim_version`"**;
  - add **"track height leaks truth"** (2D filter, rule 14);
  - remove the EO-lock and isNight and S01-dash items fixed here; remove the JK buildings item if step 2 succeeded.
- Confirm the Open idea **"act on RF strobes (jam along a bearing) and EO-initiated tracks"** is in §14 (RF-only contacts are unactionable by design).

### 14. Evidence run (no code unless something fails)
- Check every Phase 2 done-criterion with evidence (test names + output): FPV never on RF, birds create radar tracks, engaging the friendly is penalised, sources logged.
- Full `pnpm lint`, `pnpm test`, `uv run pytest`, `pnpm gen:schemas` (no diff), `next build`.
- FPS in headless Chrome on the integrated GPU (decision 45 method) for S13 and S14, plus a 60-entity bird stress case; sim tick benchmark (SPEC §16: ≥ 30 fps, ≤ 150 draw calls, tick ≤ 2 ms). Re-check 1366×768.
- Plain-language summary, tech debt list, update CLAUDE.md §14, then **stop** — do not start Phase 3.

## Risks

- **Fixture churn is expected** at commit 4 (filter changes track positions → EO lock → `EO_IDENTIFIABLE` timing; clutter changes Pd during S01's low dive). Regenerate, don't hand-edit.
- **S01 guard** may fail because of clutter in the terminal dive → stop and report (see top).
- **Old sessions will not replay exactly** on the new sim; `sim_version` (commit 3) makes this detectable for Phase 4.
- **Per-component denominators** change engine maths; the v1 re-score test guards against regressions.
- **FPS:** many bird tracks → many DOM labels; mitigated in commit 9. Instanced meshes keep draw calls ≈ 4 for contacts.
