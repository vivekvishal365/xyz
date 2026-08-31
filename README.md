# SignalX

Economic intelligence for India. Detects meaningful changes in economic, commodity, market, weather and policy data, connects them through curated cause-and-effect relationships, and explains what could be affected.

**Status: Phase 1 complete.** ~34,700 real observations across 21 live indicators, each with a backtested SignalX estimate. Durable ingestion pipeline, health monitoring, and the indicator detail screen are all working end to end.

> ⚠️ **Authentication is currently bypassed** when `NEXT_PUBLIC_AUTH_BYPASS=true`. The five tab routes are public and a placeholder user is supplied. Temporary, for UI testing — removal steps are in `src/lib/auth/bypass.ts`.

---

## Documentation

Read these before changing anything structural. `docs/00-decisions.md` overrides the others where they disagree.

| Doc | Contents |
|---|---|
| [`docs/00-decisions.md`](docs/00-decisions.md) | **Locked decisions.** Authoritative. |
| [`docs/01-architecture.md`](docs/01-architecture.md) | System shape, the 13-stage pipeline, stack, security |
| [`docs/02-database-schema.sql`](docs/02-database-schema.sql) | Full DDL with commentary |
| [`docs/03-data-sources.md`](docs/03-data-sources.md) | Adapter pattern, source assessment, app API |
| [`docs/04-modules.md`](docs/04-modules.md) | Module boundaries, scoring formulas |
| [`docs/05-mvp-plan.md`](docs/05-mvp-plan.md) | Phases, estimates, exit criteria |
| [`docs/06-risks-and-decisions.md`](docs/06-risks-and-decisions.md) | Findings, risks, open questions |

### The four constraints that govern everything

1. **Causality is curated data, not LLM output at read time.** The runtime traverses only human-approved `causal_edges`. AI drafts them offline; a human approves every row.
2. **Expectations are SignalX model estimates**, backtested, never presented as analyst consensus.
3. **Market data is licensed and end-of-day.** No exchange scraping.
4. **Non-advisory.** Describe exposure, never forecast outcome about a security. Enforced by a code gate, not a prompt.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in real Supabase values
npm run dev
```

> A `.env.local` with **placeholder** Supabase values is already present so the public pages render immediately. Sign-in will not work until you replace them with a real project's values — see Setup below.

### Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run check` | typecheck + lint + test — run before pushing |
| `npm run db:seed` | Seed countries, sources and the indicator catalogue (idempotent) |
| `npm run ingest` | Run the pipeline for every active indicator |
| `npm run db:summary` | What is actually in the database |
| `npm run verify:fred` | Probe every FRED series against the live API |
| `npm run migrate <file>` | Apply a migration (needs `SUPABASE_DB_URL`) |

### Running the pipeline locally

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Then open http://localhost:8288. `npm run ingest` does the same work without Inngest, which is usually faster for development.

**`INNGEST_DEV=1` must be set locally.** Without it, and without a signing key, the SDK refuses to serve and `/api/inngest` returns a bare 500. In production the reverse holds: unset `INNGEST_DEV` and set both `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, or you get the same 500 and it will look like a broken deploy.

---

## Setup still required

These need accounts and credentials, so they could not be done for you.

1. **Create a Supabase project** → copy the URL, anon key, and service-role key into `.env.local`.
2. **Apply the schema**: run `supabase/migrations/20260831000000_initial_schema.sql` in the Supabase SQL editor, or `supabase db push` with the CLI linked to the project.
3. **Enable Google OAuth** in Supabase → Authentication → Providers, and add the redirect URL `<site>/auth/callback`.
4. **Set the Site URL** in Supabase → Authentication → URL Configuration to match `NEXT_PUBLIC_SITE_URL`.
5. **Create the Vercel project**, import the repo, and add the env vars.
6. **Push to GitHub** so the CI workflow in `.github/workflows/ci.yml` runs.
7. **Create an Inngest app**, point it at `<site>/api/inngest`, and set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` in Vercel. The daily cron lives in code (`src/lib/inngest/functions.ts`), not in Vercel config.

---

## Layout

```
docs/                      the specification — read first
supabase/migrations/       schema, checked in
src/
  app/
    (app)/                 authenticated shell: the five primary tabs
    login/  auth/callback/ authentication
    legal/disclaimer/      D3 non-advisory statement
    api/v1/                the versioned API surface
  components/
    layout/  ui/  auth/
  lib/                     service layer — MUST NOT import React
    core/                  pure domain logic, unit-tested
    auth/                  getAppUser() + the temporary bypass
    env.ts                 §39 secret boundary, schema-validated
    supabase/              client (auth only) + server + service-role
    db/                    repository layer
    ingest/                adapters, normalizer, catalogue, pipeline, health
    engine/forecast/       D1 — methods, backtest, surprise
    indicators/            detail assembly for the UI
    inngest/               durable pipeline: client, events, functions
  proxy.ts                 route protection and session refresh
scripts/                   seed, ingest, verification, migrations
```

### Verification scripts

None of these run in `npm test` — they all make network calls.

- `scripts/smoke-ingest.ts` — the whole spine against live Open-Meteo (no key needed).
- `scripts/verify-fred.ts` — probes every catalogued FRED series. **Run this before changing the seed.** A dead series returns HTTP 400 and is obvious; a *stale* one returns a valid response full of old numbers and nothing errors.
- `scripts/test-revision.ts` — perturbs a stored observation and confirms the provider's real value comes back as a revision, with the prior print preserved and exactly one current row.
- `scripts/db-check.ts` — confirms the schema and RPCs the pipeline depends on exist.

### Two rules the tooling enforces

- **`src/lib` may not import React or Next's client runtime.** ESLint fails the build if it does. This keeps the service layer interface-independent so a future React Native client can reuse it (§31).
- **No server secret may reach the client bundle.** CI plants a sentinel value in `SUPABASE_SERVICE_ROLE_KEY`, builds, and greps `.next/static` for it (§39).

---

## Stack

Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres + Auth) · Zod · Vitest · Vercel

The spec named Next.js 15; 16 is the current stable major and this is greenfield. Tailwind is on v4, which is CSS-first — theme tokens live in `src/app/globals.css`, and there is no `tailwind.config.js`.
