# Phase 6B — progress and handoff

> Working notes for resuming Part 6B. Plan: `docs/plans/phase6b-plan.md` (approved 2026-10-25). Branch: **`feat/phase6-a`** (user: one branch for all of Phase 6, merged at the end — do not open `feat/phase6-b`). Last updated 2026-10-25, end of session.

## Done (committed)

| Commit | What |
|---|---|
| `973d82e` | Approved 6B plan; 6G security checklist line for the `X-Vyuh-Test-Debrief` header |
| `b67b9e1` | **P0-4 one rounding rule** (decision 149): `apps/api/app/services/display.py` (half up on the written decimal); `Score.display` + `Score.recommendationRating` on read; trend / unit / recent totals and component percentages sent as display integers; debrief summary and LLM payload use the same value; web uses `lib/score-display.ts`; SPEC note; `tests/test_display.py`; golden tests ignore the new derived fields |
| `502c009` | **P0-3 result screen**: "Recommended from your rating (n)", Practice "runs never move your rating", primary action by score (`lib/result-actions.ts`: < 50 Retry + pointer to the debrief drill, 80+ Next, else none) |
| `6b52d33` | **P0-5 Practice next step** in the action-bar header (`lib/hud/next-step.ts`, `lib/hud/use-next-step.ts`; never uses EO_IDENTIFIABLE, which names the contact) |

Checks at `6b52d33`: web vitest and typecheck / lint clean; full API pytest green after P0-4.

## In progress (committed as WIP — needs a fix before it is done)

**P0-6 3D view shows the selected track:**
- `lib/sim/framing.ts` (pure maths, tested in `test/phase6b.test.ts`), `components/sim/selected-framing.tsx` (orbit eases behind the asset towards an off-screen selected track; orbit input holds it 5 s; reduced motion jumps), `components/sim/track-labels.tsx` (track labels moved from drei `<Html>` to a DOM overlay, clamped inside the view), `OrbitControls makeDefault` in `tactical-view.tsx`, `<TrackLabels />` in `player.tsx`.
- `e2e/fps.spec.ts`: new opt-in `FPS_SELECT=1` (selects and marks three tracks before measuring).
- Verified in a production build: S15, Tab → camera swings west, T001 and its AI line in frame, no console errors.

**Open problem — FPS regression on the worst D5:**

| Case (1920×1080, fixed DPR, FPS_SELECT=1, AMD integrated) | Before | After |
|---|---|---|
| S06 Crowded Skies | 64 fps | 62 fps |
| Generated URBAN D5 seed 2 | 55 fps (p95 25 ms) | **32 fps (p95 50 ms)** |

Suspected cause: the label rAF loop interleaved style writes and `offsetWidth` reads (forced layout per label per frame). A read-then-write batch fix is in the working tree (`track-labels.tsx`) and built, but **not yet re-measured** (the session ended). Second suspect: the camera re-aims over the dense city (k vertices 1,393 → 1,477), i.e. a different view, not a cost of the change. Next steps:
1. Re-measure URBAN D5 (command below). If still low, measure with framing disabled (comment out `<SelectedFraming />`) to separate the two causes.
2. If the labels are the cost, cache label sizes (they change only when the set changes) instead of reading every frame; if it is the view, point the camera target part-way to the track (less city in frame) or accept and document.
3. Then commit P0-6 properly and log decision 150 (Html → DOM labels, framing behaviour, FPS numbers).

Measure (production build; start the API and `next start` first, see below):
```
cd apps/web
FPS_SELECT=1 FPS_MODES=fixed E2E_BASE_URL=http://localhost:3000 E2E_SKIP_DEMO_RESET=1 \
  npx playwright test e2e/fps.spec.ts --grep "(S06|URBAN D5 seed 2).*1920×1080 ×1 fixed"
```
Production stack used: `cd apps/web && pnpm build`, then `npx next start --port 3000`; API `cd apps/api && uv run uvicorn app.main:create_app --factory --port 8000` (no `--reload`). Stop by port: `netstat -ano | grep ":3000 "` → `taskkill //PID <pid> //F //T`.

## Still to do in 6B (from the plan, in order)

1. Finish P0-6 (above).
2. Player P1s: Comms single-line + ≥ 8 lines at 768 (P1-2); EO day sky (P1-3); AI chip class name — still shows "BRDL" (P1-5); `?` pauses Practice (P2-5); aids labelling.
3. Result: story order, "scaled to 100" note (P1-13), empty penalties one line (P2-4), template debrief grouping (P1-12) and ROE lines, staff-only "Regenerate debrief".
4. AAR (P1-14), trends (P1-15), unit dashboard + assignments (P1-16, P2-9), builder (P1-17 + legend), briefing labels (P2-3) + S01–S03 thumbnails + Generate secondary (P2-2), weight editor / From text copy (P1-9) and "/10" wording.
5. Apply 6A primitives everywhere (Tabs, SegmentedControl, Table, PageHeader, ErrorState); one primary action per screen; keyboard focus order.
6. Load `emil-design-eng` before the polish, `break-ui` before stress-testing; write the break-ui report.
7. Checkpoint B: `checkpoint-6b.spec.ts` captures of every 6B screen at 1366×768 and 1920×1080 + break-ui report + FPS before / after → **stop for the user's OK**.
8. After OK: regenerate + review + commit visual baselines; full `pnpm e2e`; lint, `pnpm test`, pytest, `gen:schemas` no diff; CLAUDE.md §14; decisions.

## Notes

- Decisions so far in 6B: 149 (rounding). Next free number: 150.
- `pnpm e2e` now resets the @demo accounts and forces the template debrief (decision 148).
- The auto-mode classifier blocked running `pnpm seed:reset-demo --yes` directly once; the e2e global setup runs it fine.
- Player screenshots / probes need the e2e step hook, which exists only on the dev server; production probes run in real time.
