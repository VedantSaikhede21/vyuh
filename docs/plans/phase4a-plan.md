# Phase 4a plan — fixes, replay, kill-chain breakdown, contact report, ROE interlocks

Approved by the user on 2026-10-18 (answers 1–9 to the Step 1 findings). Branch `feat/phase4a` from `main` (908bfa8).
Hard stops: the **replay UI checkpoint** (after Step 8) and the **4a close-out** (Step 15). Part 4b starts only on "start 4b" in a fresh session.

Intel integrated-GPU FPS: still pending (required before the demo and Phase 6). No performance task first.

## Approved answers (binding for this part)

1. **`REPORT_TRUTH`** — a hidden system event the sim emits right after it applies a `REPORT_SUBMITTED` command: the true position, AGL height, heading, speed and activity of every contact behind the reported tracks. `SIM_VERSION` 5. The server checks it for plausibility. SPEC §3.3, §4.1, §4.2 updated.
2. **Report scoring (§9.5) in `default_v4`.**
   - Only threats are scored. Each threat is scored on the best report that names one of its tracks; a report that covers only non-threats is neither penalised nor credited.
   - True count = the size of the threat's swarm group (`groupId`), or 1 if it is not in one.
   - Timeliness runs from the first `MARKED_DETECTED` on the reported tracks, or from `firstDetectableTMs` if the trainee never marked them.
   - Activity truth: HOVERING when speed < 1 m/s; APPROACHING / DEPARTING when more than 30 % of the velocity points toward / away from the nearest asset; otherwise LOITERING.
   - Efficiency stays at max 0, so the total scales over 90 points.
   - S04–S10, S15 and the generator (`GENERATOR_VERSION` 3) move to `default_v4`. Their briefings state that contact reports are expected. S01–S03 and S11–S14 keep their trees.
3. **Track height is estimated, not truth** (fixes decision 51, bundled into `SIM_VERSION` 5).
   - Each radar hit measures AGL with seeded noise on its own stream `radar-height:<id>`: σ = 15 m + 0.005 × slant range (representative; source logged).
   - The noisy measurement is smoothed by an α-β filter like the 2D one.
   - The track-list altitude band, 3D track markers, the EO cue aim point and the report prefill all use the estimate.
   - Report prefill: location, heading, count, class, affiliation and altitude band, all operator-known. Activity is left to the trainee.
   - Decision 51's leak comes off the tech-debt list. A test proves no HUD-facing value reads true height.
4. **ROE interlocks.**
   - Practice keeps the interlocks with explanations.
   - Assessment allows the intercept attempt; the sim still returns `BLOCKED_BY_ROE` / `BLOCKED_NO_KINETIC`. No pre-attempt ROE or zone reason is shown in Assessment. Cooldown, ammo and range still disable the button, and the Enter confirm stays.
   - `default_v4` adds `ROE_VIOLATION_ATTEMPT` and `NO_KINETIC_VIOLATION_ATTEMPT`, −10 each, at most once per contact, with feedback naming the rule.
   - SPEC §8 and §9 updated; decision logged.
5. **Penalty times.** v4 leaves declare which metric gives the penalty time (`tMetric`). v1–v3 scores stay byte-identical; their penalties link to the contact's kill-chain moment instead.
6. **Replay gate.**
   - `sessions.terrain_revision` is stored by the server at session creation, from the preset `meta.json`. URBAN_GENERIC gets an explicit `revision: 1`.
   - Replay needs stored `sim_version == SIM_VERSION` and a matching terrain revision. A null revision on a v4+ session is attempted and verified.
   - Every replay re-verifies the regenerated system events against the stored log.
   - On any mismatch it shows the worded fallback: "This session used an older simulator version — showing the event timeline only, not a replay."
7. **Kill chain on the server** (`services/analytics/kill_chain.py`), so 4b's weakest-stage view reuses it.
   - ASSESS = when the outcome became known, plus whether the follow-up was right: re-engaged after `MISSED` / `NO_EFFECT`; no further rounds after `NEUTRALISED`.
8. **Abandonment.**
   - `sessions.last_batch_at` (migration 0003).
   - The client sends an empty heartbeat batch every 60 s while the page is open; heartbeats update `last_batch_at` but write no event rows.
   - On read, and in a startup sweep, an ACTIVE session whose last batch is more than 15 min old becomes ABANDONED. CREATED sessions are left as they are.
   - A one-off cleanup marks the existing 308 stuck sessions ABANDONED.
9. **`e2e@demo`** — a seeded trainee whose completed sessions come from committed fixture logs scored by the real server. The training-list visual baseline uses only this user.

Risk follow-ups: measure peak browser memory while replaying S06 (URBAN). Above ~300 MB → propose a lighter world (compact binary buildings or a shared parsed world) before building further. Snapshot/restore test plan and the scripted-policy D5 log are approved.

## Steps (one or more conventional commits each; lint + tests for the touched packages after each)

### Part 1 — tech-debt fixes (one commit each)

**Step 1 · My generated scenarios.** `GET /scenarios?mine=generated` (or `kind=GENERATED` for a trainee) returns the caller's own generated rows with best score; the training list gets a "My generated" section under the library table (same row component, newest first, empty state worded). Remove the stale comment in `routers/scenarios.py`. Tests: `test_scenarios.py` (own rows only, staff unchanged), list unit test.

**Step 2 · `e2e@demo` and fixed visual data.** Seed `e2e@demo` (TRAINEE, Demo Unit Alpha) and, in `app/seed/e2e.py`, create its completed sessions from committed fixture logs (`apps/api/app/seed/e2e/*.json`, produced by sim-core in Node from S01 / S04 with a scripted policy) through the real ingest + `complete_session` path, idempotently. Visual spec's training-list capture logs in as `e2e@demo`. Re-baseline that screenshot only.

**Step 3 · Abandonment.** Migration 0003 `sessions.last_batch_at` (timestamptz, nullable). `ingest_batch` sets it (empty batch allowed: schema `events` min 0, no rows, `batchSeq` still idempotent). `services/sessions.expire_stale()` used on read (`get_session`, list) and at app startup; `complete` / `events` on an expired session → `SESSION_NOT_ACTIVE`. Batcher heartbeat every 60 s while the page is open. One-off cleanup script `app/scripts/abandon_stale.py` (also run by the startup sweep — stuck rows have no `last_batch_at`, so the rule falls back to the last event row's time, then `started_at`). Tests: pytest for heartbeat (no rows), expiry on read, startup sweep, complete after expiry; batcher unit test for heartbeats.

**Step 4 · End reason after reload.** `SessionDetailResponse.ended?: {reason, tMs}` read from the stored `SESSION_ENDED` event; the result page uses it. Shared schema first, `gen:schemas`. Tests: pytest + result screen unit.

### Part 2 — replay foundations

**Step 5 · Shared schemas (one commit, then `gen:schemas`).**
- `REPORT_TRUTH` system event; `ReportTruthContact {contactId, x, z, aglM, headingDeg, speedMps, activity}`; payload `{reportSeq, contacts}`.
- `SessionDetailResponse.terrainRevision?`; `AarSessionResponse {session, scenario, events, score, killChain}`.
- `KillChainStage` rows: `{contactId, isThreat, trueClass, trackIds, stages: [{stage, availableTMs?, actionTMs?, latencyS?, action?, truth?, status: OK | LATE | WRONG | MISSED | NOT_APPLICABLE, feedback, jumpTMs}]}`.
- Penalty `tMs` already exists.
- `TerrainPresetMeta.revision` stays optional (absent = 1).

**Step 6 · sim-core `SIM_VERSION` 5.**
- Height estimate: `TrackState.altitudeAglM` becomes the filtered estimate, `pos.y` = terrain + estimate, and `followLock` aims at it. Constants and a source go in `docs/realism-sources.md`.
- `REPORT_TRUTH` is emitted after `REPORT_SUBMITTED`. `activityOf()` is exported (shared thresholds).
- **`snapshot()` / `restore(snap, eventsPrefix)`** capture everything mutable: state, histories, track filters, EO episodes and tracker, flocks (wander), all RNG stream states (new `getState` / `setState` on streams), counters and queue. The LOS cache is per tick and is reset. No behaviour change.
- Tests:
  - restore at every 10 s keyframe → run to end, identical to a straight run (events + final state) for all 15 scripted scenarios and a generated D5 log;
  - track height differs from truth, with bounded error;
  - a static check that `apps/web/components/hud`, `lib/hud`, `lib/sim/store.ts` and track markers never read `contacts[].agl` / contact `pos.y`;
  - `REPORT_TRUTH` content;
  - updated guard tests (library, phase 2a/2b, sweep).
- Then re-run `pnpm sweep:generator` (0 failures required).

**Step 7 · API replay gate and AAR.**
- Migration 0004 `sessions.terrain_revision` (int, nullable), set in `create_session` from `TERRAIN_DIR` meta. URBAN meta gets `revision: 1` (no rebuild needed; meta-only change).
- Plausibility rules for `REPORT_TRUTH`: follows its `REPORT_SUBMITTED` (seq + 1, same tMs); its contacts are exactly those behind the reported tracks; values in bounds.
- `services/analytics/kill_chain.py`.
- `GET /aar/sessions/{id}` (owner / instructor, COMPLETED only; otherwise 409 `SESSION_NOT_ACTIVE`).
- Tests: pytest for each kill-chain stage status, the AAR RBAC, REPORT_TRUTH plausibility.

### Part 3 — replay UI (then CHECKPOINT)

**Step 8 · Replay page `/aar/session/[id]`.**
- `lib/replay/`: `replay.worker.ts` loads the world, runs the scenario + logged commands straight through, posts keyframe snapshots every 10 s of sim time, then verifies its system events against the stored log (result: `verified` or `mismatch at seq N`). `ReplayController` on the main thread holds one `SimRuntime`. A seek restores the nearest keyframe at or before the target and steps forward (≤ 200 ticks). Play / pause, 1× / 2× / 4×, step ±1 tick.
- **Gate:** stored `simVersion` ≠ `SIM_VERSION`, terrain revision ≠ meta revision, or a verification mismatch → fallback view (worded line, event timeline, kill-chain panel; no 3D).
- **Layout:** the player grid read-only (tactical view, PPI, Comms log as the event log, EO view driven by the sim camera, track list), with a `REPLAY` state chip in the top bar.
  - A 64 px timeline strip above the bottom row: scrubber with markers for detections, classifications, responses, outcomes and penalties (shape + colour + tooltip), the time readout, and the speed and step controls.
  - The action bar slot holds the kill-chain panel.
- **Ground-truth toggle `G`** (AAR only, COMPLETED sessions only): true contact symbols on the PPI and in 3D, with class and contact id; a "Truth" column (class / affiliation) in the track list.
- **Keyboard:** Space play / pause, ← / → step one tick, Shift + ← / → ±10 s, `1` / `2` / `4` speed, `G` ground truth, `[` / `]` previous / next marker, Home / End.
- **Kill-chain panel:** one row per contact (threats first), six stage cells with time, latency, action vs truth and status. Clicking a stage, or pressing Enter on it, seeks the replay to `jumpTMs`.
- Tests: controller seek equivalence (seek to t = straight run to t, Node); gate unit tests; marker builder; e2e smoke (S01 played via the hook → completed → replay opens, verifies and scrubs).
- **Measure:** peak browser memory replaying S06 (CDP `Performance.getMetrics` / JS heap and process memory), reported.
- **CHECKPOINT:** described captures at 1366×768 and 1920×1080 in `apps/web/e2e/checkpoint/` (`checkpoint-4a.spec.ts`): scrubber with markers; ground truth off and on; kill-chain panel; fallback state. Then **wait for OK**.

### Part 4 — after the checkpoint

**Step 9 · Contact report form.**
- `R` key and a *Report* group in the action bar (DESIGN §11.5).
- An inline form panel over the action bar, prefilled from the selected tracks (location from the first track's sensor bearing / range, heading, count = number of selected tracks, class / affiliation from the trainee's calls, altitude band from the estimate).
- Activity is chosen by keys `1–5`. Tab moves between fields and Enter submits; target under 10 s by keyboard. Submit dispatches `REPORT_SUBMITTED`.
- The Comms line acknowledges within 100 ms.
- An e2e timing test fills a report by keyboard.

**Step 10 · `default_v4` and `GENERATOR_VERSION` 3.**
- Engine extensions used only by v4: `roots` (extra subtrees per contact: report, ROE), leaf `pointsMetric`, leaf `tMetric`.
- Metrics: `reportPoints` and its sub-scores (timeliness, count, class, location, heading, altitude + activity, from `REPORT_TRUTH`), `roeViolationTMs`, `noKineticViolationTMs`.
- Tests:
  - pytest for every report sub-score and band;
  - non-threat-only reports;
  - each violation leaf, once per contact;
  - `tMetric` times;
  - v1–v3 golden re-scores byte-identical.
- Content and generator:
  - S04–S10, S15 rebuilt from their sources with `scoringTreeId: default_v4` and a briefing line ("Contact reports are expected: send one for every threat track (R).");
  - the generator writes v4 and the same line, with byte-identical tests re-pinned;
  - sweeps at 0 failures.

**Step 11 · ROE interlocks in Assessment.** `derive.ts` returns no ROE / zone reason in Assessment (range, cooldown, ammo unchanged). The Comms line for a blocked attempt names the rule. Tests: derive unit tests per mode; S14 / a WEAPONS_TIGHT scenario log through the API scoring `ROE_VIOLATION_ATTEMPT`.

**Step 12 · Result screen.** Replay (AAR) button (disabled with the fallback reason when replay is not possible). Each penalty links to `/aar/session/[id]?t=<tMs>`, from the penalty `tMs` (v4) or the contact's kill-chain moment (v1–v3).

**Step 13 · S04 report exercise and guard test.** The S04 guard (`library-scenarios.test.ts`, `test_library_sources.py`): a scripted policy that reports scores the report component above a floor, and one that never reports scores 0 there.

**Step 14 · SPEC / DESIGN / decisions.** SPEC §3.3, §4.1–4.2, §4.5, §8, §9.5, §10, §11, §12 Phase 4 status; decisions logged as they are made (from 100).

**Step 15 · Close-out (STOP).**
- Full checks: `pnpm lint`, `pnpm test`, `uv run pytest`, `pnpm gen:schemas` with no diff, the production build, full `pnpm e2e` and both sweeps.
- The Phase 4 done-criteria 4a covers, with evidence (replay matches exactly: S01, S06, S10, generated D5).
- DESIGN §13 checklist with captures at both sizes for every new or changed screen.
- Replay-view FPS on a production build.
- CLAUDE.md §14 updated. Then stop.

## Risks

- **Snapshot completeness:** mitigated by the restore-at-every-keyframe test and the per-replay verification.
- **Worker memory:** the world is loaded twice. Measured in Step 8; the 300 MB threshold triggers a proposal.
- **Read-only HUD reuse:** the EO view and track list read the UI store. Replay drives the UI store from the sim camera and selection each tick.
- **`SIM_VERSION` 5 shifts EO cue aim** (estimated height): guard tests and sweeps re-run. Sessions on v4 and older become fallback-only.
