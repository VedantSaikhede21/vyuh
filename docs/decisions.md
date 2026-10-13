# Decisions (ADR log)

Short entries: date, decision, why. Newest at the bottom.

## 2026-10-14 — Phase 0 spec clarifications

1. **Scenario shape follows the §4.4 example.** `schemaVersion` (not `version`), `roe` and `durationS` at top level, `environment = {date, time, isNight, weather, sunAzEl?}`, `request` optional. *Why:* the example is what scripted scenarios will look like; scripted scenarios have no ScenarioRequest.
2. **`Scenario.id` is a plain string; `scenarios.code` column added** (nullable unique, e.g. `S04`). *Why:* scripted scenarios have human codes, DB rows use UUIDs.
3. **`trackId` / `contactId` only at the top level of `SimEvent`**, not inside payloads; `SimEvent` is a discriminated union on `type`; `seq` required. *Why:* matches `session_events` columns and the §11.1 batch example; avoids two sources of truth.
4. **`session_events.seq` column with unique `(session_id, seq)`.** *Why:* replay ordering and idempotent ingestion need it.
5. **Scenario coordinates:** `x` = east, `z` = north, `y` = metres AGL; 2D points `[x, z]`. Flip to Three.js only in `sim-core/src/coords.ts`. *Why:* the spec mixed ENU and Three.js conventions.
6. **All enums in `enums.ts`**, including the ones §4 implied but did not list. `ACOUSTIC` omitted until implemented (adding an enum value later is non-breaking).
7. **Sensor and effector configs are unions keyed on `kind`.** `Penalty` and `PerContactMetrics` are provisional shapes until Phase 1 scoring; `threat_types.category` stays free text.
8. **Auth identity mapping.** Local: token `sub` = `users.auth_id` = `local:<email>`. Supabase: `sub` = Supabase user UUID; unknown users auto-provisioned as TRAINEE with no unit. Role always comes from the DB, never from token claims. *Why:* one code path for RBAC, and token claims cannot escalate privilege.
9. **No passwords in our DB.** Local mode uses `POST /auth/dev-login` (by email, disabled when `ENV=prod`); Supabase demo users are created in the Supabase dashboard. *Why:* `users` has no password column and Supabase owns credentials.
10. **Production guard:** `ENV=prod` requires `AUTH_MODE=supabase`; `LOCAL_JWT_SECRET` ≥ 32 bytes. Supabase project must use asymmetric JWT signing keys (JWKS cannot verify legacy HS256 tokens).
11. **sim-core RNG built in Phase 0** (spec lists it in Phase 1). *Why:* requested by the lead; it is foundational and has no dependencies.

## 2026-10-14 — Phase 0 tooling

1. **TypeScript pinned to ~6.0**, not 7.x. *Why:* typescript-eslint supports `<6.1`.
2. **zod 4** with built-in `z.toJSONSchema`. *Why:* no extra `zod-to-json-schema` dependency.
3. **One bundled JSON Schema (`$defs`) → one generated Python module.** *Why:* simple, deterministic codegen.
4. **`pnpm dev` = `pnpm -r --parallel dev`**, with a thin `apps/api/package.json` that calls uv. *Why:* no `concurrently` dependency.
5. **Sync SQLAlchemy 2 + psycopg 3.** *Why:* simpler than async; a unit-sized load is tiny.
6. **Stdlib logging (JSON lines) with a request-id contextvar**, not structlog. *Why:* no extra dependency.
7. **Line endings forced to LF (`.gitattributes`)** and datamodel-codegen run with `--disable-timestamp`. *Why:* Windows dev machines must not create diffs in CI's no-diff check.
8. **Tests use a real Postgres** (`vyuh_test` locally via docker compose, a service in CI). *Why:* tables use `jsonb` and `text[]`.
9. **Web auth guard is client-side** (token in browser storage, as Supabase JS does). Middleware-based guard is tech debt for later.
