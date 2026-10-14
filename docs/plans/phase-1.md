# Phase 1 — MVP loop: approved plan

Approved 2026-10-14. Branch `feat/phase1-mvp-loop`. Spec: SPEC §12 (Phase 1), plus §3–§6.1, §8, §9, §11, §15, §16.

**Done when (SPEC §12):** a trainee can log in, play a 3-minute scenario and see a correct score breakdown; a vitest proves determinism (same scenario + commands ⇒ same final state); pytest covers each scoring leaf.

## Approved decisions

1. **Terrain:** a small deterministic procedural heightmap (gentle hills) generated in sim-core, not a flat plane. It uses the same sampling code path as Phase 2's real DEM presets.
2. **Score scale:** the Phase 1 tree scores only detection (25), classification (25) and decision (30). The total is scaled to 100 over the components present in the tree; report and efficiency are 0 and arrive in later phases.
3. **Dependencies (web):** `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`, `zustand`. Recharts and Playwright are not needed yet.

Log 1 and 2 in `docs/decisions.md` when implemented.

## Build order (one commit per step; lint + tests green before the next)

1. **Shared schemas:** add a scenario list item (for `GET /scenarios`) and the `GET /sessions/{id}` response; finalise the provisional `Penalty` / `PerContactMetrics` / `ContactOutcome`; run `pnpm gen:schemas`.
2. **sim-core core:** `clock.ts` (fixed 20 Hz, integer ms), `coords.ts` (the only scenario → Three.js flip), `terrain.ts` (procedural heightmap + sampling), `contacts.ts` (waypoint kinematics with turn-rate limit; ATTACK_RUN ends in a dive at the asset), `events.ts` (event log with seq).
3. **sim-core sensors and actions:**
   - `sensors/radar.ts`: basic radar. Pd from the radar equation (range ∝ RCS^¼, logistic), noisy bearing and range. No clutter or rain yet.
   - `tracks.ts`: confirmed after 3 hits in 5 scans, lost after 4 misses; ids `T001…`, separate from contact ids.
   - `effectors.ts`: INTERCEPT with range, ammo, cooldown and range-based Pkill (`effectors` RNG stream); under WEAPONS_TIGHT it is blocked unless the track is classified hostile.
   - `sim.ts`: `createSim`, `tick`, `dispatch`, `getState`, `getEvents`.
   - Commands = the shared trainee event types without `seq` / `tMs` (no duplicate type), applied on the next tick.
   - Tests: determinism, radar Pd curve, N-of-M confirmation, intercept rules, waypoint kinematics.
4. **API scenarios and sessions:**
   - Scripted scenarios in `apps/api/app/seed/scenarios/*.json`, all QUAD_SMALL + ATTACK_RUN, 180 s, loaded by the seed script:
     - **S01** one drone, clear day, WEAPONS_FREE
     - **S02** two drones on different axes, staggered
     - **S03** low approach, less warning, WEAPONS_TIGHT
   - Endpoints: `GET /scenarios`, `GET /scenarios/{id}`, `POST /sessions`, `POST /sessions/{id}/events` (idempotent by `batchSeq`), `GET /sessions/{id}`.
   - Plausibility checks per SPEC §3.3.
5. **API scoring:**
   - `services/scoring/`: decision-tree engine + `trees/default_v1.json` covering detection latency bands, classification and decision, plus a penalty for engaging a non-threat.
   - `POST /sessions/{id}/complete`: validate → score → store.
   - Track ids are mapped to contacts via `SENSOR_TRACK_CREATED` events.
   - Tests: pytest for every tree leaf, the plausibility rules, idempotent batches and ownership.
6. **Web sim loop:** `useSimLoop` (accumulator, fixed tick), a zustand bridge (read-only for rendering and HUD), and an event batcher (every 2 s + on end, retry with backoff).
7. **3D scene (R3F):** terrain mesh, instanced drones, sky, orbit tactical camera, asset and effector markers, interpolation between ticks.
8. **HUD:**
   - radar PPI (canvas, sweep + blips)
   - EO view (second narrow camera, slew to selected track, zoom)
   - contact list
   - action bar: mark detected, classify, affiliation, intercept; SPEC §15.1 shortcuts
   - top bar: clock, ROE
   - laid out for 1366×768
9. **Screens and wrap-up:**
   - `/train` scenario list → `/train/session/[id]` player → result screen (total, component bars, per-contact feedback)
   - update `docs/realism-sources.md`, `docs/decisions.md` and CLAUDE.md §14
   - check the done-criteria with evidence
   - FPS check in the browser

## Risks / notes

- Largest phase: steps 2–5 carry the done-criteria and get the most care; keep visuals in 7–8 deliberately plain.
- The server trusts client sensor events in MVP (SPEC §3.3); plausibility checks guard against nonsense.
- Local Postgres: the old container `sih-2026-postgres-1` holds port 5432. It has the same DBs and credentials, so tests run against it until the user stops it (see CLAUDE.md §14 Known issues).
