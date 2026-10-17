# Phase 3b · Checkpoint B feedback (user, 2026-10-18)

> Status: **APPROVED with changes.** Do items 1–4 before updating the visual
> baselines, show the results, then continue with Steps 14 and 15 of
> `docs/plans/phase3b-plan.md`. Branch: `feat/phase3b` (last commit f2fe455).

Checkpoint B approved, with these changes before updating baselines:

1. **URBAN sim tick headroom.** Peak 1.87–1.97 ms is too close to the 2 ms budget
   for slower lab-PC CPUs. Bring the URBAN 60-contact peak to **≤ 1.5 ms without
   changing sim behaviour**, for example:
   - a per-ray coarse height-grid early-out;
   - a ray-vs-cell bounding-box skip;
   - tighter building grid cells;
   - reusing LOS results already computed this tick.

   Prove no behaviour change with the 10k-ray equivalence test, identical event
   logs and unchanged fixtures. Report before/after bench numbers. **If ≤ 1.5 ms
   needs a behaviour change (e.g. staggering scans), stop and tell me instead.**

   Baseline to beat (quiet machine, 2026-10-18,
   `node scripts/bench.ts --preset URBAN_GENERIC`): mean 0.043–0.052 ms,
   p99 0.63–0.81 ms, **max 1.87–1.97 ms**. PUNJAB_PLAINS max 0.94–1.15 ms,
   S06 max 0.50–0.69 ms, S10 max 0.82 ms.

2. **URBAN zone labels:** keep all zones, but declutter the text.
   - In 3D and on the PPI, show one group label for the town cluster
     ("NO KINETIC · TOWN").
   - Show individual zone ids only on hover, when the selected track is inside or
     approaching that zone, or in a disabled-intercept tooltip.
   - The briefing map keeps individual ids, since there's space there.

3. **Briefing at 1920×1080:** use the space under the map for a map legend (asset,
   sensor and effector symbols, zone and border styles, coverage altitude key with
   the selected altitude, scale).

4. **Briefing at 1366×768:** the mission card may scroll, but the
   Practice/Assessment toggle and Begin (Enter) are pinned at the bottom of the
   card and always visible. (Current build already puts them in a footer outside
   the scroll area — verify at 1366×768 and keep it that way.)

5. **Keyboard test locator change** (a11y "core actions by keyboard alone" now
   focuses the scenario row): approved.

**Show the user:** the updated briefing (S06 at 1366×768 and 1920×1080), the S06
player with the grouped labels, and the bench numbers. **Then** update the visual
baselines and continue with Steps 14 and 15.

The Intel FPS run is still outstanding; the teammate will use this command (after
starting the API and a production web build, `cd apps\web; pnpm build; pnpm start`):

```powershell
$env:E2E_BASE_URL = "http://localhost:3000"
pnpm --filter @vyuh/web exec playwright test e2e/fps.spec.ts --grep '(S13|S14 Mixed Sky at|S06|JK D4 seed 37|PUNJAB D5 seed 6).*@fps$'
```

For 150 % display scaling, change `@fps$` to `@fps150$`.
