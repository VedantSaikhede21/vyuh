# CLAUDE.md — VYUH: AI-Enabled Drone & Counter-Drone Threat Simulation Trainer

> Working name "VYUH" — rename freely. SIH 2026, Problem Statement **26247**, Ministry of Defence (Defence Services Staff College), theme Robotics & Drones, category Software.
> This file is loaded every session. It holds the rules, architecture and conventions. The full detailed spec lives in **`docs/SPEC.md`** — read the relevant section before working on any feature.

---

## 1. What we are building (one paragraph)

A browser-based 3D simulator that trains military personnel to **detect, track, identify, decide and respond** to drone and drone-swarm threats under realistic conditions (real terrain elevation, real sun position and weather, degraded sensors, birds and civilian/friendly drones as false contacts). Scenarios are **scripted or procedurally generated from a seed** with adjustable difficulty, so trainees cannot memorise them. Every trainee action is logged as an event, **scored on the server with an editable decision tree**, and shown in an **After-Action Review (AAR) dashboard** for individuals and units. An AI layer adds adaptive difficulty, LLM-written debriefs, text-to-scenario authoring, and a deliberately imperfect AI-assist panel that measures over-trust. Must run on ordinary unit-level PCs with no special hardware; VR (WebXR) is an optional final add-on.

### PS requirements → where they are met
| PS requirement | Our feature |
|---|---|
| Recognise, classify, respond to drone/swarm threats | Kill-chain gameplay loop (Detect → Track → Identify → Decide → Respond → Assess) |
| Day/night, degraded sensors, urban/rural, single & swarm | Real-DEM terrain presets, suncalc lighting, weather, sensor degradation, boids swarms |
| Desktop or VR-capable, scripted + procedural scenarios | Next.js + React Three Fiber (WebXR later); scenario JSON from scripts or seeded generator |
| Decision-tree scoring on detection time, classification, engagement | Server-side scoring engine with JSON decision tree |
| AAR dashboard, individual/unit performance over sessions | AAR replay + trends + unit view |
| Adjustable difficulty, randomisation against rote learning | Difficulty params + seed randomisation + Elo-based adaptive difficulty |
| Usable at unit level with minimal hardware | Runs in a browser on integrated graphics; offline Docker build |

### What wins (keep this in mind for every decision)
1. The core loop works flawlessly end-to-end in the demo.
2. Realism that an Army officer recognises (identification ambiguity, line-of-sight, night, silent drones, ROE) — **plausible and cited**, not precise.
3. AAR that proves learning happens.
4. Self-explanatory hosted demo (guest mode + guided tour) — judges may only get a link.

---

## 2. Golden rules for Claude Code

1. **Investigate before acting.** Read the relevant code and `docs/SPEC.md` section first. For any new feature or multi-file change, produce a plan (files to touch, approach, risks) and wait for approval before editing.
2. **Iterate, don't rewrite.** Small, focused diffs. Never rewrite a working module wholesale unless asked.
3. **Explain decisions in plain language** — one or two sentences on *why*, especially for tech choices and trade-offs.
4. **Shared schemas are the single source of truth.** All scenario, event, score and API shapes are defined in `packages/shared` (zod) and generated for Python. Never hand-write a duplicate type in `apps/api` or `apps/web`.
5. **Determinism is sacred.** The simulation must give identical results for the same scenario JSON + seed. No `Math.random()`, no `Date.now()` inside `packages/sim-core` — use the seeded RNG and sim clock.
6. **Sim logic stays pure.** `packages/sim-core` has no React, no Three.js, no DOM. Rendering reads sim state; it never mutates it.
7. **Scoring happens on the server.** The client sends events; the API computes scores. Never trust a client-computed score.
8. **No real military system specs, no classified data, no real bases as targets.** Use public commercial-drone specs and textbook physics, label everything "representative", and record every source in `docs/realism-sources.md`.
9. **Engagement responses stay abstract** (monitor / report / EW jam / EW spoof / intercept) with simple effectiveness rules. This is a decision-making trainer, not a weapons simulator.
10. **Ask before adding a dependency.** State what it does and why the existing stack can't do it.
11. **Keep tests green.** Run lint + tests for the packages you touched before saying a task is done. Add tests for every scoring rule and generator change.
12. **Update §14 "Current status"** of this file at the end of every phase or significant feature.
13. **Never silently diverge from the spec.** If the spec looks wrong or a better approach exists, say so, propose the change, and after approval update `docs/SPEC.md` and log it in `docs/decisions.md`.
14. **No unrequested scope.** No extra features or refactors beyond the task; park ideas under "Open ideas" in §14.
15. **UX is a requirement, not polish.** Read `docs/DESIGN.md` before any UI work, follow it exactly, and pass its §13 checklist. No generic AI-looking UI (gradients, glassmorphism, glow, emoji icons, card walls, marketing copy, unstyled shadcn defaults).

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces | `apps/*`, `packages/*` |
| Frontend | Next.js (latest stable, App Router), TypeScript strict | |
| 3D | React Three Fiber + drei, Three.js | Instanced meshes for drones/birds |
| UI | Tailwind + shadcn/ui | Tactical console look per `docs/DESIGN.md`, dark default. **No glassmorphism.** |
| Client state | zustand | One store for HUD/UI; sim state owned by sim-core |
| Schemas | zod → JSON Schema → Pydantic (datamodel-code-generator) | `pnpm gen:schemas` |
| Sim core | Pure TypeScript package, vitest | Fixed 20 Hz tick |
| Charts | Recharts | AAR dashboard |
| Backend | FastAPI, Python 3.12, uv, Pydantic v2 | |
| DB | PostgreSQL (Supabase hosted; local Postgres in Docker) | SQLAlchemy 2 + Alembic |
| Auth | Supabase Auth (JWT verified in FastAPI); `AUTH_MODE=local` fallback for offline | Roles: trainee, instructor, admin |
| AI | Gemini Flash via OpenRouter (env-configurable model) | Structured JSON output, validated with Pydantic |
| Realism tooling | Python: rasterio, numpy, scipy, osmnx (offline scripts); JS: suncalc | Open-Meteo for weather (cached fallback) |
| Testing | vitest (TS), pytest (Py), Playwright (E2E) | |
| Lint/format | ESLint + Prettier (TS), ruff (Py) | |
| Deploy | Vercel (web), Render/Railway (api), Supabase (db/auth), Docker Compose (offline) | |

---

## 4. Repository structure

```
/
├─ CLAUDE.md
├─ docs/
│  ├─ SPEC.md                 # full detailed spec — read before each feature
│  ├─ DESIGN.md               # UX & visual design guide — binding for all UI work
│  ├─ realism-sources.md      # every data source / model / incident inspiration, cited
│  ├─ decisions.md            # short ADR log: date, decision, why
│  └─ plans/                  # approved per-phase / per-part plans
├─ apps/
│  ├─ web/                    # Next.js
│  │  ├─ app/
│  │  │  ├─ (public)/         # landing, login, guest demo, guided tour
│  │  │  ├─ train/            # scenario select, sim player, result screen
│  │  │  ├─ aar/              # session replay, trends
│  │  │  ├─ instructor/       # unit dashboard, scenario builder, assignments
│  │  │  └─ admin/
│  │  ├─ components/
│  │  │  ├─ sim/              # R3F scene: Terrain, Contacts, Sky, Weather, Camera rigs
│  │  │  ├─ hud/              # RadarScope, EoIrView, RfPanel, Spectrogram, ContactList, ActionBar, ReportForm, AiAssist
│  │  │  ├─ aar/              # Timeline, KillChainBreakdown, TrendCharts
│  │  │  └─ ui/               # shadcn components
│  │  ├─ lib/                 # api client, auth, event batcher, hooks
│  │  └─ public/
│  │     ├─ terrain/<preset>/ # heightmap.png, meta.json, buildings.geojson, textures
│  │     ├─ models/           # low-poly glTF (licence noted in docs/realism-sources.md)
│  │     └─ signatures/       # spectrogram templates
│  └─ api/                    # FastAPI
│     ├─ app/
│     │  ├─ main.py
│     │  ├─ core/             # config, db, auth, logging
│     │  ├─ models/           # SQLAlchemy ORM
│     │  ├─ schemas/          # GENERATED Pydantic models (do not edit) + thin wrappers
│     │  ├─ routers/          # auth, scenarios, sessions, aar, ai, units, threats
│     │  ├─ services/
│     │  │  ├─ generator/     # procedural scenario generator
│     │  │  ├─ scoring/       # decision-tree engine + trees/*.json
│     │  │  ├─ analytics/     # AAR aggregates, Elo
│     │  │  └─ ai/            # LLM client, prompts, debrief, text_to_scenario
│     │  └─ seed/             # threat library, scripted scenarios, demo users
│     ├─ alembic/
│     └─ tests/
├─ packages/
│  ├─ shared/                 # zod schemas + enums + constants; exports JSON Schema
│  └─ sim-core/               # deterministic sim: rng, clock, entities, behaviours, sensors, LOS, events
├─ scripts/
│  ├─ terrain/                # build_preset.py (DEM + OSM → heightmap + meta + buildings)
│  └─ signatures/             # gen_spectrograms.py
├─ docker-compose.yml         # offline: postgres + api + web
└─ .github/workflows/ci.yml   # lint + test on PR
```

---

## 5. Architecture (summary — details in SPEC §3)

```
Browser (Next.js)
 ├─ sim-core (20 Hz deterministic tick)  ← scenario JSON (from API)
 │    ├─ contacts: kinematics, behaviours, boids swarms
 │    ├─ sensors: radar / EO-IR / RF / micro-Doppler models + LOS on heightmap
 │    └─ emits SimEvents ─┐
 ├─ R3F renderer (reads sim state, interpolates at 60 fps)
 ├─ HUD (trainee actions → TraineeEvents) ─┤
 └─ Event batcher ─────────────────────────┴─► POST /sessions/{id}/events (every 2 s + on end)

FastAPI
 ├─ generator  → scenario JSON (seeded, difficulty-scaled) → DB
 ├─ scoring    → on session complete: ground truth + event log → decision tree → score breakdown
 ├─ analytics  → AAR aggregates, trends, unit stats, Elo update
 └─ ai         → debrief text, text→scenario, (AI-assist confidence model is client-side, params from scenario)
PostgreSQL ← all of the above
```

**Key data flows**
1. Start session: client requests scenario (scripted id, or generate with difficulty/seed) → API stores scenario + creates session → client loads scenario JSON and terrain preset → sim starts.
2. During session: sim-core and HUD append events to an in-memory log; batcher flushes to API. Client never scores.
3. End session: client posts `complete` → API validates event log (plausibility checks), scores with decision tree, updates Elo, stores score → client shows result screen → optional LLM debrief.
4. AAR: replay = scenario JSON + event log re-run in sim-core (deterministic) with a timeline scrubber.

---

## 6. Conventions

- **Units:** SI everywhere internally — metres, seconds, m/s, degrees only at UI boundaries. Sim time is **ms since session start** (integer).
- **Coordinates:** local ENU metres relative to terrain preset origin. In Three.js: `x = east`, `y = up`, `z = -north` (handled in one helper — `packages/sim-core/src/coords.ts`).
- **IDs:** UUIDv4 strings for DB rows; contact ids inside a scenario are short strings (`c01`, `c02`…).
- **Enums** live only in `packages/shared/src/enums.ts` (UPPER_SNAKE values).
- **TS:** strict mode, no `any`, named exports, functional components, hooks prefixed `use`.
- **Python:** type hints everywhere, ruff clean, routers thin → logic in `services/`.
- **API:** REST, JSON, `/api/v1` prefix, errors as `{error: {code, message}}`.
- **Env:** `.env.example` in each app is the contract; never commit secrets.
- **Commits:** conventional commits (`feat(sim): add radar clutter model`).
- **Decisions:** any non-obvious choice → one entry in `docs/decisions.md`.

---

## 7. Commands (fill in as Phase 0 creates them)

```
pnpm install
pnpm dev                 # web + api concurrently
pnpm gen:schemas         # zod → JSON Schema → Pydantic
pnpm seed                # demo data; ENV=dev re-seeds at API startup when seed files change
pnpm seed:reset-demo     # list non-demo sessions on @demo accounts; --yes deletes them
node packages/sim-core/scripts/export-demo-sessions.ts   # re-record the 42 demo logs after a sim change
pnpm test                # vitest: packages + apps/web unit tests
pnpm lint
cd apps/api && uv run pytest
cd apps/api && uv run alembic upgrade head
pnpm e2e                 # Playwright
pnpm sweep:generator     # generate 50 scenarios per difficulty + sim-core validator (≤ 2 % fail)
pnpm --filter @vyuh/sim-core validate <file|dir> [--max-fail-pct N] [--json]
docker compose up        # offline full stack
```

---

## 8. Phases (summary — full tasks and done-criteria in SPEC §12)

| # | Phase | Outcome |
|---|---|---|
| 0 | Foundations | Monorepo, shared schemas + codegen, API skeleton, DB + migrations, auth, CI |
| 1 | MVP loop | One terrain, one drone type, radar + camera view, detect/classify/respond, events, server score, result screen |
| 2 | Realism core | Real-DEM preset, line-of-sight, suncalc day/night + thermal, sensor models, false contacts, threat library |
| 3 | Generator & scenarios | Seeded generator, behaviour profiles, boids swarms, ROE zones, weather, scripted scenario library |
| 4 | AAR & instructor | Replay, kill-chain breakdown, trends, unit dashboard, assignments |
| 5 | AI layer | Elo adaptive difficulty, LLM debrief, text→scenario, AI-assist + over-trust metric, spectrogram view |
| 6 | Polish & deploy | Perf, guest demo + guided tour, deploy, offline Docker, WebXR (optional), user study, sources doc |

**Rule:** do not start a phase until the previous phase's done-criteria pass.

---

## 9. How a Claude Code session should run

1. **Orient:** read this file, then only the SPEC sections the task needs (see §13 index). Inspect the existing code in the affected folders before proposing anything.
2. **Plan** (required for anything touching more than one file): files to create/change, approach, tests to add, risks, any new dependency with a one-line reason. Wait for explicit approval.
3. **Build in small steps.** After each step, run lint + tests for the touched package. Fix failures before moving on.
4. **When unsure, ask** — don't guess requirements. One focused question beats a wrong implementation.
5. **Close out:** plain-language summary (what changed, how to verify it, follow-ups), update §14 if status changed, add decisions to `docs/decisions.md`.
6. **End of a phase:** check every done-criterion in SPEC §12 with evidence (test name or command output), list tech debt, and stop — do not start the next phase without approval.

---

## 10. Definition of done (every task)

- [ ] Behaviour matches the SPEC section (or the approved divergence is logged).
- [ ] Types come from `packages/shared`; `pnpm gen:schemas` produces no diff.
- [ ] Tests added/updated; `pnpm lint`, `pnpm test`, `uv run pytest` pass.
- [ ] sim-core still deterministic (determinism test passes).
- [ ] No secrets, no real military data, no new unapproved dependency.
- [ ] UI works at 1366×768 and does not drop below the FPS budget (SPEC §16) on integrated graphics, if UI/3D was touched.
- [ ] Everything still works with `LLM_ENABLED=false`, if AI code was touched.
- [ ] UI work passes `docs/DESIGN.md` §13 with screenshots at 1366×768 and 1920×1080 reviewed.
- [ ] Short plain-language summary given.

---

## 11. Environment variables (`.env.example` is the contract)

**apps/web**
| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | FastAPI base URL incl. `/api/v1` |
| `NEXT_PUBLIC_AUTH_MODE` | `supabase` or `local` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth (client-side login only) |
| `NEXT_PUBLIC_GUEST_MODE` | `true` shows "Try demo" |

**apps/api**
| Var | Purpose |
|---|---|
| `ENV` | `dev` / `prod` / `offline` |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_MODE` | `supabase` (JWKS verify) or `local` (HS256 with `LOCAL_JWT_SECRET`) |
| `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_AUDIENCE` | JWT verification |
| `LOCAL_JWT_SECRET` | Offline auth only |
| `CORS_ORIGINS` | Comma-separated web origins |
| `LLM_ENABLED` | `false` disables all LLM calls (templates used) |
| `LLM_PROVIDER`, `LLM_MODEL`, `OPENROUTER_API_KEY` | LLM config |
| `LLM_TIMEOUT_S`, `LLM_RATE_LIMIT_PER_MIN` | LLM safety limits |
| `OPEN_METEO_ENABLED` | Live weather toggle (cached; off in offline) |
| `GUEST_MODE_ENABLED`, `GUEST_TTL_HOURS` | Demo guests and cleanup window |
| `LOG_LEVEL` | `INFO` default |
| `GENERATE_RATE_LIMIT_PER_MIN` | `POST /scenarios/generate` calls per user per minute (default 10) |
| `TERRAIN_DIR` | Terrain presets for the generator (default: repo `apps/web/public/terrain`; Docker image `/app/terrain`) |

---

## 12. Files, git & ownership rules

- **Generated — never hand-edit:** `apps/api/app/schemas/generated/` (every file starts with a `GENERATED FILE — DO NOT EDIT` header) `packages/shared/schema/vyuh.schema.json` and `apps/api/app/seed/generated/class_profiles.json` (from `CLASS_PROFILES`). Change zod in `packages/shared`, then `pnpm gen:schemas` (zod → JSON Schema via `packages/shared/scripts/export-jsonschema.ts` → Pydantic via `apps/api/scripts/gen_pydantic.py`, pinned datamodel-code-generator, no timestamp). CI fails if regenerating produces a diff. Cross-field rules (`superRefine` in zod) are not in JSON Schema and must be re-checked in Python services.
- **Migrations:** a merged Alembic migration is never edited; add a new one.
- **Scoring trees:** a tree version that has scored sessions is immutable; changes create `default_v2` etc. Scores store `tree_version`.
- **Scenario schema:** bump `schema_version` on breaking changes and keep a loader that upgrades old scenario JSON.
- **Raw data:** `scripts/terrain/raw/` is git-ignored. Built presets in `apps/web/public/terrain/` are committed (keep each ≤ ~10 MB).
- **Never commit:** `.env*` (except `.env.example`), API keys, raw DEM tiles, user data.
- **Branches:** `feat/<short-name>`, `fix/<short-name>`; PR into `main`; CI must pass; **rebase-merge** (never squash — every commit lands on `main` individually).
- **Team reality:** one developer builds VYUH; the stream split in SPEC §18 describes ownership areas, not separate people.
- **Ownership:** `packages/shared` has one owner (stream C, SPEC §18). Schema PRs merge first; dependent PRs rebase after.
- **Parallel sessions:** each teammate's Claude Code session stays inside its stream's folders unless the task says otherwise.

---

## 13. SPEC index — where to look

| Working on… | Read |
|---|---|
| Overall scope / priorities | §1, §2 |
| Client sim loop, trust boundary, determinism | §3 |
| Any schema, event, report, scenario JSON | §4 |
| sim-core internals | §5 |
| Radar / EO-IR / RF / spectrogram | §6 |
| Threats, behaviours, difficulty, scripted scenarios | §7 |
| Responses, ROE | §8 |
| Scoring, Elo, over-trust | §9 |
| DB tables | §10 |
| API routes, payloads, errors | §11 |
| Phase tasks + done-criteria | §12 |
| LLM features | §13 |
| Terrain / sun / weather / signatures pipeline | §14 |
| Screens, HUD layout, shortcuts | §15 |
| Any UI, visual design, copy, states | `docs/DESIGN.md` |
| Performance, testing, security | §16 |
| Deployment, costs | §17 |
| Team split | §18 |
| Risks | §19 |
| Judge demo flow | §20 |
| Glossary | §21 |
| Seed & demo data | §22 |
| Open questions | §23 |

---

## 14. Current status (update this)

**Phases**
- [x] 0 Foundations
- [x] 1 MVP loop
- [x] 2 Realism core
- [x] 3 Generator & scenarios (Parts 3.0, 3a and 3b)
- [ ] 4 AAR & instructor
- [ ] 5 AI layer
- [ ] 6 Polish & deploy

- Current phase: **4 — AAR & instructor. Parts 4a and 4b complete; 4b on `feat/phase4b` (2026-10-23), ready for the user to review and merge. Phase 4 done-criteria are met (evidence below); Phase 5 starts only on the user's go-ahead.** Intel integrated-GPU FPS is **still pending — required before the demo and Phase 6**; all FPS evidence so far is AMD. Teammate command (API running, then `cd apps\web; pnpm build; pnpm start`): `$env:E2E_BASE_URL = "http://localhost:3000"; pnpm --filter @vyuh/web exec playwright test e2e/fps.spec.ts --grep '(S13|S14 Mixed Sky at|S06|JK D4 seed 37|PUNJAB D5 seed 6).*@fps$'` (`@fps150$` for 150 % scaling), and for the replay `pnpm --filter @vyuh/web exec playwright test --grep @fps-aar`. Full e2e, FPS and generator sweeps were not run in 4b (user: they run once at the end of Phase 6).
- Last completed: Phase 4 Part 4b (2026-10-23). Assignments (`POST /assignments`, `GET /assignments/mine`, `GET /units`; completed by an Assessment run started after the assignment; training-list badge and Assigned filter); trainee trends `/aar/trends` and unit dashboard `/instructor` over Assessment sessions only (score, components as small multiples, latency, exact classification, kill-chain stage rates, recurring mistakes in plain words, recommended difficulty; every chart a question with a one-line answer; Recharts in token colours; drill-down to trends and any AAR; assign form); scenario builder `/instructor/builder` (form over the generator request, asset and NO_KINETIC zones drawn on the 3b briefing map, live preview with server static checks, saved as AUTHORED `AUT-…`, assignable); scoring weight editor `/instructor/scoring` (weights only, each save an immutable `scoring_trees` row `<base>_w<n>`, migration 0006) and explicit re-score (`POST /sessions/{id}/rescore`, new score row; every read uses the latest row); demo history (42 replayable Assessment sessions from a skill-scaled trainee policy, server-scored, `is_demo`, "Demo data" badge on trends, unit dashboard and demo AARs) and `pnpm seed:reset-demo`. SPEC §10, §11, §12, §22 updated; decisions 120–126. Instructors see all units — a demo shortcut (decision 123). Before that: Phase 4 Part 4a (2026-10-21), per `docs/plans/phase4a-plan.md`; decisions 100–119.
- Phase 4b evidence (2026-10-23 close-out): **done-criterion (SPEC §12 Phase 4) — an instructor assigns a scenario, 3 trainees play it, the unit dashboard compares them and names the weakest stage**: `tests/test_phase4b.py::test_unit_dashboard_leaderboard_weakest_stage_and_completion` (assignment 3 / 3 complete, leaderboard ordered, weakest stage = lowest OK rate); replay exactness is the 4a evidence. Other tests: assignments RBAC, mine and the Assessment-only completion rule; trends Assessment-only and RBAC; weight scaling (`test_reweighted_tree_scales_component_leaves`), versions, re-score writes a new row, reads and trends use it, the original is kept; builder preview, static checks (edge, crossing edges, tiny zone, zone over the asset), save, idempotent id, assignable; builder without overrides equals the generator; demo history real, scored, idempotent, 5 of 6 trainees improving; reset-demo deletes only non-demo @demo sessions; `packages/sim-core/test/demo-sessions.test.ts` (committed demo logs up to date); `apps/web/test/phase4b.test.ts` (answers, badges, Assigned filter). Checks: `pnpm lint` clean; `pnpm test` 48 / 343 / 158; `uv run pytest` 418 (API) + 19 (terrain); `pnpm gen:schemas` no diff. Not run (user, 2026-10-23): `pnpm e2e`, FPS, `pnpm sweep:generator`, `next build`. DESIGN §13 captures at 1366×768 only (user scope) in `apps/web/e2e/checkpoint/` (`checkpoint-4b.spec.ts`): trends (trainee1, after `pnpm seed:reset-demo --yes`), unit dashboard (Alpha), builder (checks passed, and a zone over the asset failing), training list with Assigned badges, scoring weights; reviewed fixes: clipped chart axis, blank builder map, badge overflow at 1366 px, failing zone hidden.
- Phase 4a evidence (2026-10-21 close-out, on the final code): **replay matches the original session exactly** — `packages/sim-core/test/replay.test.ts` (S01–S15 and a generated PUNJAB D5 seed 6: replayed log identical, every keyframe restore equals the straight run, a used sim restored backwards); in Chrome, `e2e/replay.spec.ts` replays Node-recorded S04 and S06 logs with the log check passing (decision 111). **Kill-chain breakdown** — `tests/test_aar.py` (9). **Contact report** — `tests/test_scoring_v4.py` (every sub-score and band, best report per threat, non-threat-only reports, swarm count, timeliness from the mark or first detectable; 18 pinned v1–v3 goldens re-score byte-identical), S04 guard (`library-scenarios.test.ts`, `test_library_sources.py`: reporting log ≥ 6 / 10, silent log 0), e2e R → 1 → Enter in 3 keys, Comms ack 54 ms. **ROE in Assessment** — `hud-derive.test.ts` per mode, `test_sessions.py::test_s06_assessment_roe_attempts_are_scored_once_per_contact` (real S06 log, 10 attempts). Checks: `pnpm lint` clean; `pnpm test` 48 / 339 / 150; `uv run pytest` all pass (API) + 19 (terrain); `pnpm gen:schemas` no diff; `pnpm sweep:generator` **0 / 250** on `GENERATOR_VERSION` 3 (D4 pop-down 15.8 %, D5 28.1 %), CI sweep **0 / 100** (15.4 % / 27.5 %); production `next build` (no `/dev/*` routes); `pnpm e2e` **21 / 21** (3.6 min). Sim tick before / after the dmath port (best of 5, 60 contacts): peaks ≤ 0.33 ms on URBAN, PUNJAB, JK, S06, S10 (decision 111). Production build (AMD Radeon integrated, decision 118): S06 replay 1920×1080 29 / 55 / 46 fps over three runs (first straight after the build), 1366×768 101 fps; JS heap ~62–70 MB for replay and live play alike; Chrome process 700–850 MB (GPU and renderer, not the replay). DESIGN §13 captures at 1366×768 and 1920×1080 in `apps/web/e2e/checkpoint/` (`pnpm --filter @vyuh/web e2e:checkpoint`, `checkpoint-4a.spec.ts`, 12 tests): S01 replay with scrubber and kill chain, S06 ground truth on / off, kill-chain stage, non-threats unfolded, help, fallback, report form, report sent, result penalty links, result with replay unavailable.
- Phase 3b evidence (2026-10-18 close-out, on the final code): **done-criteria (SPEC §12 Phase 3)** — same request + seed ⇒ byte-identical scenario: `test_generator.py::test_same_request_is_byte_identical` (PUNJAB_PLAINS, JK_MOUNTAIN, URBAN_GENERIC × D1–D5); 50 seeds per difficulty valid and playable: `pnpm sweep:generator` **0 / 250 failed** (85 PUNJAB, 85 JK, 80 URBAN; schema, geometry, night flag, detectability, minimum warning, D1–D2 first track, defender wins at D1–D3), CI sweep `--per-difficulty 20` **0 / 100**; pop-down share CI D4 15.4 % / D5 27.5 %, local D4 15.8 % / D5 28.1 %; scripted library of 11 (S01–S10, S15) with guard tests (`library-scenarios.test.ts`, `test_library_sources.py`); briefing screen with map, zones, ROE, assets, weather. Checks: `pnpm lint` clean; `pnpm test` 45 / 267 / 91; `uv run pytest` 299 (API) + 19 (terrain); `pnpm gen:schemas` no diff; production `next build` (`/dev/*` 404); `pnpm e2e` **14 / 14** (2.2 min; visual baselines updated for the training list, briefing and console and matched on a second run; new a11y check that Begin and the mode toggle stay in view while the S06 mission card scrolls). LOS: equivalence with the Phase 2 algorithm on 12,000 rays per preset, exported fixtures byte-identical; URBAN 60-contact tick peak (per-tick best of 5) 0.85 → 0.35 ms, p99 0.56 → 0.20 ms (decision 97). FPS (production build, fixed pixel ratio, headless Chrome, ANGLE D3D11, AMD Radeon integrated / Ryzen 7 5800H, 2026-10-18; fps · p95 ms · draws · k vertices/frame · entities): 1920×1080 — S13 88 · 16.8 · 26 · 385; S14 77 · 16.8 · 50 · 841; **S06 66 · 24.9 · 44 · 1,648**; JK D4 seed 37 55 · 33.7 · 41 · 360 · 26; PUNJAB D5 seed 6 63 · 25.2 · 89 · 873 · 43; JK D5 seed 6 67 · 25.1 · 59 · 378 · 43; PUNJAB D5 at cap 57 · 33.8 · 81 · 872 · 60; JK D5 at cap 60 · 33.2 · 69 · 398 · 60; URBAN D5 seed 2 52 · 25.4 · 103 · 1,413 · 36. 1366×768 — S13 118, S14 107, S06 88, JK D4 117, PUNJAB D5 114, JK D5 114, PUNJAB cap 115, JK cap 119, URBAN D5 111 (p95 8.5–24.5 ms, ≤ 103 draws). All 18 above 30 fps; the 60-bird stress case is dev-only (skipped on production). DESIGN §13 captures at 1366×768 and 1920×1080 in `apps/web/e2e/checkpoint/` (`pnpm --filter @vyuh/web e2e:checkpoint`, 11 tests): training list (plain, filtered), Generate panel (idle, loading, error, rate-limited), briefing S04 / S06 / S05 at 15 m, S06 player (grouped labels, track near a zone, hovered town label), S06 PPI before / after the label-priority change.
- Phase 3a evidence (2026-10-16 close-out, on 45bad8d): same request + seed ⇒ byte-identical JSON — `test_generator.py::test_same_request_is_byte_identical` (both presets × D1–D5), `test_failing_group_is_regenerated_deterministically`; sweeps `node scripts/generator/sweep.ts --per-difficulty 20` **0 / 100 failed** and `pnpm sweep:generator` **0 / 250 failed** (limit 2 %; schema, geometry, night flag, detectability, minimum warning, D1–D2 first track, defender wins at D1–D3); pop-down clutter entry on final approach CI D4 17 / 117 (14.5 %), D5 80 / 280 (28.6 %), local D4 43 / 285 (15.1 %), D5 189 / 680 (27.8 %) — `test_popdown_share_floor_and_shape`, `test_fast_classes_stay_above_clutter_unless_popping_down`. FPS (production build, headless Chrome, ANGLE D3D11, AMD Radeon integrated, 1920×1080, rerun 2026-10-16): S13 103, S14 88, generated JK D4 seed 37 75 (p95 24.8 ms, 44 draws, 26 entities, 14 tracks), PUNJAB D5 seed 6 83 (66 draws, 43 entities, 30 tracks); the full 16-case matrix (both 60-entity-cap cases, 1366×768) was run at Step 12 (45bad8d) — reported by the user as passing; the close-out rerun was stopped after 4 cases. All measured cases are above the 30 fps budget. `pnpm lint`, `pnpm test` (42/234/69), `uv run pytest` (273), `pnpm gen:schemas` no diff, `next build`; `pnpm e2e` 13 / 13 passed (1.6 min) on the close-out code, run by the user 2026-10-16 (a11y, smoke, visual at 1366×768 and 1920×1080).
- Phase 3.0 evidence: `pnpm e2e` 13/13 — `visual.spec.ts` (11 baselines per viewport at 1366×768 and 1920×1080, stable on re-run), `a11y.spec.ts` (no horizontal scroll on 6 screens at 1366×768; all three effectors visible in the action bar with no scroll at 1366×768 and 1920×1080 — compact effector strip; keyboard-only core actions; Comms ack 3–8 ms measured against 100 ms; deuteranopia / protanopia captures reviewed — affiliation reads by frame shape + letter). FPS (`e2e:fps`, headless Chrome, ANGLE D3D11, AMD Radeon integrated / Ryzen 7 5800H): production build S13 96 / S14 99 fps at 1920×1080, 119 / 119 at 1366×768; dev server 60-bird stress 45 fps at 1920×1080 (was 27 before the stalk fix) and 63 at 1366×768. Production build: no `/dev/*` routes (404), `__vyuhE2E` / `__vyuhHero` in no client or server chunk (only the original source text inside a server source map) and absent from `window` in a production session. API: `test_recommendation.py`, trainee list hides S11–S14 (`test_scenarios.py`), golden v1 re-score ignores only `trueClass` / `recommendedDifficulty` / `recommendationBasis`. `pnpm lint`, `pnpm test` (40/182/58), `uv run pytest` (185), `pnpm gen:schemas` no diff, `next build`.
- Completed before: Phase 2 Part B (2026-10-14, merged), per `docs/plans/phase2b-plan.md` plus step 4b. Display-only seeder rule; `ScenarioListItem` gains preset/date/time and the list computes `isNight`; `SIM_VERSION` (2) stored in `sessions.sim_version`; generated `class_profiles.json` → `threat_types` seed; radar clutter + rain (SNR loss) and a 2D α-β track filter with per-tick prediction; EO video auto-track (MANUAL / CUE / TRACK); RF detector (strobes + track badge, offset from radar ticks); contact control modes, link-loss reactions and boids bird flocks; EW_JAM / EW_SPOOF (±10° sector, collateral list, not ROE-gated); per-class instanced meshes; APP-6 frames; RF tab, PPI strobes, Jam/Spoof (J/S); `default_v2` scoring tree (EW leaves, UNAVOIDABLE decision-only, FRIENDLY_JAMMED −15, CIVILIAN_JAMMED −5, per-component denominators); S13 Silent Ridge / S14 Mixed Sky test scenarios; EW on a bird listed with 0 points. Decisions 46–57.
- Phase 2B evidence (done-criteria, SPEC §12): **FPV invisible to RF + birds create radar tracks at night** — `packages/sim-core/test/phase2b-scenarios.test.ts` (S13: computed night, FPV `FIBRE_OPTIC` never strobed, ≥ 3 bird tracks, FPV first tracked > 120 s after spawn and < 1.6 km out, ≥ 45 s warning); **engaging the friendly is penalised** — `apps/api/tests/test_sessions.py::test_s14_engaging_the_friendly_is_penalised` (real S14 logs through the API: jam → `FRIENDLY_JAMMED` −15, intercept → `FRATRICIDE` −40, `default_v2`), plus `test_scoring.py` v2 leaf cases; **v1 unchanged** — `test_v1_golden_cases_rescore_identically` and a local-DB re-score of all 3 stored `default_v1` scores (28.8 / 60 / 100, full JSON equal); **sources logged** — `docs/realism-sources.md`. Other tests: `radar-filter.test.ts`, `eo-track.test.ts` (TRACK keeps the target in a 1.5° frame on 100 % of TRACK ticks in S11/S12/S01), `rf.test.ts`, `behaviours.test.ts`, `ew.test.ts`, `scripted-scenarios.test.ts` (all 7 scenarios pass the guard). Browser (headless Chrome, ANGLE D3D11 on AMD Radeon integrated / Ryzen 7 5800H): FPS 1920×1000 S13 94–117, S14 78–91, 60-bird stress 54–66 (111 draw calls max; S14 49); 1366×768 S14 100–115 with layout usable. Sim tick: bench (60 contacts, JK) mean 0.03 ms, max 0.39 ms; 60 flocking birds + RF on PUNJAB_PLAINS mean 0.09 ms, p99 0.88 ms, max 1.7 ms (quiet machine). `pnpm lint`, `pnpm test` (40/175/21), `uv run pytest` (174), `pnpm gen:schemas` no diff, `next build`.
- Completed before: Phase 2 Part A (2026-10-14). `scripts/terrain/build_preset.py` (own uv project + CI job) → PUNJAB_PLAINS and JK_MOUNTAIN presets from Copernicus GLO-30 (`heightmap.u16` + meta + OSM buildings); sim-core `World` (buildings grid, LOS, MSL waypoints), radar LOS masking with `LOS` lost-reason, suncalc sun/`isNight`, EO/IR Johnson model + `EO_IDENTIFIABLE` + camera lock/mode as sim state; web lazy preset loading, chunked LOD terrain, merged buildings, sun/night/fog environment, single canvas with EO/IR render target + white-hot shader, `T` shortcut; S11 Ridge Line / S12 Night Watch test scenarios; API `identifiableWhenClassified` keyed on EO sensor.
- Phase 2A evidence: `packages/sim-core/test/phase2a-scenarios.test.ts` (S11 track lost with reason LOS then re-acquired; S12 day camera never identifies, IR does; exact replay over JK terrain); `terrain-los.test.ts` (sampling, u16 decode, LOS open/hill/building, radar masking draws, committed presets valid); `sun-eo.test.ts` (Johnson thresholds at known ranges, visibility cap, night/IR, frustum, hysteresis, lock follow, replay with lock + IR); `scripts/terrain` pytest (16). Browser (headless Chrome, AMD Radeon integrated / Ryzen 7 5800H, 1920×1000): S11 T001 lost behind the spur at 0:48 and re-acquired as T002 at 1.7 km; FPS S01 89, S11 81 tactical / 86–89 with EO zoomed and IR, S12 76–91. Sim tick bench (60 contacts, JK): mean 0.03 ms, p99 0.17 ms, max 0.5 ms. `pnpm lint`, `pnpm test` (37/106/19), `uv run pytest` (122, last run at f5585a5 — no API change since), `pnpm gen:schemas` no diff, `next build`.
- Known issues: the old pre-move container `sih-2026-postgres-1` (from the OneDrive copy) holds port 5432, so `docker compose up` from this repo fails until it is stopped. It has the same DBs and credentials, and is in use for now. Web auth guard is client-side only (tech debt, decision 9).
- Tech debt (Phase 2A): the S12 close-range IR view was not re-checked in the browser after the night-map change. (Closed 2026-10-15: JK_MOUNTAIN now has its 36 OSM buildings, decision 78. Fixed in 2B: EO lock now hands over to an EO tracker; the scenario list computes `isNight`. Closed: the "S01 mis-encoded dash" was a Windows console display artefact, not a data bug — decision 46.)
- Tech debt (Phase 4b): **instructor scope is all units** (demo shortcut, decision 123; restrict to own unit before real use); trends and the unit dashboard recompute every session's kill chain per request (fine for ~50 sessions, cache or store it before large units); `e2e@demo` (a visual-baseline account in Demo Unit Alpha) appears on Alpha's leaderboard; re-scored feedback strings keep the built-in "/10" wording; the builder's Instructor note and zone names are not shown on the briefing map legend; no 1920×1080 captures or Playwright e2e for the 4b screens yet; the demo logs must be re-recorded after any sim or scripted-scenario change (the sim-core test fails until then).
- Tech debt (Phase 4a): **S06 replay at 1920×1080 ran near the 30 fps budget** (29–55 fps on AMD integrated against 59 live, decision 118); follow-up 2026-10-21 made track rows, the marker strip and the kill chain re-render only on change and the EO pointing update only when the camera moves — **not re-measured yet** (run `@fps-aar` on a production build); the per-frame DOM truth labels are unchanged; the no-kinetic violation feedback names the zone only when the scenario has one (the logged outcome does not say which); seed data changes need `pnpm seed` outside `ENV=dev` (dev re-seeds at startup, decision 119); `next build` spends ~10 min in TypeScript on this machine; Assessment sessions on scenarios still on v1–v3 trees now allow ROE-violating attempts without a penalty (the sim still blocks them).
- Tech debt (Phase 3b): **reduce per-tick allocations if lab-PC CPUs show tick overruns** (single-run tick maxima of 0.6–1.3 ms on URBAN are V8 scavenges of 0.3–1.5 ms, not LOS — decision 97); on the S05 briefing map the interceptor ring label touches zone Z2; CI does not run the generator sweep on all three presets at 50 per difficulty (local only).
- Tech debt (Phase 3a): the generate rate limit is in-memory (single API process); D5 lowest threats usually fly at 11–15 m outside pop-downs (decision 81); the D4 pop-down floor (10 m) is below the table's 15 m (decision 83); FPS on a production build runs on the wall clock, so each case takes ~80 s. (Closed in 3b: the JK D4 seed 37 slowdown was GPU headroom — decision 85.)
- Tech debt (Phase 3.0): **CI does not run the visual diffs** (baselines are Windows-rendered, local-only — `apps/web/e2e/README.md`); drei `<Html>` track labels may log "synchronously unmount a root" errors in dev (zone labels moved to plain DOM, decision 84; none seen in the 2026-10-16 probe); Comms shows only ~6 lines at 768 px height; uvicorn `--reload` does not pick up changes on Windows (restart the API by hand); the 60-bird stress FPS case runs only on the dev hero route, so its numbers are dev-mode (worst case); three.js logs a `THREE.Clock` deprecation warning (R3F internals).
- Tech debt (Phase 2B): on PUNJAB_PLAINS (buildings) a 60-contact radar scan tick costs ~0.9 ms (budget 2 ms — watch it as presets grow); the scripted guard player engages every in-range track, non-threats included (test helper only); RF and EW are not yet in the procedural generator (Phase 3); RF-only contacts are unactionable by design (decision 53).
- Tech debt (Phase 1): unsent event batches are kept in memory only (no `sessionStorage` yet); a reloaded mid-run session cannot be resumed; Elo update deferred to Phase 5 (decision 28).
- Open decisions:
- Open ideas (parked, not approved):
  - Live weather via Open-Meteo behind `OPEN_METEO_ENABLED` (cached, preset fallback) — Phase 6; skipped in 3a (no `httpx` runtime dependency).
  - Act on RF strobes (jam along a bearing) and EO-initiated tracks — RF-only contacts are currently unactionable by design (Phase 2B plan, rule 2).
  - Sun glare in the EO view (S09 puts one swarm axis on the sun's bearing; glare is not modelled).

---

## 15. UX & visual design (summary — full guide in docs/DESIGN.md)

- **Intent:** a calm, dense, precise tactical console; colour means something; every number has a unit; every action gets an immediate answer.
- **Banned patterns:** see DESIGN.md §2. If one appears, it is a bug.
- **Colour is information.** Monochrome chrome; colour only for affiliation, status and the single cue accent. Tokens only (CSS variables mapped into Tailwind); no raw hex in components.
- **Type:** IBM Plex Sans Condensed (labels, UPPERCASE), IBM Plex Sans (body), IBM Plex Mono (all numbers, tabular, with muted units). Sizes only from the DESIGN.md §4 scale.
- **Shape:** panels with header strips, 1 px hairlines, radius 2 px, no shadows except overlays, no glow.
- **Feedback:** every trainee action acknowledged within 100 ms in the Comms log; disabled controls explain why; labelled loading; worded empty and error states.
- **Copy:** military brevity, consistent vocabulary (contact vs track, bearing, range, ROE, effector); no marketing language, no exclamation marks.
- **Access:** works at 1366×768 without horizontal scroll; full keyboard control; affiliation readable without colour (shape + letter).
- **Proof:** Playwright screenshots at 1366×768 and 1920×1080 for every changed screen, reviewed against DESIGN.md §13; the `/dev/ui` gallery shows every primitive and state.
