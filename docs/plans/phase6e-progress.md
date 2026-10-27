# Phase 6E progress — guest demo, guided tour, onboarding

Plan: `docs/plans/phase6e-plan.md` (approved 2026-10-26, "next"). Decisions 160, 161.

## Done (all on `main`, pushed)

| Item | Commit | What |
|---|---|---|
| Plan | `docs(plans): Phase 6E plan` | saved |
| E1 | `7c1cb4d` | Instructors see their own unit only, admins all (`app/services/access.py`; decision 160). `staff_for(subject)` test fixture; `tests/test_access.py` |
| E2–E5 (API) | `3e8ad4b` | `UserRole.GUEST` (shared enum + `gen:schemas`), migration **0008** (role CHECK + `units.is_demo`, seeder marks the two demo units), `POST /auth/guest` (404 unless `GUEST_MODE_ENABLED`; HS256 token issuer `vyuh-guest` signed with `LOCAL_JWT_SECRET` in either auth mode), guest sees scenarios tagged `demo` (S01, S02, S06, S15) + own generated, limits (5 / h per address, 200 alive, 30 sessions / h), cleanup of expired guests (new guest, API startup, `pnpm guests:cleanup`), `ViewerUser` for read-only unit views (dashboard, unit list; readiness stays staff), demo users + history seeded in every auth mode (decision 161). `tests/test_guests.py` |
| E6 (API) | `4a17133` | Guest text-to-scenario: only `DEMO_FROM_TEXT` ("Night swarm of 8 from the north with 2 decoys, hard", in `packages/shared/src/ai.ts`, mirrored in `from_text.py` with a test); LLM path or stored reading labelled `source: TEMPLATE`; generate only with the preset seed; 3 AI calls / h per guest (`GUEST_AI_PER_HOUR`) |
| E5–E7 (web) | `910edef` | Role-based nav (`roles` per item; guest: Training, Library, After-action, Unit, From text; guest lands on /train); read-only unit page for guests; guest From-text page; guest Training (no free generator, S15 hint); demo path strip (`lib/demo-path.ts`, `components/demo-path.tsx`) |
| E8–E9 (web) | `8a0f454` | Guided tours (`lib/tour.ts`, `components/tour/guided-tour.tsx`): player (7 steps, `data-tour` anchors), result (3), AAR (4); auto for guests, "Show the console tours again" on Help, "With the console tour" on Home first run; holds the Practice clock (`ui-store.tour`), pauses replay (`controller.pause()`), Enter / → / ← / Esc, resumable |

Checks at the last commit: API pytest all pass; web `tsc`, eslint, prettier clean; web vitest 27 files / 238 tests (`test/phase6e.test.ts`).

## Checkpoint E run (2026-10-27)

`checkpoint-6e.spec.ts` green: 1366×768 judge path (1.6 min) and 1920×1080 pass (1.2 min), one worker. Judge path from opening the landing URL, dev server: guest + training list 24 s (6.5 s with `/demo` already compiled), S15 briefing 26 s, player 37 s, tour done 41 s, first radar track 48 s, result 50 s (run fast-forwarded after the first track), replay 58 s, unit view 66 s, from text parsed 73 s, generated briefing 75 s, sources / path complete 80 s.

Fixed from the captures:
- `/demo` outline list used `data-testid="demo-path"`, the strip's id → renamed `demo-outline` (6C spec updated).
- Outline listed different steps from the strip (tour, trends, no Sources) → now the strip's six steps in its words.
- Done message overlapped step 06 at 1366 px → "Path complete" (deletion note as title; it is on `/demo`).
- Guest "My generated" empty state said "Use Generate" (guests have no Generator) → "Build one in From text".
- Spec: wait for `/demo` and for the debrief URL after "Back to debrief" (a click lost on the starved dev server once); wait for hydration before "Start the demo" in the 1920 pass.

Run notes: two workers at once crashed a Next compile (`Unexpected end of JSON input`, 500 on `/instructor`) — one worker only. Each run makes a guest; locally raise `GUEST_CREATE_PER_HOUR` (default 5) for repeated runs. Looked at and left: tour cards cover non-target controls (by design, the rest is dimmed); PPI labels overlap where tracks are close (pre-existing).

## Close-out (2026-10-27)

Checkpoint E approved by the user ("next"). `pnpm e2e` **23 / 23** (2.7 min) on a Turbopack dev server (`npx next dev` in apps/web, API with the normal `.env`); no visual baseline changed, so none were regenerated. On `next dev --webpack` the trainee keyboard test failed twice with a ChunkLoadError on `app/layout.js` — use Turbopack for e2e. SPEC §10, §11, §12, §20, §22 and CLAUDE.md §14 updated. **Part 6E closed.**

## History

1. **E10 Checkpoint E** — run and fixed (above), approved. Commands used:
   - API: `cd apps/api && GUEST_MODE_ENABLED=true LLM_ENABLED=false uv run uvicorn app.main:create_app --factory --port 8000` (LLM off to save OpenRouter credit; debrief and from-text show their TEMPLATE path)
   - Web (dev server, for the `__vyuhE2E` hook): `cd apps/web && NEXT_PUBLIC_GUEST_MODE=true npx next dev --webpack --port 3000` (Turbopack aborted with exit 134 under memory pressure)
   - Run: `cd apps/web && E2E_SKIP_DEMO_RESET=1 npx playwright test e2e/checkpoint-6e.spec.ts`
   - Then review captures in `apps/web/e2e/checkpoint/6e/`, fix anything the tour covers, and show the user (Checkpoint E needs the user's OK).
2. After approval: regenerate visual baselines for changed screens (training list, result, unit dashboard for staff may be unchanged), full `pnpm e2e`, update SPEC §10 (`units.is_demo`, GUEST role), §11 (`POST /auth/guest` details), §20, §22; CLAUDE.md §14 status; close 6E.
3. Still open from 6D: full `pnpm e2e` never went green (memory pressure from other workloads, see `phase6d-progress.md`); FPS after-run moved to 6F.

## Machine notes (2026-10-26)

- Only ~650–870 MB RAM free while `D:\Portfolio` Vite servers run; that killed the Next dev server and Turbopack. Close other workloads before e2e / checkpoints.
- The user's `pnpm dev` was stopped for the 6D FPS run and not restarted.
- `npx` once failed with "Could not determine Node.js install directory" (transient).
- `pnpm seed` was run after the tag change (S06 / S15 now tagged `demo` in the local DB); migration 0008 is applied locally.
