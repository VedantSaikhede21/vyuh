# Decisions (ADR log)

Short entries: date, decision, why. Newest at the bottom.

## 2026-10-14 — Phase 0 spec clarifications

1. **Scenario shape follows the §4.4 example.** `schemaVersion` (not `version`), `roe` and `durationS` at top level, `environment = {date, time, isNight, weather, sunAzEl?}`, `request` optional. *Why:* the example is what scripted scenarios will look like; scripted scenarios have no ScenarioRequest.
2. **`Scenario.id` is a plain string; `scenarios.code` column added** (nullable unique, e.g. `S04`). *Why:* scripted scenarios have human codes, DB rows use UUIDs.
3. **`trackId` / `contactId` only at the top level of `SimEvent`**, not inside payloads; `SimEvent` is a discriminated union on `type`; `seq` required. *Why:* matches `session_events` columns and the §11.1 batch example; avoids two sources of truth.
4. **`session_events.seq` column with unique `(session_id, seq)`.** *Why:* replay ordering and idempotent ingestion need it.
5. **Scenario coordinates:** `x` = east, `z` = north, `y` = metres AGL; 2D points `[x, z]`. Flip to Three.js only in `sim-core/src/coords.ts`. *Why:* the spec mixed ENU and Three.js conventions.
6. **All enums in `enums.ts`**, including the ones §4 implied but did not list. `ACOUSTIC` omitted until implemented (adding an enum value later is non-breaking).
7. **Sensor and effector configs are unions keyed on `kind`.** `Penalty` and `PerContactMetrics` are provisional shapes until Phase 1 scoring; `threat_types.category` stays free text.
8. **Auth identity mapping.** Local: token `sub` = `users.auth_id` = `local:<email>`. Supabase: `sub` = Supabase user UUID; unknown users auto-provisioned as TRAINEE with no unit. Role always comes from the DB, never from token claims. *Why:* one code path for RBAC, and token claims cannot escalate privilege.
9. **No passwords in our DB.** Local mode uses `POST /auth/dev-login` (by email, disabled when `ENV=prod`); Supabase demo users are created in the Supabase dashboard. *Why:* `users` has no password column and Supabase owns credentials.
10. **Production guard:** `ENV=prod` requires `AUTH_MODE=supabase`; `LOCAL_JWT_SECRET` ≥ 32 bytes. Supabase project must use asymmetric JWT signing keys (JWKS cannot verify legacy HS256 tokens).
11. **sim-core RNG built in Phase 0** (spec lists it in Phase 1). *Why:* requested by the lead; it is foundational and has no dependencies.

## 2026-10-14 — Phase 0 tooling

1. **TypeScript pinned to ~6.0**, not 7.x. *Why:* typescript-eslint supports `<6.1`.
2. **zod 4** with built-in `z.toJSONSchema`. *Why:* no extra `zod-to-json-schema` dependency.
3. **One bundled JSON Schema (`$defs`) → one generated Python module.** *Why:* simple, deterministic codegen.
4. **`pnpm dev` = `pnpm -r --parallel dev`**, with a thin `apps/api/package.json` that calls uv. *Why:* no `concurrently` dependency.
5. **Sync SQLAlchemy 2 + psycopg 3.** *Why:* simpler than async; a unit-sized load is tiny.
6. **Stdlib logging (JSON lines) with a request-id contextvar**, not structlog. *Why:* no extra dependency.
7. **Line endings forced to LF (`.gitattributes`)** and datamodel-codegen run with `--disable-timestamp`. *Why:* Windows dev machines must not create diffs in CI's no-diff check.
8. **Tests use a real Postgres** (`vyuh_test` locally via docker compose, a service in CI). *Why:* tables use `jsonb` and `text[]`.
9. **Web auth guard is client-side** (token in browser storage, as Supabase JS does). Middleware-based guard is tech debt for later.
10. **Generated Pydantic enums use UPPER_SNAKE members** (`--capitalise-enum-members`) and unions get an explicit `discriminator` added by the JSON Schema export, so Pydantic uses tagged unions for `SimEvent` / `SensorConfig`. *Why:* readable Python, fast and precise validation errors.
11. **uvicorn runs in factory mode** (`app.main:create_app --factory`). *Why:* importing the app module must not require env vars (tests and tooling build their own `Settings`).
12. **Error code ↔ HTTP status map is duplicated in Python** and a pytest cross-checks it against `packages/shared/src/enums.ts`. *Why:* the map is a constant, not a type, and JSON Schema cannot carry it.
13. **Web uses system font stacks** (no `next/font/google`). *Why:* builds and runs fully offline.
14. **shadcn/ui components are added by hand** (`components/ui`, `components.json` present) instead of running the CLI. *Why:* the CLI is interactive and network-bound; output is equivalent.

## 2026-10-14 — Repository location

The repo moved from a OneDrive-synced folder on C: to `D:\dev\vyuh` (C: was full; OneDrive also locks `node_modules`). pnpm store → `D:/.pnpm-store`, uv cache → `D:/.uv-cache` (user-level config, not in the repo).

15. **`unrs-resolver` build script denied** (`allowBuilds` in `pnpm-workspace.yaml`). *Why:* pnpm 12 blocks unapproved install scripts; the package (via eslint-config-next) ships prebuilt binaries, so its postinstall is unnecessary.

## 2026-10-14 — Merge strategy

16. **PRs are rebase-merged, not squash-merged** (CLAUDE.md §12). *Why:* VYUH has a single developer, and individual commits on `main` keep a readable history and count on the contribution graph; CI still gates every PR. Phase 0 history was restored to its 9 original commits after an initial squash.

## 2026-10-14 — Phase 1 (MVP loop)

17. **Phase 1 terrain is a procedural heightmap** (`PROCEDURAL_HILLS`: seeded 3-octave value noise, ~60 m relief, flat 400 m around the origin), not a flat plane. *Why:* exercises the same `sampleHeight` path that Phase 2 real-DEM presets use.
18. **Score scale:** the Phase 1 tree scores detection (25), classification (25) and decision (30); `total` is scaled to 100 over the components the tree scores (`componentMax > 0`), then penalties/bonuses are added and clamped to 0..100. Each component is the mean over scored threat contacts; a threat that was never detectable is excluded (SPEC §9.6). With no scored threat the base is full marks. `Score.componentMax` comes from the (immutable) tree file, so no DB column is needed.
19. **"Trainee detected" = first MARKED_DETECTED, CLASSIFIED, AFFILIATION_SET or RESPONSE_ORDERED** on any of the contact's tracks (TRACK_SELECTED does not count). *Why:* a trainee who classifies without pressing D clearly noticed the track; scoring them as "missed" would be unfair.
20. **Decision-tree format:** `if` nodes (metric/op/value), `bands` nodes (one leaf per band, then `next`), leaves with `component` + `points` or a session-level `adjust` (penalty/bonus, listed in `penalties`), `excluded` for fairness, and templated `feedback`. A pytest fails if any leaf lacks a test case.
21. **Enum additions:** `ContactOutcome.UNRESOLVED` (threat neither neutralised nor leaked at time-up) and `ResponseResult.NO_AMMO`. `PerContactMetrics` gains `trackIds` and `leaves`.
22. **EW_JAM / EW_SPOOF commands are rejected by `sim.dispatch` in Phase 1** (no EW effectors yet) rather than returning a fake outcome.
23. **Radar tracks associate by ground truth** (one track per radar × contact); confirmation is still N-of-M on noisy detections. *Why:* data association is out of scope for the MVP; the trainee still only sees track ids.
24. **Plausibility (SPEC §3.3) runs per batch and again on complete.** Extra rules beyond the spec list: contiguous `seq` (detects lost batches), first event is a matching SESSION_STARTED, no duplicate track ids, no events after SESSION_ENDED, and on complete the log must contain SESSION_ENDED with `endTMs` consistent. A failing batch is rejected whole and its `batchSeq` is not consumed.
25. **Responses embedding a Scenario or Score use `response_model_exclude_unset`.** *Why:* zod `.optional()` rejects `null`; explicit nullable fields (e.g. `endedAt`) are still sent as `null`.
26. **Real sim logs as API fixtures** (`apps/api/tests/fixtures/`, written by `packages/sim-core/scripts/export-api-fixtures.ts`); a sim-core test fails if they are stale. *Why:* API tests exercise exactly what the client sends.
27. **`MAX_EVENTS_PER_SESSION` is mirrored in Python** with a test cross-checking `api.ts` (same pattern as decision 12).
28. **Elo update on complete is deferred to Phase 5** (adaptive difficulty), where it is listed in SPEC §12.

## 2026-10-14 — Phase 2 Part A (terrain, LOS, day/night, EO/IR)

29. **DEM source: Copernicus GLO-30**, tiles downloaded from the public AWS bucket into `scripts/terrain/raw/` (git-ignored). Boxes: PUNJAB_PLAINS 30.520 N 75.700 E, JK_MOUNTAIN 33.750 N 75.875 E, 14 km each; vetted against OSM (no military / aeroway / dam / power features within box + 10 km; ≥ 50 km from IB/LoC). *Why:* free, global, 30 m, clear attribution terms.
30. **`heightmap.u16` is the load format; `heightmap.png` is a preview only.** Heights are stored relative to the origin elevation (absolute values in `meta.json`). *Why:* browsers' canvas decode is 8-bit, and a raw little-endian buffer needs no decoder; origin-relative heights keep the defended position near y = 0 so cameras and fog work for mountain presets.
31. **`buildings.geojson` uses local metres `[x, z]`, not lon/lat.** *Why:* the browser and sim-core need no projection library, and the coordinates match the DEM grid exactly. Default building height: 2 levels × 3 m when OSM has no `height` / `building:levels`.
32. **`scripts/terrain` is its own uv project** with its own CI step. *Why:* GDAL/osmnx are heavy and must not enter the API image.
33. **Preset meta is authoritative for the origin, and carries `utcOffsetMin`.** `environment.isNight` and `sunAzEl` are computed from suncalc and override stored values. *Why:* one source of truth; parsing a local time without an explicit offset would depend on the machine's timezone and break determinism.
34. **`World` object** (heightmap + buildings + LOS) passed to `createSim`; a bare `Heightmap` is still accepted. `PROCEDURAL_HILLS` stays as a built-in preset, so S01–S03 keep working.
35. **Radar LOS factor only in Part A** (clutter, rain, full model in Part B). A masked contact still consumes its fixed 5 random draws; the lost reason is `LOS` when every losing miss was masked.
36. **Camera pointing is sim state.** `CAMERA_SLEWED` gains an optional top-level `trackId` (lock — sim-core follows the track's estimated position each tick) and `payload.mode` (DAY/IR). *Why:* EO_IDENTIFIABLE depends on pointing and mode, so both must come from logged commands for exact replay. `mode` was added beyond the original approval list for the same reason (approved).
37. **Slew logging:** still throttled to 2/s, plus one final `CAMERA_SLEWED` at the end of every drag / slew / zoom / mode gesture so the sim settles on exactly what the trainee sees. **Known lag:** during a manual drag the sim's pointing can trail the view by up to 0.5 s, so EO_IDENTIFIABLE can be up to 0.5 s late while dragging. Accepted.
38. **EO/IR model constants (representative):** IR visibility cap = 1.5 × `visibilityM`; DAY mode yields nothing at night; IR cycles scaled by per-class `thermalContrast`; EO_IDENTIFIABLE hysteresis 1 s.
39. **`identifiableWhenClassified` keys off the scenario having an EO sensor**, not off any EO_IDENTIFIABLE being in the log. *Why:* a trainee who never pointed the camera classified before the contact was identifiable. Points are unchanged (wrong = 0 either way); only the leaf/feedback text differs if an old Phase 1 session is explicitly re-scored.
40. **Single canvas:** tactical and EO views are drei `<View>`s on one full-page canvas; the EO camera renders to a 640×360 target shown through a custom day/IR shader. *Why:* one WebGL context, one copy of terrain/buildings on the GPU.
41. **Terrain LOD:** 4×4 chunks with drei `<Detailed>` levels (step 1/2/4/8) and skirts; buildings merged into one geometry; a 100 m grid index for building LOS. *Why:* SPEC §16 draw-call and tick budgets.
42. **S11 / S12 are test scenarios** (tag `test`), separate from the S01–S10 training library.
43. **Scripted-scenario guard: 45 s minimum warning (was 60 s) plus "a scripted defence neutralises every threat".** *Why:* with radar LOS masking, S03 (20 m AGL, "less warning" by design) is first tracked at ~1,050 m instead of ~1,820 m, leaving 58.5 s; the guard's purpose is "defensible in time", which the new check tests directly. S01 and its API fixtures are unchanged; S02's second contact is tracked 2 s later.
44. **Tactical map lighting at night is a display aid.** The tactical view keeps a dusk-level ambient floor and an overhead "map light" when the sun is low or down; the EO/IR view keeps true darkness. *Why:* the tactical view stands in for a C2 map display, which an operator can always read; only the sensor view should be degraded by night.
45. **FPS is measured in headless Chrome on the integrated GPU** (ANGLE / D3D11, AMD Radeon on a Ryzen 7 5800H). *Why:* on a machine in use, a visible test window gets covered (Chrome throttles requestAnimationFrame to 1 Hz) or receives stray input; headless keeps the GPU path but removes both.
## 2026-10-14 — Phase 2 Part B (sensors, EW, scoring)

46. **Display-only seeder updates.** For a scripted scenario that already has sessions, `seed_scenarios` may update only `name`, `briefing` and `tags`, and only when every other content field is identical; any gameplay change is still refused (new code needed). *Why:* replay and scores depend on gameplay content, but wording fixes (e.g. S11/S12 ROE dashes) should not need a new scenario code. The "S01 mis-encoded dash" was a Windows console display artefact (cp1252 printing U+2014), not a data bug: seed files and DB hold a correct em dash.
47. **`RESPONSE_OUTCOME.collateral` is a list** (`{contactIds: string[]}`, was `{contactId}`). *Why:* one jam sector can affect several contacts. No stored event log contains `collateral` yet, so no `schemaVersion` bump.
48. **`SIM_VERSION`**: an integer exported by sim-core, bumped whenever sim behaviour changes. The client sends it on session create; `sessions.sim_version` stores it (nullable; older sessions are null). *Why:* Part B changes the sim, so old sessions will not replay exactly; Phase 4 replay must check the version instead of silently diverging.
49. **Class profiles reach Python as a generated file.** `pnpm gen:schemas` also writes `apps/api/app/seed/generated/class_profiles.json` (with a `_generated` key) from `CLASS_PROFILES`; CI's no-diff check covers it. `ClassProfile` gains `typicalLinks` (SPEC §7) and `category` (`DRONE` / `BIRD` / `MANNED_AIRCRAFT`, for `threat_types.category`). The scenario rules now require `rfActive: false` for `AUTONOMOUS_GNSS` / `FIBRE_OPTIC` / `NONE` links and `rfActive` for a `friendlyIdCode` (mirrored in Python). *Why:* one source of truth for threat data without Python reading `packages/` at runtime (there will be an API container without it).
50. **Rain is a two-way SNR loss, not a Pd factor** (accepted divergence from SPEC §6.1's "× rain factor"). Specific attenuation γ = 0.0101 · R^1.276 dB/km (representative X-band coefficients in the style of ITU-R P.838), loss = 2 · γ · range_km, subtracted from SNR before the logistic. Clutter stays as written (Pd × 0.4 below 15 m AGL inside 2 km). Neither adds random draws. *Why:* a fixed Pd factor would hurt a close target as much as a far one; path attenuation grows with range, as it does physically.
51. **2D alpha-beta track filter with per-tick prediction** (α 0.5, β 0.2; velocity from the first two measurements; Δt = time since last update). The HUD and the EO lock use the predicted estimate; track height stays the true AGL (tech debt "track height leaks truth" — radar height is not measured with noise, and a 3D filter would add an elevation draw). Measured 2026-10-14: on a constant-velocity target at ~3 km, position RMS 22/20/27 m filtered vs 33/38/37 m raw (seeds 1–3), velocity error converging from 11–39 m/s to 2.5–3.2 m/s; along S11's path, aiming at the filtered estimate puts the target within ±0.75° of bearing on 70 % of ticks vs 61 % for the raw measurement; a fully zoomed lock in the sim keeps S11 in frame 56 % of ticks (S12 57 %, S01 46 %) vs 43 % / 47 % / 44 % in Part A. No α/β (tried down to 0.15/0.02) keeps a target inside a 1.5° FOV: radar bearing σ 1° is larger than the ±0.75° half-frame. *Why:* the plan's "stays in frame" goal needs an EO tracker, not a better radar filter — added as step 4b (decision 52).
52. **EO video auto-track: MANUAL / CUE / TRACK camera states** (SPEC §6.2). Radar cues the camera at the filtered estimate (CUE); once the cued contact is at EO level ≥ DETECT inside the central half of the frame for 0.5 s the EO tracker takes over (TRACK) and aims at the contact itself plus a small deterministic jitter (stream `eo-track`, 1σ = 2 % of HFOV). TRACK breaks to CUE on leaving the frame, losing LOS, > 1 s with no EO level, or the contact going inactive (to MANUAL if the radar track is gone); a manual slew → MANUAL; a zoom / mode change on the same lock keeps TRACK. Pure sim state from logged commands, no new event; `SIM_VERSION` stays 2 (no sessions were recorded between steps 4 and 4b). Measured 2026-10-14, fully zoomed (1.5°): target in frame on 100 % of TRACK ticks in S11 (2,531 ticks, DAY), S12 (5,016, IR) and S01 (2,577, DAY), TRACK reached 13 s / 11 s / 16 s after the cue. API fixtures unchanged (the scripted player never moves the camera). *Why:* real C-UAS EO systems are radar-cued and then hold the target with a video tracker; radar bearing noise (σ 1°) alone cannot keep a 1.5° frame on target (decision 51).
