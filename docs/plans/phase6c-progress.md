# Phase 6C — progress and handoff

> Working notes for resuming Part 6C. Plan: `docs/plans/phase6c-plan.md` (approved 2026-10-25). Branch: **`main`** (solo workflow, decision 153: commit to `main`, push to `origin/main` after each step group, CI must stay green). Next free decision number: 157.

## Done (committed)

| Step | What |
|---|---|
| Plan | Approved plan; CLAUDE.md §12 and requirements §0 solo workflow; decision 153 |
| 0 | Flaky test (decision 154): LOS equivalence loops assert once; sim-core `testTimeout` 20 s; web vitest `maxWorkers: 4` (15 forks failed to spawn under load). Six full `pnpm test` runs with `pnpm dev` up: green |
| 1 | `ea84bb9` shared: `record.ts` (`RECORD_V1` + record responses), `portal.ts` (home, notices, status, readiness, live, scoring summary, `LIBRARY_UPDATES`), `SessionRemark` / `AarSessionResponse.remarks`, enums (TrainingLevel, LevelState, EndorsementCode, NoticeKind, ComponentStatus), `CLASS_PROFILES.confusedWith` (generator `CONFUSABLE` removed; 30-scenario hash identical). `f84afcf` API: migration 0007; `services/record.py`, `notices.py`, `portal.py`, remarks in `aar.py`; routers `/record`, `/notices`, `/home`, `/status`, `/scoring/summary`, `/units/{id}/readiness`, `/sessions/active`, `/aar/sessions/{id}/remarks`; `seed_demo_record` (4 demo L1 sign-offs, 1 remark); `tests/test_phase6c.py` (13). pytest 473, lint clean, `gen:schemas` no diff. Decisions 155, 156. Dev DB migrated to 0007 and re-seeded. **Restart the dev API** to load the new routes (uvicorn reload is unreliable on Windows). |

## Next

2. Pages in plan order (library → notices / remarks → help / settings / status → record → home → readiness / live).
3. Unit dashboard `Table` swap + one-stop rows.
4. Public pages, mobile pass.
5. break-ui, landing re-record, Checkpoint C (wait for OK).
