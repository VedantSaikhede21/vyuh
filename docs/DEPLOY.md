# Deploying VYUH

Two builds: **hosted** (Vercel + Render + Supabase) for the judge link, and **offline** (`docker compose up`) for a unit PC or as the demo fallback.

## Offline build

Needs Docker Desktop. The first build needs the internet; after that, none.

```
docker compose up --build
```

Open <http://localhost:3000>, pick a demo account, train. Auth is local, the LLM is off (debriefs use the template), and all terrain is in the images. If port 5432 is taken, run with `POSTGRES_PORT=5433`.

## Hosted build: what to create, in order

You need three accounts: Supabase, Render, Vercel. Everything below is a click or a pasted value; nothing here costs money except the optional Render always-on plan.

### 1. Supabase (database and sign-in)

1. <https://supabase.com> → **New project**. Name `vyuh`, region **Mumbai (ap-south-1)**, a strong database password. Save the password.
2. **Project Settings → Database → Connection string → URI**, mode **Session pooler**. Copy it, put in your password, and change `postgresql://` to `postgresql+psycopg://`. This is `DATABASE_URL`.
3. **Project Settings → API**: copy **Project URL** (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`) and the **anon public** key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. **Project Settings → JWT Keys**: make sure signing is **asymmetric (ECC or RSA)**. The API verifies tokens through JWKS and does not accept the old shared-secret HS256 tokens.
5. **Authentication → Providers → Email**: on. Turn off "Confirm email" for the demo users.

### 2. Render (API)

1. <https://render.com> → **New → Web Service** → connect the GitHub repo.
2. Runtime **Docker**. Dockerfile path `apps/api/Dockerfile`, Docker build context `.` (the repo root).
3. Region **Singapore**. Instance **Starter** ($7/month) for the judging window; see "Cold starts".
4. Environment variables:

| Key | Value |
|---|---|
| `ENV` | `prod` |
| `DATABASE_URL` | from Supabase step 2 |
| `AUTH_MODE` | `supabase` |
| `SUPABASE_URL` | from Supabase step 3 |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` |
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://vyuh.vercel.app` (fill in after step 3) |
| `LLM_ENABLED` | `true` |
| `LLM_PROVIDER` | `openrouter` |
| `LLM_MODEL` | `google/gemini-3.8-flash` |
| `LLM_API_KEY` | your OpenRouter key |
| `LLM_DAILY_TOKEN_BUDGET` | `200000` |
| `GUEST_MODE_ENABLED` | `true` |
| `LOG_LEVEL` | `INFO` |

The image runs migrations and seeds the demo data at start. Check `https://<service>.onrender.com/api/v1/status` shows API and database `OK`.

On OpenRouter, also set a **credit limit on the key**: it is the hard spend cap. `LLM_DAILY_TOKEN_BUDGET` is the app's own softer limit: over it, debriefs fall back to the template and text-to-scenario says why.

### 3. Vercel (web)

1. <https://vercel.com> → **Add New → Project** → the same repo.
2. **Root Directory** `apps/web`. Framework Next.js. Vercel detects pnpm from the lockfile.
3. Environment variables:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<service>.onrender.com/api/v1` |
| `NEXT_PUBLIC_AUTH_MODE` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase step 3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase step 3 |
| `NEXT_PUBLIC_GUEST_MODE` | `true` |

4. Deploy, then put the Vercel URL into Render's `CORS_ORIGINS` and into Supabase **Authentication → URL Configuration → Site URL**.

### 4. Send back for the hosted checks

The Vercel URL and the Render URL. No keys. With those I can run the judge path, the guest flow and the security header checks against the deployed site.

## Cold starts

Render's free tier sleeps after 15 minutes idle and takes 30–60 s to wake. **Recommendation: the Starter plan ($7/month) for the judging window only**, then back to free. It is the cheapest option that is reliable.

The landing page calls `/health` on load, so a sleeping API starts waking before the first click. If you stay on the free tier, also add an external ping every 10 minutes to `/api/v1/health` (UptimeRobot's free plan does this). A ping only delays sleep; it does not remove the risk.

## Security settings already in the code

- Web: CSP, `frame-ancestors 'none'`, HSTS, `nosniff`, referrer and permissions policies (`next.config.ts`); a proxy route guard (a convenience: the API is the boundary).
- API: CORS locked to `CORS_ORIGINS`; body limits (64 KB, event batches 512 KB); rate limits on generate, from-text, debrief, guests and error reports, stored in Postgres; the `X-Vyuh-Test-Debrief` header works only where dev login does, and dev login is off with `ENV=prod`.
- The browser bundle holds only `NEXT_PUBLIC_*` values. The anon key is public by design. The LLM key stays on Render.
