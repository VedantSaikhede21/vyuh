# Phase 6B — Core training screens (approved plan)

> Part 6B of `docs/plans/phase6-requirements.md` §5. Approved by the user 2026-10-25. Built on `feat/phase6-a` (user: one branch for all of Phase 6, merged at the end).

## A. P0s first

- **P0-4 One rounding rule (first; others build on it).** API helper `display_round` (half-up: 62.5 → 63; totals whole numbers, components one decimal). `with_derived_fields` adds `Score.display = { total, components }`; trend points, unit leaderboard average / last, recent sessions and the debrief summary use the same helper. The web shows only those values; its `toFixed` / `Math.round` on scores go. Stored scores unchanged. Optional fields in `packages/shared` + `pnpm gen:schemas`; SPEC §4 / §11 updated.
- **P0-3 Result screen.** "Recommended from your rating (1,024)" (new optional `Score.recommendationRating`, the rating the server used); Practice says "Practice runs never move your rating". Primary action by score: under 50 Retry (same seed) with the debrief's drill line beside it; 50–79 Replay and Retry and Next all secondary; 80+ Next scenario primary. Pure `resultActions(total, mode)`, unit-tested.
- **P0-6 3D view shows the selected track.** When the selected track is off-screen or behind the camera, the orbit camera eases (~400 ms, ease-out) around the defended position to bring it in frame, pulling back within a bound; orbit input cancels the ease; reduced motion jumps; no movement while the track is visible. Track labels move from drei `<Html>` to the plain-DOM overlay used by zone labels — labels clamp inside the view and the dev "unmount a root" errors go. FPS before / after on S06 and the worst D5.
- **P0-5 First-time next step (Practice only).** Pure `nextStep(track, eo, roe)` in `lib/hud`, unit-tested → one line in the action-bar header (Select a track · Tab → Mark detected · D → Cue the camera · Space → Zoom in · + → Classify · C → Set affiliation · H F N U → Respond · J / S / I → Report · R). Never in Assessment. Tour in 6E.

## B. P1 / P2 by screen

- **Player:** Comms single-line with ellipsis + full text on hover, tighter line height, ≥ 8 lines at 768 px (P1-2); EO day sky toned (P1-3); AI chip shows the class name (P1-5); `?` sheet pauses Practice (P2-5); disabled reasons kept; titles never truncated without a hover title; AI chip and spectrogram labelled as aids.
- **Result:** story order score → strengths → what to fix (debrief) → drill → replay links → next; "scaled to 100" note (P1-13); empty penalties collapse to one line (P2-4); template debrief groups a track stopped at one stage into one line and repeated ROE attempts into one (P1-12, tech debt); staff-only "Regenerate debrief" for a cached invalid debrief (tech debt).
- **AAR:** opens at the first event; "Ground truth · G" switch with on / off state; MISS in `--warn` with a symbol; timeline marker legend; stages, penalties and debrief mistakes jump to their moment (P1-14); 6A error copy.
- **Trends:** definitions separating kill-chain stage rates from score components; difficulty as a step readout; even ticks 0 / 25 / 50 / 75 / 100; Recharts themed; empty states (P1-15).
- **Unit dashboard and assignments:** whole row opens the AAR, trainee name a separate link; overdue chip; `AUT-` codes in lists and the assign form (P1-16, P2-9).
- **Builder:** map hint for the active tool, Esc cancels, inline field errors; zone names and instructor note on the briefing legend; preview without jank (P1-17, tech debt).
- **Briefing / training list:** label collision offset (S06 relay site, S05 ring label — P2-3, tech debt); S01–S03 thumbnails; Generate secondary (P2-2).
- **Weight editor, From text:** no developer text (P1-9); re-scored feedback without "/10".
- **Everywhere:** 6A primitives applied (PageHeader, Tabs, SegmentedControl, Table, ErrorState — replacing the hand-built AAR / player tabs, mode toggle and coverage radiogroup); one primary action per screen; keyboard focus order checked.

## C. Stress and keyboard

`emil-design-eng` before the polish; `break-ui` on every table, list, chart and panel of these screens (long names, 0 / 500 rows, huge numbers, missing fields, slow API) — fix or log each.

## D. Parked

Naming the zone in no-kinetic violation feedback needs the zone id in a sim event, a `SIM_VERSION` bump and re-recorded demo logs and fixtures; it matters only with several zones (one zone is already named). Stays parked.

## E. Checkpoint B and close-out

Captures of every 6B screen at both sizes (`checkpoint-6b.spec.ts`), the `break-ui` report, FPS before / after on S06 and the worst D5 (production build). After the user's OK: regenerate, review and commit baselines; full `pnpm e2e`; lint, unit tests, pytest, `gen:schemas` no diff; CLAUDE.md §14 and decisions.

**Tests:** vitest — `display` use, `resultActions`, `nextStep`, camera re-aim maths, Comms clamp. pytest — `display_round` (62.5), display fields on score / trend / unit responses, debrief summary uses it, template grouping, staff-only regenerate.

**Also:** 6G security checklist gains "prove the X-Vyuh-Test-Debrief header is ignored on the deployed API".

**Risks:** player changes (camera, DOM labels) → FPS re-measured; additive optional schema fields; large Part → small commits per screen. **No new dependencies.**
