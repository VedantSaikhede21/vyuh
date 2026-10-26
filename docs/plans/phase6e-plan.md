# Phase 6E plan — guest demo, guided tour, onboarding

> Approved by the user 2026-10-26 ("next"). Requirements: `docs/plans/phase6-requirements.md` §8; audit P0-1, P0-2, P0-5 (tour), decision 123 debt.

## Starting point

`/demo` and "Start the demo" (6C) call `POST /auth/guest`, which does not exist. `users.is_guest`, `GUEST_MODE_ENABLED`, `GUEST_TTL_HOURS` exist unused. Only S01 and S02 are tagged `demo`. Instructors see every unit (decision 123). Demo trainees and their history are seeded only with `AUTH_MODE=local`.

## Items, in order

| # | What |
|---|---|
| E1 | Instructors scoped to their own unit; admins see all (closes decision 123). Unit list, dashboard, readiness, live sessions, assignments, remarks, sign-offs, other users' trends / AAR / record. |
| E2 | `GUEST` role in `UserRole` (shared → `gen:schemas`), migration 0008 (`users.role` enum value if needed, `units.is_demo`; Alpha / Bravo marked). Route-by-route guest audit; RBAC test matrix. |
| E3 | `POST /auth/guest` — 404 unless `GUEST_MODE_ENABLED`; guest user (no email, "Guest 4F2A"); HS256 token, issuer `vyuh-guest`, TTL `GUEST_TTL_HOURS`, accepted in both auth modes. Limits: creation 5 / h per IP, 200 active guests; per guest sessions 30 / h, generate / from-text 3 / h; `RATE_LIMITED`. |
| E4 | Guest data: `demo` tag on S01, S02, S06, S15; a guest sees those plus its own from-text scenario; no free generate, builder, weights, assignments, remarks, sign-offs. Cleanup of expired guests on guest creation, API startup and `pnpm guests:cleanup` (own generated scenarios first, then the user — sessions cascade). |
| E5 | Read-only unit view for guests on demo units / demo sessions (dashboard, trends, AAR); staff actions replaced by a one-line reason. Demo trainees and history seeded in every auth mode (data only in Supabase mode). |
| E6 | Guest text-to-scenario: one preset prompt through the real LLM path within limits; on LLM off / failure a fixed parse labelled TEMPLATE; generate only from that parse; result owned by the guest. |
| E7 | Guest demo path strip (StageStrip): Tour → S15 → Result → Replay → Unit → From text → Sources, done marks and one Next link; guest nav; GUEST role chip. |
| E8 | In-house guided tour: spotlight + step card on the side with room, never over its target; Enter / → next, ← back, Esc skip; resumable (`localStorage`); holds the Practice clock (`setOverlayHold`); reduced motion jumps. Player tour 7 steps (tactical view, radar, EO/IR, track list, actions, report, AI assist); result and AAR 3–4 steps. Auto for guests, from Help for everyone. |
| E9 | First run for real trainees: welcome on Home with no sessions, "Start S01 tutorial", tour offer. |
| E10 | Checkpoint E: `checkpoint-6e.spec.ts` records the guest judge path with timings (first radar track ≤ 2 min, whole path ≈ 5 min) plus captures at 1366×768 and 1920×1080. Stop for OK. |

## Decisions to log

Guest as a role, not a flag; guest tokens signed by the API in both modes; `units.is_demo` rather than names; demo history in every auth mode; lazy cleanup instead of a scheduler (hosted API may sleep). SPEC §10, §11, §20, §22 updated.

## Tests

RBAC matrix (guest × every route), guest token in both modes, cleanup, rate limits, instructor scoping, preset from-text with the LLM off; web unit tests for tour placement and demo-path progress.

## Risks

E1 changes what `instructor@demo` sees (no Bravo). Demo history in Supabase mode adds ~42 sessions to the hosted DB (idempotent). The tour must not cover controls at 1366×768 — a capture per step.
