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
cd apps/api && uv run alembic upgrade head && uv run python -m app.seed.demo && cd ../..
```

## Daily use

```bash
pnpm dev           # web on http://localhost:3000, API on http://localhost:8000/api/v1
```

Open http://localhost:3000/login, pick a demo account (e.g. `trainee1@demo`) and sign in — `/train` shows your user and role.

Run `pnpm graph` to regenerate the code map (output is git-ignored).

## API in Docker (optional)

```bash
docker build -f apps/api/Dockerfile -t vyuh-api .        # build from the repo root
LOCAL_JWT_SECRET=<≥ 32 bytes> docker compose --profile api up -d --build
```

The `api` profile runs migrations, seeds demo data and serves on :8000 (stop `pnpm dev`'s API first). Plain `docker compose up -d` still starts Postgres only. Known issue: an older container holding port 5432 (`sih-2026-postgres-1`) makes `up` fail until it is stopped.

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
