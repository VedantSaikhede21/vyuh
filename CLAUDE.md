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

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces | `apps/*`, `packages/*` |
| Frontend | Next.js (latest stable, App Router), TypeScript strict | |
| 3D | React Three Fiber + drei, Three.js | Instanced meshes for drones/birds |
| UI | Tailwind + shadcn/ui | Futuristic military-HUD look, dark default. **No glassmorphism.** |
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
│  ├─ realism-sources.md      # every data source / model / incident inspiration, cited
│  └─ decisions.md            # short ADR log: date, decision, why
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
pnpm test                # vitest across packages
pnpm lint
cd apps/api && uv run pytest
cd apps/api && uv run alembic upgrade head
pnpm e2e                 # Playwright
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

---

## 12. Files, git & ownership rules

- **Generated — never hand-edit:** `apps/api/app/schemas/generated/` (every file starts with a `GENERATED FILE — DO NOT EDIT` header) and `packages/shared/schema/vyuh.schema.json`. Change zod in `packages/shared`, then `pnpm gen:schemas` (zod → JSON Schema via `packages/shared/scripts/export-jsonschema.ts` → Pydantic via `apps/api/scripts/gen_pydantic.py`, pinned datamodel-code-generator, no timestamp). CI fails if regenerating produces a diff. Cross-field rules (`superRefine` in zod) are not in JSON Schema and must be re-checked in Python services.
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
- [ ] 1 MVP loop
- [ ] 2 Realism core
- [ ] 3 Generator & scenarios
- [ ] 4 AAR & instructor
- [ ] 5 AI layer
- [ ] 6 Polish & deploy

- Current phase: **1 — MVP loop: planning (branch `feat/phase1-mvp-loop`)**
- Last completed: Phase 0 Foundations (merged 2026-10-14, PR #1, CI green) — shared schemas + codegen, sim-core RNG, API skeleton (auth, RBAC, migrations, seed), web (login, /train), CI workflow. Verified: `pnpm lint`, `pnpm test` (38), `uv run pytest` (40), `pnpm gen:schemas` no diff, `next build`, `pnpm dev` + dev-login → `/auth/me`.
- Next up: Phase 1 plan → approval → build
- Known issues: the old pre-move container `sih-2026-postgres-1` (from the OneDrive copy) holds port 5432, so `docker compose up` from this repo fails until it is stopped. It has the same DBs and credentials, and is in use for now. Web auth guard is client-side only (tech debt, decision 9).
- Open decisions:
- Open ideas (parked, not approved):
