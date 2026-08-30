# SignalX — Technical Architecture

Status: proposal for review. Nothing is built yet.
Decisions D1, D2, D3 and D9 are locked — see `00-decisions.md`, which overrides this document where they disagree.
Companion docs: `02-database-schema.sql`, `03-data-sources.md`, `04-modules.md`, `05-mvp-plan.md`, `06-risks-and-decisions.md`.

---

## 1. The central architectural decision

The PRD describes an engine that connects events causally (§22 Stage 5, §13 Causal Chain). It never says **where the causal relationships come from**. There are two possible answers and they produce completely different products.

**Option A — the LLM generates causality at read time.** For each new data point, ask the model "what does this affect?" and render the answer. Cheap to build, impossible to verify, non-reproducible (same input, different chain each run), and it will confidently invent relationships. It also contradicts §26 ("The AI must never invent a data source") and §27 ("distinguish correlation from causation").

**Option B — causality is curated data; the LLM only narrates it.** The relationships live in the database as a versioned, reviewed graph. The engine traverses that graph deterministically. The LLM's only jobs are (a) turning a resolved structure into readable prose, and (b) adversarially attacking it (§22 Stage 8).

**This architecture assumes Option B.** It is the difference between an intelligence product and a plausible-text generator, and it is why the schema treats `causal_edges` and `exposures` as first-class curated tables.

The consequence, which should be understood before committing: **the causal graph is the product's moat and its largest hidden cost.** It is content work, not engineering work. `05-mvp-plan.md` budgets a phase for it explicitly.

**How D9 fits.** An offline LLM job drafts candidate edges and a human approves them. That is not Option A smuggled back in: the drafting happens outside the request path, every row passes a human gate, and the runtime only ever traverses `status = 'approved'`. AI proposes, a human disposes, and nothing unapproved is ever read at serve time.

---

## 2. System shape

```
CLIENTS        Next.js web / PWA            (later: React Native, API tier)
                        |
                        |  HTTP  /api/v1/*   versioned, authed, rate-limited
                        v
SERVICE LAYER  pure TypeScript, no React imports
               signals - indicators - companies - sectors - markets
               explore - watchlists - alerts - brief
                        |
                        v
PIPELINE       async, queue-driven, idempotent
               fetch -> normalize -> forecast -> detect -> qualify ->
               traverse -> score -> compose -> narrate(LLM) ->
               verify(LLM) -> comply -> publish -> monitor
                        |
                        v
DATA           Supabase Postgres
               facts (observations) - knowledge (graph) - outputs (signals)
               provenance (raw payloads, ingest runs) - users
```

The stages map onto PRD §22, with four additions: **forecast** (D1 — the expected value has to be produced, not bought), **qualify** (does a detected change deserve to be an event at all), **comply** (D3 — a hard gate on generated language), and **monitor** (§5 requires it; §22 omits it).

Cadence follows D2: market-derived work runs on a daily post-close cycle, not intraday.

---

## 3. Stack

| Layer | Choice | Note |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | as PRD |
| UI | Tailwind + shadcn/ui + Recharts | as PRD |
| DB | Supabase Postgres (+ `pgvector`) | as PRD |
| Auth | Supabase Auth | as PRD |
| Hosting | Vercel | as PRD |
| **Job orchestration** | **Inngest** (or Trigger.dev) | **delta — see below** |
| **Market data** | **licensed EOD vendor, TBD** | **D2 locked. Zerodha is out. Selection criteria in `00`** |
| LLM | provider-abstracted `llm` module | see §6 |
| Email | Resend | not specified in PRD |
| Validation | Zod at every boundary | — |
| Migrations | plain SQL via Supabase CLI, checked in | — |
| Testing | Vitest (unit), Playwright (smoke) | — |

### Why not Vercel Cron alone (delta from §30)

PRD §30 specifies Vercel Cron. It is fine as a *trigger* and wrong as a *runtime*:

- Serverless functions have a hard execution ceiling measured in minutes. Ingesting 50–100 indicators across a dozen unreliable government sources, then running LLM narration plus verification per signal, will exceed it.
- No durable retries. A ministry site returns 502 at 06:00 and that indicator is silently missing for the day.
- No fan-out, no concurrency control, no per-step observability. Debugging an eleven-stage pipeline from function logs is miserable.

**Recommendation:** Vercel Cron fires a thin enqueue endpoint; **Inngest** runs the pipeline as durable step functions with retries, concurrency limits, and per-step replay. It deploys as ordinary Next.js routes, so it adds no infrastructure to operate.

Every stage must be **idempotent and keyed** (`ingest_run_id`, natural keys on observations) so replays are safe.

---

## 4. The pipeline, stage by stage

**[1] Fetch.** One adapter per source behind a common interface. Writes the untouched response body to `raw_payloads` with a content hash *before* anything parses it. Never overwritten: provenance (§26) and point-in-time correctness both depend on the raw record surviving.

**[2] Normalize.** Adapter-specific parse into canonical `indicator_observations`. Two timestamps that must never be conflated: `period_end` (what the number describes) and `released_at` (when the world learned it). Revisions land in `observation_revisions` rather than mutating history — Indian macro series are revised routinely, and §36's accuracy metrics are meaningless if history silently changes underneath them.

**[3] Forecast.** *(D1)* Produces the expected value §14 needs, since no consensus data is being bought. A baseline model per indicator — seasonal naive plus drift — with two non-negotiable properties: it is **backtested before it is trusted**, and its rolling error is stored alongside the estimate. An indicator whose model fails backtest publishes **no estimate**, rather than a bad one. Everything downstream and every pixel of UI calls this a *SignalX estimate*, never a consensus or a plain "Expected".

**[4] Detect.** Pure functions over a series, no LLM: MoM/YoY change, z-score against a rolling window, trend break, seasonality-adjusted deviation, threshold crossing, and surprise-vs-estimate. Produces `candidate_events` carrying a magnitude and a statistical descriptor.

Surprise is measured **in units of the model's own historical error**, not raw percentage points. A naive baseline manufactures a "surprise" at every seasonal turn; normalising by the model's rolling MAE is what stops the app crying wolf twelve times a year.

**[5] Qualify.** Most detected changes are noise. A rule and threshold layer per indicator class decides whether a candidate becomes an `event`. This is the layer that keeps the app from becoming "a feed of meaningless news" (§29), and it should be tuned against real data before any LLM is wired up.

**[6] Traverse.** Walk approved `causal_edges` from the event's node, bounded depth (≤4 for MVP), accumulating a path score that decays with depth and edge confidence. Cycles detected and cut. This produces §13's causal chain as *data* — the visual graph is a rendering of it, and every node is clickable because every node is a real row.

Postgres recursive CTEs handle this comfortably at MVP scale. **Do not add a graph database.**

**[7] Score.** Deterministic formulas producing §28's four scores (impact, probability, confidence, persistence) plus a novelty term feeding §29's ranking. Formulas live in one pure, unit-tested module so scores are reproducible and explainable — see the false-precision risk in `06`.

**[8] Compose.** Assemble `signal` + `signal_impacts` + `signal_evidence`. Evidence rows are foreign keys to actual observations and documents. **Prose cannot cite anything that is not already an evidence row.**

**[9] Narrate (LLM).** Structured JSON in, prose out, with citation markers bound to evidence IDs. The model receives the resolved chain and is told to explain it, never to extend it. Output is schema-validated; a response referencing an unknown evidence ID is rejected and retried.

**[10] Verify (LLM).** A second, adversarial pass implementing §22 Stage 8, ideally on a different model than the narrator to avoid shared blind spots. It has authority to **downgrade confidence or veto publication**, and its verdict is stored. A verifier that can only comment is theatre.

**[11] Comply.** *(D3)* A deterministic gate on every generated string before it can reach a user — narration, Explore answers, alerts, the daily brief. It blocks price predictions, buy/sell/hold framing, target prices, and the vocabulary of recommendation ("recommend", "should invest", "guaranteed", "multibagger"). Two layers: a fast banned-pattern check, then a classifier pass for the cases phrasing slips past. Blocked output is **logged for review, never silently dropped** — a rising block rate is a signal that the narration prompt has drifted.

This is a code gate, not a prompt instruction. Prompts ask; gates enforce.

**[12] Publish.** Signal enters `active` state and becomes visible.

**[13] Monitor.** Each cycle re-evaluates live signals against fresh data and transitions state — the state machine §11's `New / Strengthening / Weakening / Reversed` filters require but the PRD never defines:

```
new ──> active ──> strengthening ──┐
          │                        ├──> expired ──> archived
          ├──> weakening ──────────┘
          ├──> reversed
          └──> invalidated   (a §13 invalidation condition fired)
```

`invalidated` is distinct and important. §13 makes "what would invalidate this" mandatory, so those conditions must be **machine-checkable** where possible (`brent < 72`, `CPI prints below 5.0`) and stored as rows, not prose. That turns the section from a disclaimer into a working feature and gives the monitor loop something to evaluate.

---

## 5. Interface independence (§31)

PRD §31 requires backend logic to stay independent of the interface. Two rules enforce it:

1. **The service layer never imports React.** All domain logic sits in `lib/` as plain TypeScript. Server Components may call it directly; API routes are thin controllers over the same functions. A future React Native app consumes `/api/v1` with no backend change.
2. **The browser never talks to Supabase directly for content.** All reads go through `/api/v1`. RLS then only has to cover user-owned tables, and rate limiting plus tier gating (§35) are enforceable in one place, satisfying §39's Frontend → Backend → Providers rule. Trade-off: no Supabase Realtime in the client for MVP. Polling is adequate at this product's cadence.

---

## 6. LLM layer

The PRD names OpenAI (§23, §30) and "GPT" (§22). Treat that as a default rather than a constraint, and define a provider-agnostic `llm` interface (`complete`, `completeStructured`, `embed`) with one adapter per provider. Narration and verification are the app's largest variable cost, the verifier wants a different model than the narrator, and provider pricing moves quickly — all three argue for the abstraction.

Requirements on that layer regardless of vendor:

- **Structured output / JSON schema enforcement**, never prose parsing.
- **Prompt caching** for the large static context (graph definitions, style rules, disclaimers).
- **Full cost accounting** — every call writes tokens and cost to `ai_analyses`, keyed to a user or a system job. §35 offers "unlimited AI research" at ₹499/month; without per-user token budgets that tier is a margin hole.
- **No web browsing at answer time.** Explore (§19) answers from the database through tool-calls against your own API. That is what makes citations real.
- **The compliance gate runs on LLM output, always** (D3). Explore additionally needs an explicit refusal path: advice-seeking questions ("should I buy X") are redirected to the drivers behind the question rather than answered.

Two distinct LLM workloads, easy to confuse: **runtime** narration and verification, which the compliance gate covers, and the **offline graph-drafting job** (D9), which never reaches a user directly because every row it produces waits for human approval.

---

## 7. Security (§39)

- Keys server-side only; no provider key reaches a client bundle. Add a CI check that greps the built client bundle for key patterns.
- Supabase **service-role key only in server routes**; anon key restricted to auth flows.
- RLS default-deny on every user-owned table (`profiles`, `watchlists`, `watchlist_items`, `alert_rules`, `alerts`, `user_events`).
- Rate limits per tier at the API edge keyed by user ID, with a separate stricter limit on `/explore` because of LLM cost.
- `audit_log` on all curation writes — the causal graph is editable content, and editing it changes what users are told.
- Verify Inngest webhook signatures; no unauthenticated pipeline triggers.

---

## 8. What this architecture deliberately does not do yet

- No microservices. One Next.js app with strong internal module boundaries.
- No graph database, no Kafka, no separate Python service. Postgres, recursive CTEs and TypeScript cover MVP scale.
- No real-time streaming market data — a licensing question before a technical one (`03`).
- No model training. Scoring is formulas, the graph is curated. Learned weights come only after `signal_outcomes` accumulates real history (§32 Phase 6).
