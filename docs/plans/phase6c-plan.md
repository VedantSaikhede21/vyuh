# Phase 6C — New pages and public pages (approved plan)

> Part 6C of `docs/plans/phase6-requirements.md` §6. Approved by the user 2026-10-25 with the changes marked **(user)**. Progress: `docs/plans/phase6c-progress.md`.

## Workflow (user)

Solo workflow (decision 153): commit straight to `main`, push to `origin/main` after each completed group of commits (at minimum after every progress-file update) so work is backed up and CI runs. If CI goes red, fix it before continuing. CLAUDE.md §12 and requirements §0 updated.

## 0. Housekeeping

- **Flaky sim-core test.** `building-los-index.test.ts`: the URBAN ray-equivalence cases take 6.3 / 3.5 / 3.5 s idle (30 s limits); `edge bands … pointInRing` (2.2 s) and `library-scenarios S10` (1.4 s) run on the default 5 s, which breaks under load. Fix: collect mismatches and assert once per test (no ~25 k `expect` calls in loops); `testTimeout: 20_000` in the sim-core vitest config as a hang ceiling. Proof: three full `pnpm test` runs with the dev servers up.

## 1. Schemas, DB, API (shared zod → `pnpm gen:schemas`)

- Migration 0007: `level_signoffs` (user, level, ruleset, signed_by, criteria snapshot, unique user + level), `session_remarks` (session, author, body ≤ 500), `users.notices_seen_at`.
- Routes: `GET /home` (trainee aggregate); `GET /record/{userId}` (self / staff), `POST /record/{userId}/signoffs` (staff); `GET /notices`, `POST /notices/seen`; `POST /aar/sessions/{id}/remarks` (staff; `AarSessionResponse.remarks`); `GET /scoring/summary` (any; weights and penalties read from the built-in tree files); `GET /status` (public, minimal — below); `GET /units/{id}/readiness` (staff); `GET /sessions/active?unit=` (staff, ACTIVE with a batch in the last 60 s).
- **`/status` (user):** public and minimal — per component `ok` / `down` (API, database, LLM on / off) and versions (web, API, `SIM_VERSION`, `GENERATOR_VERSION`, terrain revisions). No hostnames, database names, model ids or error text. A pytest checks the response contains only the allowed keys.
- `CONFUSABLE` moves from the Python generator to `packages/shared`, generated for Python like `class_profiles.json` (same order; byte-identical generator tests prove no change).

## 2. New signed-in pages

1. **Threat library** `/library`, `/library/[class]`: filter Threat / Non-threat / Friendly; silhouette, size, RCS, speed, links, RF behaviour, ID cues, often confused with. Numbers from `CLASS_PROFILES`, prose in a typed `Record<ContactClass, …>`; "Representative values". Opened as a dialog from the player track list (`L` for the selected track; holds the Practice clock) and from AAR rows.
2. **Notices** `/notices`: assignments, instructor remarks, sign-offs, library updates (dated changelog in shared); unread count in the top bar.
3. **Remarks**: staff add one from an AAR "Remarks" tab; the trainee sees it there and as a notice.
4. **Help & controls** `/help`: shortcuts, glossary (test: matches SPEC §21), "How scoring works" with current weights from `/scoring/summary`. User menu links to it; the player keeps `?`.
5. **Settings** `/settings`: reduced motion (follow system / reduce → `data-motion` on `<html>`), "Show the shortcut list when a Practice run starts"; `localStorage` with try/catch. No sound setting (no sound exists).
6. **Status** `/status` (public; footer and Help link).
7. **Service record** `/record` (`?user=` for staff): levels, criteria with current figures, endorsements linked to the earning session, staff sign-off, light print stylesheet (`@media print`).
8. **Operator home** `/home`: next assignment + due date + one primary action; "Where am I losing points?" kill-chain bars (share of threat contacts not OK per stage, Assessment only); notices; recent sessions with Replay; next level's criteria; first-run welcome pointing to S01. Trainees land here after login; staff land on Unit.
9. **Instructor extras**: Unit gains a Dashboard · Readiness · Live strip. Readiness: trainee, level, last assessment, weakest stage, overdue assignments. Live: read-only, 10 s poll; trainee, scenario, mode, sim time, last batch (no live score — scoring stays on the server).

Shell: Home, Threat library, Service record appear in the nav (Home and Service record for trainees); user menu gains Settings; Help becomes the page.

## 3. 6B tech debt

- Unit dashboard tables use the 6A `Table` / `Th` / `Td` / `Tr`; every new page's tables too.
- Recent sessions: one tab stop per row (the trainee name becomes plain text; trends stay on the leaderboard row).

## 4. Public pages

- Skills: `industrial-brutalist-ui` (Swiss Print only), `design-taste-frontend` (our palette, fonts, copy).
- **Landing:** macro-type hero ("DETECT. IDENTIFY. DECIDE.") beside the real replay loop with a telemetry strip (values written by the recorder); `SHEET 0n / 06` framing; kill-chain `StageStrip` with fixed crop frames; realism as a ruled table with a sources column; measurement with a real result / AAR capture and a DEMO DATA badge; deployability; factual footer.
- **Deployability (user):** only claims true today. The offline build is left out entirely until 6G adds it; no "planned" wording on public pages.
- **"Try the demo"** behind `NEXT_PUBLIC_GUEST_MODE`: landing primary, "Try the demo instead" on login, `/demo` guest entry (what you see, ~5 min, no account, data removed after the guest window) calling `auth.loginGuest()` (endpoint in 6E). Flag off: hidden, `/demo` is a 404.
- **Login:** same system; local dropdown worded for offline units; no "ENV=prod" (P1-9).
- **Sources:** ruled table per topic (what · model / dataset · source · licence); `realism-sources.md` stays canonical, shown under a collapsed "Technical notes"; a test checks each table source appears in the md.
- `mobile-native`: 360–1920 px, no horizontal scroll, ≥ 44 px targets, inline muted video, reworked public header (wordmark · Sources · Status · Sign in).
- **Landing re-record** last, after every 6C UI change. Respond crop: the recorder captures Comms after intercept → miss → re-order → kill and writes the captured lines into `manifest.json`; alt text and caption are built from the manifest (unit test). FPS / deployability facts from the latest measured runs only.

## 5. Stress, checkpoint, close-out

- `break-ui` on every new page (`@breakui` response rewrites); report `docs/plans/phase6c-break-ui.md`.
- **Checkpoint C** (`checkpoint-6c.spec.ts`): every new page and state at 1366×768 and 1920×1080; public pages (landing, login, `/demo` with the flag on, sources, status) also at 390×844. Wait for OK.
- After OK: regenerate and review baselines for changed screens; lint, unit tests, pytest, `gen:schemas` no diff; SPEC §9.7 / §10 / §11, CLAUDE.md §14, decisions; stop.

**Tests.** pytest: every level and endorsement rule, lock order, Review due, sign-off RBAC / criteria-met guard / no self sign-off, notices and unread count, remarks RBAC, home, scoring summary from the tree, status allowed keys, readiness, active sessions, generator byte-identical after the `CONFUSABLE` move. vitest: library covers every class, glossary vs SPEC §21, settings storage, nav per role, landing manifest captions.

**Risks.** Large Part → small commits. Additive migration. `CONFUSABLE` move touches generator input (byte-identical tests). Demo sign-offs and a demo remark change demo data; unit / trends baselines reviewed at close-out. **No new dependencies.** Skill advice DESIGN §2 bans is skipped.

---

## SPEC §9.7 — representative training levels (`record_v1`, approved)

> On screen and in the SPEC: **"Representative training levels. Not official qualifications."** Server-side, **Assessment sessions only**, each session's latest score row and kill chain.

**Window** = the trainee's most recent N completed Assessment sessions at or above the difficulty floor. **Stage OK rate** = OK ÷ (all statuses except NOT_APPLICABLE) over threat contacts in the window.

| Level | Requires | Criteria (all) | Sign-off |
|---|---|---|---|
| 1 Basic operator | — | 3+ Assessment sessions; Detect OK ≥ 70 % over the last 3; no FRATRICIDE in the last 3 | instructor / admin |
| 2 Sensor operator | L1 qualified | 3+ sessions at D2+; Identify OK ≥ 70 % over the last 5 at D2+; mean detection latency ≤ 15 s over those; 1+ night session with total ≥ 60 | instructor / admin |
| 3 Engagement controller | L2 qualified | 3+ sessions at D3+ with total ≥ 70; Decide OK ≥ 75 % and Respond OK ≥ 75 % over the last 5 at D3+; no FRATRICIDE, WRONGLY_ENGAGED or ROE / no-kinetic attempt in those 5; contact report ≥ 60 % of its points over those 5 (report-scoring trees) | instructor / admin |
| 4 Instructor | L3 qualified | 10+ Assessment sessions; 2+ at D4+ with total ≥ 75; rating ≥ 1300 | admin only |

- **LOCKED** — previous level not qualified. **IN PROGRESS** — criteria shown with current figures; all met → "Criteria met · awaiting sign-off". **QUALIFIED** — met and signed.
- Sign-off only while the criteria are met (snapshot stored); never one's own record; a signed level stays QUALIFIED.
- **Review due (user):** beside a QUALIFIED chip when the current window figures no longer meet that level's criteria; the level stays qualified.

**Endorsements** (automatic, Assessment only, no sign-off; each shows the first earning session):

| Endorsement | Earned by |
|---|---|
| Night ops | Night scenario, total ≥ 70, no threat leaked |
| Swarm | Swarm of 3+ threats (same `groupId`), every threat neutralised |
| Silent link | Neutralised a FIBRE_OPTIC or AUTONOMOUS_GNSS threat with no ineffective EW ordered on it first |
| Discrimination | 3+ non-threats, every threat classified exactly, no non-threat penalty (FRATRICIDE, FRIENDLY_JAMMED, WRONGLY_ENGAGED, CIVILIAN_JAMMED, BIRD_EW_ORDERED) |
| ROE discipline | 5 consecutive sessions on ROE-scoring trees (v4) without an ROE / no-kinetic attempt |
| Reporting | Contact report ≥ 80 % of its points in 3 sessions |
| Calibrated trust | 3 sessions where the AI was wrong at least once and every wrong suggestion was rejected (insight, never scored) |

**Demo data (user):** demo trainees meeting L1 get a seeded L1 sign-off from instructor@demo (demo data); at least one demo trainee has L2 at "Criteria met · awaiting sign-off", so LOCKED, IN PROGRESS and QUALIFIED are all visible.
