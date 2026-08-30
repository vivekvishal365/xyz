# SignalX

Economic intelligence for India. Detects meaningful changes in economic, commodity, market, weather and policy data, connects them through curated cause-and-effect relationships, and explains what could be affected.

**Status: Phase 0 complete.** Foundation only — there is no data pipeline yet.

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
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run check` | typecheck + lint + test — run before pushing |

---

## Setup still required

These need accounts and credentials, so they could not be done for you.

1. **Create a Supabase project** → copy the URL, anon key, and service-role key into `.env.local`.
2. **Apply the schema**: run `supabase/migrations/20260831000000_initial_schema.sql` in the Supabase SQL editor, or `supabase db push` with the CLI linked to the project.
3. **Enable Google OAuth** in Supabase → Authentication → Providers, and add the redirect URL `<site>/auth/callback`.
4. **Set the Site URL** in Supabase → Authentication → URL Configuration to match `NEXT_PUBLIC_SITE_URL`.
5. **Create the Vercel project**, import the repo, and add the same four env vars.
6. **Push to GitHub** so the CI workflow in `.github/workflows/ci.yml` runs.

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
    env.ts                 §39 secret boundary, schema-validated
    supabase/              client (auth only) + server + service-role
  proxy.ts                 route protection and session refresh
```

### Two rules the tooling enforces

- **`src/lib` may not import React or Next's client runtime.** ESLint fails the build if it does. This keeps the service layer interface-independent so a future React Native client can reuse it (§31).
- **No server secret may reach the client bundle.** CI plants a sentinel value in `SUPABASE_SERVICE_ROLE_KEY`, builds, and greps `.next/static` for it (§39).

---

## Stack

Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres + Auth) · Zod · Vitest · Vercel

The spec named Next.js 15; 16 is the current stable major and this is greenfield. Tailwind is on v4, which is CSS-first — theme tokens live in `src/app/globals.css`, and there is no `tailwind.config.js`.
