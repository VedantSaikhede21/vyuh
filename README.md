# VYUH — Counter-Drone Threat Simulation Trainer

Browser-based trainer for detecting, tracking, identifying and responding to drone and swarm threats (SIH 2026, PS 26247). Rules and architecture: [CLAUDE.md](CLAUDE.md). Full spec: [docs/SPEC.md](docs/SPEC.md).

## Prerequisites

- Node.js 24+ with Corepack (`corepack enable` — provides the pinned pnpm)
- [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for you)
- Docker Desktop (local Postgres)

## First-time setup

```bash
pnpm install
uv python install 3.12
cd apps/api && uv sync && cd ../..

# env files (defaults work offline in AUTH_MODE=local)
cp apps/api/.env.example apps/api/.env          # then set LOCAL_JWT_SECRET (≥ 32 bytes):
python -c "import secrets; print(secrets.token_urlsafe(48))"
cp apps/web/.env.example apps/web/.env.local

docker compose up -d                            # Postgres on :5432 (+ vyuh_test DB)
cd apps/api && uv run alembic upgrade head && cd ../..
pnpm seed                                       # demo units, users, threats, scenarios
```

## Daily use

```bash
pnpm dev           # web on http://localhost:3000, API on http://localhost:8000/api/v1
```

Open http://localhost:3000/login, pick a demo account (e.g. `trainee1@demo`) and sign in — `/train` shows your user and role.

Run pnpm seed after any deploy that changes seed data. (With `ENV=dev` the API also re-seeds at startup when the seed files changed.)

Run `pnpm graph` to regenerate the code map (output is git-ignored).

## Offline build

```bash
docker compose up --build        # Postgres + API + web on http://localhost:3000
```

Local auth, LLM off, all terrain in the images; no network needed once built. For development, `docker compose up -d postgres` starts the database only. If port 5432 is taken, set `POSTGRES_PORT`. Hosted setup is in `docs/DEPLOY.md`.

## Checks

```bash
pnpm lint          # ESLint + Prettier + typecheck + ruff
pnpm test          # vitest (shared, sim-core)
cd apps/api && uv run pytest   # needs `docker compose up -d`
pnpm gen:schemas   # zod → JSON Schema → Pydantic; must produce no git diff
```

## Switching to Supabase auth

1. Create a Supabase project and enable **asymmetric JWT signing keys** (Project Settings → JWT Keys).
2. API `.env`: `AUTH_MODE=supabase`, `SUPABASE_URL=https://<ref>.supabase.co` (JWKS URL is derived), and point `DATABASE_URL` at the Supabase Postgres if you want hosted data.
3. Web `.env.local`: `NEXT_PUBLIC_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Create users in the Supabase dashboard (email + password). They appear as TRAINEE on first login; change roles in the `users` table.
