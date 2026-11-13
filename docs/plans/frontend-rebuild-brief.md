# Front-end rebuild: brief and how to resume

Agreed with the user on 2026-11-13. **A new chat starts here.** Nothing visual is decided yet.

## What the user asked for

- Rebuild the front end. The user did not like the 6R redesign (direction B, decisions 164–172), even though it is built and tested.
- **Drop the "clean and minimal" rule.** For SIH, the user wants the UI to show as much as possible.
- Use the design research in the user's portfolio project (below), or download skills if needed.

## Agreed direction (recommendation accepted with "let's move")

1. **Front end before new features.** Every PS requirement already has a working feature (CLAUDE.md §1 table). Judges judge mostly what they see; new features now add risk for little visible gain.
2. **Rebuild the look, not the app.** Keep sim-core, scoring, replay, the event batcher, the API, `lib/` hooks and data fetching. Replace the visual layer on top of them. Keep `data-testid`s where possible so the ~25 e2e specs and ~1,100 unit / API tests keep guarding behaviour.
3. **Three kinds of screen, three sets of rules:**

| Area | Style | Portfolio research |
|---|---|---|
| Landing, `/demo`, guided tour | Showcase: 3D terrain, scroll motion, strong type | Most of `TRENDY_COMPONENTS.md` applies |
| AAR, trends, unit dashboard, record, library, instructor | Information-rich command centre, far denser than now | Charts, maps and readouts everywhere |
| Training player (the sim) | Dense but readable under pressure | Little decorative motion; must stay above the FPS budget (SPEC §16) on integrated graphics |

4. **Deploy in parallel.** The app is still not hosted, and judges may only get a link. The user follows `docs/DEPLOY.md` and sends the two URLs; this does not wait for the redesign.

## Ask the user first (still unanswered)

1. **What they disliked about the 6R version.** Screenshots or a screen recording with comments. Without this the rebuild may repeat the problem.
2. **The next SIH date** (internal round, submission, finale). It decides whether every screen is restyled or only the judge path (SPEC §20).

## Then, in order

1. Read the sources below. Pick out what fits each of the three areas.
2. Show two or three visual directions as **mockups** (images or a preview page), not descriptions. The user picks one.
3. Rewrite `docs/DESIGN.md` for the chosen direction (the minimal rule goes), log a decision in `docs/decisions.md`, and write a plan in `docs/plans/` (files, order, risks, any new dependency with a reason: rule 10, e.g. GSAP or Lenis).
4. Build in order: landing page first, then the judge path (`/demo` → briefing → player → result → AAR), then the rest.
5. Proof per CLAUDE.md §10: screenshots at 1366×768 and 1920×1080, FPS on the player, `pnpm e2e`.

## Sources on this machine

- `D:\Portfolio\TRENDY_COMPONENTS.md`: catalogue (researched 2026-10-31) of cursor effects, scroll effects, transitions, shaders and components on award-level sites, with sources.
- `D:\Portfolio\portfolio-context\SKILL.md` and `D:\Vedant\portfolio-context\` (`Skill.MD`, `PLAN.md`, `research/NOTES.md`): lessons from the user's portfolio, including why two earlier drafts did not feel professional. Section 4 there is the important part. It is about the portfolio, so take the design lessons and work style, not its content.
- `D:\Portfolio\Portfolio spec.MD`, `Years redesign plan.MD`: portfolio spec and plans.
- Portfolio stack for reference: Vite, React 19, three 0.186, R3F 9, drei 10, GSAP 3.15, Lenis 1.3. VYUH already has three, R3F and drei.
- In this repo: `docs/plans/redesign-*.md` (the 6R drafts, untracked, never committed by the user's choice) show what was tried.

## How the user wants to work (from the portfolio lessons)

- Consult on every decision that changes the look; one decision at a time, recommendation first, plain words.
- Show, don't describe: mockups and screenshots.
- Let them see progress often. Keep a short status file updated after each step.
- No Claude co-author trailers in commits.

## State of the rest of Phase 6

`docs/plans/phase6r-progress.md` still lists the open items (break-ui / checkpoint / capture specs, landing media, PROCEDURAL_HILLS stills, 6H). Items tied to the 6R look are superseded by this rebuild. Early-end scoring (decision 173) and CI are done; CI was green on `a50147d`.
