# Phase 6C — progress and handoff

> Working notes for resuming Part 6C. Plan: `docs/plans/phase6c-plan.md` (approved 2026-10-25). Branch: **`main`** (solo workflow, decision 153: commit to `main`, push to `origin/main` after each step group, CI must stay green). Next free decision number: 155.

## Done (committed)

| Step | What |
|---|---|
| Plan | Approved plan; CLAUDE.md §12 and requirements §0 solo workflow; decision 153 |
| 0 | Flaky test (decision 154): LOS equivalence loops assert once; sim-core `testTimeout` 20 s; web vitest `maxWorkers: 4` (15 forks failed to spawn under load). Six full `pnpm test` runs with `pnpm dev` up: green |

## Next

1. Schemas, migration 0007, API routes.
2. Pages in plan order (library → notices / remarks → help / settings / status → record → home → readiness / live).
3. Unit dashboard `Table` swap + one-stop rows.
4. Public pages, mobile pass.
5. break-ui, landing re-record, Checkpoint C (wait for OK).
