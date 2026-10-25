# Phase 6B — break-ui report

> 2026-10-25. Screens: training list, result, trends, unit dashboard (the data-driven 6B screens; the player and AAR render sim state, stress-tested by the FPS spec). Spec: `apps/web/e2e/break-ui.spec.ts` (`@breakui`), which rewrites real API responses in flight — the components are untouched. States: demo, worst, empty, one, many (1,000 scenarios, 200 trend points, 60 trainees / 500 recent sessions, 60 penalties and contacts). Captures and `overflow.txt` in `apps/web/e2e/checkpoint/6b/break/` (git-ignored), at 1366×768 and 1920×1080, production build.
>
> Limits used: scenario name 200 (DB `scenarios.name`) / 80 (builder form), user and unit names 120, email 254, scenario code 16 (`AUT-` ids), debrief lines 300 / summary 800 (zod), mistake and penalty feedback unbounded (server strings).

## What broke

| # | Severity | Field | Worst-case value | What happens | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Broken | Unit · assignments `pending` | 9 trainee names ("Aleksandra Wiśniewska-Kowalczyk, Jo, Bartholomew Fitzgerald-Montgomery III, …") | `whitespace-nowrap` cell: page scrolls 1,679 px sideways at 1366 (1,402 at 1920); the whole dashboard is wider than the screen | Show "7 pending" with the names in a tooltip / wrap with `min-w-0`; never nowrap a list — `app/instructor/page.tsx` (Pending `<td>`) |
| 2 | Broken | Training list · `name` + `tags` | "Ridge Line Overwatch at Last Light with Civilian Traffic and Two Swarm Axes Converging on Post Alpha" (101 chars, DB allows 200) + 5 tags | Table 417 px wider than the page at 1366 (140 at 1920); Duration and Best off-screen | Name cell `min-w-0` and wraps to 2 lines (`line-clamp-2` + `title`); tags: first 2, then "+3" with the rest in a tooltip — `components/training/scenario-table.tsx` |
| 3 | Ugly | Unit · recent `scenarioName` | same 101-char name | nowrap cell runs under the Assign a scenario panel (text overlaps the form) | `min-w-0` + `truncate` with `title` on the scenario cell; the table keeps its panel width — `app/instructor/page.tsx` (recent table) |
| 4 | Ugly | Unit · assignments `scenarioName` | "Canal Bridge — night approach from the north-east, two decoys and a relay outage" | nowrap cell widens the assignments table past its panel | Same as 3 |
| 5 | Ugly | Unit · empty unit | 0 sessions, 0 trainees | Leaderboard, mistakes and recent tables render bare header rows; Recent sessions has headers and nothing else | Omit the table when it has no rows; one worded line ("No Assessment sessions in this unit yet.") — `app/instructor/page.tsx` |
| 6 | Fragile | Scenario `name` | — | Builder form caps at 80, the DB at 200, the API accepts up to 200 (generated / authored via API) | Either cap the API at 80 too, or design for 200 (fix 2 covers display) — `packages/shared/src/instructor.ts:312`, `apps/api/app/models/content.py:46` |
| 7 | Fragile | Training list · 1,000 rows | `many` state | No page overflow, but the list is unpaginated; "My generated" grows without limit per user | Decide: paginate "My generated" (newest 20 + "Show more") — see Decisions |

## Decisions for you

- **Pending names (1):** recommend a count ("2 of 3 · 1 pending") with the names in a tooltip — the unit page is a comparison view, names belong in the drill-down.
- **Long scenario names (2–4):** recommend wrap to two lines in the training list (the name identifies the scenario, so it should be readable), truncate with a tooltip in the unit tables (secondary there).
- **Tags (2):** recommend first two tags + "+n"; the Tag filter already finds the rest.
- **Name limit (6):** recommend 80 everywhere (API and form) — a briefing title longer than that is a sentence.
- **Generated list (7):** recommend newest 20 with "Show more"; the library itself is curated (11 scenarios), so it needs nothing.

## What held up

- **Result screen:** 60 penalties with 190-character feedback, 60 contacts with five track ids each, a 101-character title, a debrief at its schema limits (800-char summary, 5 × 300-char strengths, 6 × 300-char mistakes, 400-char drill) — wraps cleanly, no overflow, Retry / Next stay in the header; empty penalties collapse to one line; "one" reads correctly.
- **Trends:** long names wrap inside the sessions table; 200 points draw without overflow; `null` ratings show "—"; totals 0 and 100 sit inside the 0–100 axis; one point and zero points render the worded states.
- **Leaderboard:** long and one-letter names, change −27 / 0 / null all align (tabular figures, "—" for null).
- No horizontal scroll on any screen in demo, one or empty states, at either width.

## Fixes applied (user: "fix all", 2026-10-25)

| # | Outcome | Change |
| --- | --- | --- |
| 1 | Fixed | Pending shows one name, else "n trainees", names in the `title` (`app/instructor/page.tsx`) |
| 2 | Fixed | Name cell wraps to two lines (`line-clamp-2`, full name in `title`, `min-w-[14rem]`); badge and "Opening briefing…" stay beside it; tags show up to three, else two and "+n" with the rest in a `title` (`rowTags` in `lib/scenario/library.ts`, tested) |
| 3 | Fixed | Recent sessions: scenario cell `max-w-0` + `truncate` with `title`; trainee link truncates at 12 rem |
| 4 | Fixed | Assignments: scenario cell `max-w-0` + `truncate` with `title` |
| 5 | Fixed | Empty leaderboard and mistakes tables are omitted under their worded answer; Recent sessions says "No Assessment sessions in this unit yet." |
| 6 | No change needed | Every path that stores a scenario name already caps it: authored names at 80 (`AuthorScenarioRequest`), generated names are two words, the library tops out at 15 characters. The DB column's 200 is headroom only. |
| 7 | Fixed | "My generated" shows the newest 20 and "Show 20 more · n not shown" (`own-generated.tsx`); the spec asserts 20 → 40 rows |

Re-run: all 20 break-ui tests pass; no horizontal scroll on any screen in any state at 1366 or 1920 (40 checks). The demo state was re-checked after the fixes: one regression (the DONE badge dropped under S05's name once the cell wrapped) was found and fixed by keeping the badge in a flex row beside the name.
