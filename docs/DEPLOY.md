# Deploying VYUH

Two builds: **hosted** (Vercel + Render + Supabase) for the portfolio link, and **offline** (`docker compose up`) for a unit PC or as the demo fallback.

## Offline build

Needs Docker Desktop. The first build needs the internet; after that, none.

```
docker compose up --build
```

Open <http://localhost:3000>, pick a demo account, train. Auth is local, the LLM is off (debriefs use the template), and all terrain is in the images. If port 5432 is taken, run with `POSTGRES_PORT=5433`.

## Hosted build: what to create, in order

The hosted link is the portfolio demo: a visitor opens it, presses "Try the demo" and plays as a guest, with no sign-up. It runs on free plans. You need four accounts: Supabase, Render, Vercel and UptimeRobot (an OpenRouter key is optional, for LLM debriefs). Render and Vercel both read the GitHub repo `VedantSaikhede21/vyuh`, so push `main` first.

### 1. Supabase (database and sign-in)

1. <https://supabase.com> → **New project**. Name `vyuh`, region **Southeast Asia (Singapore, ap-southeast-1)**, the same region as the Render API (only the API talks to the database, so the database sits next to it, not next to the visitors), a strong database password. Save the password.
2. **Connect** (top bar) → **Session pooler** connection string. Copy it and put in your password. This is `DATABASE_URL` (the API accepts `postgresql://` as Supabase shows it).
3. **Project Settings → API**: copy **Project URL** (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`) and the **anon public** key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. **Project Settings → JWT Keys**: make sure signing is **asymmetric (ECC or RSA)**. The API verifies tokens through JWKS and does not accept the old shared-secret HS256 tokens.
5. **Authentication → Providers → Email**: on. Turn off "Confirm email" for the demo users.

Free Supabase projects pause after a week with no database activity. Step 4 below keeps it active.

### 2. Render (API)

1. <https://render.com> → **New → Blueprint** → connect the GitHub repo. Render reads `render.yaml` at the repo root: Docker image from `apps/api/Dockerfile`, region Singapore, free instance, health check `/api/v1/health`. It generates `LOCAL_JWT_SECRET` (guest tokens are signed with it; without it the API refuses to start).
2. Render asks for the values marked `sync: false`:

| Key | Value |
|---|---|
| `DATABASE_URL` | from Supabase step 2 |
| `SUPABASE_URL` | from Supabase step 3 |
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://vyuh.vercel.app` (put a placeholder now, fix it after step 3) |
| `LLM_ENABLED` | `true` with an OpenRouter key, else `false` (debriefs then use the template) |
| `LLM_API_KEY` | your OpenRouter key, or leave empty |

The image runs migrations and seeds the demo data at start, and listens on Render's `PORT`. Check `https://<service>.onrender.com/api/v1/status` shows API and database `OK`.

On OpenRouter, also set a **credit limit on the key**: it is the hard spend cap. `LLM_DAILY_TOKEN_BUDGET` is the app's own softer limit: over it, debriefs fall back to the template and text-to-scenario says why.

### 3. Vercel (web)

1. <https://vercel.com> → **Add New → Project** → the same repo.
2. **Root Directory** `apps/web`. Framework Next.js. Vercel detects pnpm from the lockfile. Leave "Include files outside the root directory" on (the build reads `packages/*` and `docs/realism-sources.md`).
3. Environment variables:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<service>.onrender.com/api/v1` |
| `NEXT_PUBLIC_AUTH_MODE` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase step 3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase step 3 |
| `NEXT_PUBLIC_GUEST_MODE` | `true` |

4. Deploy, then put the Vercel URL into Render's `CORS_ORIGINS` and into Supabase **Authentication → URL Configuration → Site URL**. `NEXT_PUBLIC_*` values are baked in at build time: after changing one, redeploy.

### 4. UptimeRobot (keeps everything awake)

<https://uptimerobot.com> → **New monitor** → HTTP(s), URL `https://<service>.onrender.com/api/v1/status`, interval **5 minutes**.

Free Render services sleep after 15 minutes without traffic and take about a minute to wake; free Supabase projects pause after a week without database activity. `/status` reads the database, so this one monitor keeps both awake. One always-on free service uses about 720 of Render's 750 free hours a month, so keep only this service on the free plan. If a visitor still lands on a sleeping API, the landing page calls `/health` on load, so it starts waking before the first click.

### 5. Send back for the hosted checks

The Vercel URL and the Render URL. No keys. With those the judge path, the guest flow and the security headers can be checked against the deployed site.

## Security settings already in the code

- Web: CSP, `frame-ancestors 'none'`, HSTS, `nosniff`, referrer and permissions policies (`next.config.ts`); a proxy route guard (a convenience: the API is the boundary).
- API: CORS locked to `CORS_ORIGINS`; body limits (64 KB, event batches 512 KB); rate limits on generate, from-text, debrief, guests and error reports, stored in Postgres; the `X-Vyuh-Test-Debrief` header works only where dev login does, and dev login is off with `ENV=prod`.
- The browser bundle holds only `NEXT_PUBLIC_*` values. The anon key is public by design. The LLM key stays on Render.
