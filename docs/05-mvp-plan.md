# SignalX — MVP Development Plan

Ordered by dependency, not by visibility. The PRD's own phasing (§32) is broadly right; this plan differs in three places, each marked **[delta]**.

Reflects the locked decisions in `00-decisions.md` (D1 SignalX estimates, D2 licensed EOD data, D3 non-advisory posture, D9 founder-curated graph).

The three deltas:

- **[delta] The knowledge graph gets its own phase, before any AI work.** §32 folds relationships into "Phase 4 — AI Intelligence", which invites the LLM to invent them. It is content work and needs its own budget.
- **[delta] Signals ship with template-generated text before LLM narration.** If the underlying signals are weak, adding fluent prose only hides it.
- **[delta] An internal admin tool appears early.** §32 never mentions one, but the graph is unmaintainable without it.

---

## Phase 0 — Foundation (approx. 1 week)

Repo, TypeScript strict, Tailwind + shadcn, Supabase project, migrations checked in, Supabase Auth with email + Google, protected app shell with the five-tab navigation (§9), CI running typecheck/lint/test, Vercel preview deploys, environment/secret handling per §39.

Two additions from the locked decisions:
- **Disclaimer and non-advisory framing ship now** (D3), not at launch. It should exist before the first user, and it is ten minutes of work in Phase 0 versus a retrofit later.
- **Start the D2 vendor evaluation in parallel.** Procurement has a lead time that engineering does not; the checklist is in `00-decisions.md`, and criterion 1 (redistribution rights) disqualifies candidates fastest.

**Done when:** a user can sign up, land on an empty Home, and navigate all five tabs.

---

## Phase 1 — Ingestion spine (approx. 1–2 weeks)

The whole vertical slice on the three easiest sources: **FRED**, **Open-Meteo**, and the **licensed EOD market feed** selected under D2.

- Adapter interface + registry; `raw_payloads`, `ingest_runs`, provenance.
- Normalizer, revision handling, indicator registry seeded with ~15 indicators.
- Inngest wiring: cron → enqueue → durable steps, with a health page.
- **`engine/forecast` + the backtest harness** (D1). Built here rather than in Phase 3, because an expectation with no measured error is not usable and the backtest needs history loaded first.
- Indicator detail screen: chart (Recharts) + value/previous + **SignalX estimate with its method and error visible** + **source drawer** (§26: name, publication time, dataset, original value, retrieved time).

**Done when:** a real chart renders from a real API, the source drawer shows genuine provenance, and at least one indicator carries a backtested estimate while at least one correctly shows *no* estimate because its model failed backtest. That second case is the one worth testing — it proves the honesty rule is enforced in code rather than intended in prose.

---

## Phase 2 — The knowledge graph **[delta]** (approx. 2–3 weeks, mostly content)

The phase most likely to be underestimated, and under D9 the one that consumes founder time directly. **Build the admin panel first, then draft, then review** — reviewing 1,200 items through a mediocre UI is how two weeks becomes six.

Target seed:

| Entity | Target |
|---|---|
| indicators | 60–80 (§8's 50–100) |
| sectors | ~25, hierarchical |
| companies | ~150 liquid Indian names |
| causal edges | ~400 approved |
| company exposures | ~800 |

Method, per D9:

1. **Admin panel first** — keyboard-driven review queue, both node contexts on screen, edit-in-place, bulk reject. Details in `04-modules.md`.
2. **`ai/drafting` runs offline**, batched by driver so a review sitting holds one mental context.
3. **Vivek approves every row.** Nothing reaches `status = 'approved'` any other way, and the runtime reads nothing else.

Every edge needs a one-sentence `mechanism`; every exposure needs a `rationale`. The bar: would a competent equity analyst sign their name to this edge?

**Budget this honestly.** ~1,200 items at ~90 seconds each is **~30 hours of focused review**, or 4–6 working days inside the phase. It is the single largest founder-time commitment in the MVP, and it is not compressible by writing more code — only by making each item faster to judge.

**Done when:** the graph answers "crude oil rises → what?" with a defensible chain, every row human-approved, and no LLM anywhere in the request path.

---

## Phase 3 — Detection, scoring, signals **[delta]** (approx. 2 weeks)

Change detection, qualification thresholds, graph traversal, the four scores, the priority formula, signal composition, and the lifecycle state machine.

Signal text at this stage is **deterministic templates**, no LLM.

Ships the Signals feed (§11) with filters, the signal card (§12), and a signal detail screen with a real causal chain, affected sectors and companies.

**Done when:** the feed runs for a week and reads as genuinely useful with zero AI-generated prose. If it does not, the problem is the graph or the thresholds, and no amount of LLM polish will fix it. **This is the real go/no-go gate for the product.**

---

## Phase 4 — AI narration and verification (approx. 1.5 weeks)

`llm` abstraction, structured narration bound to evidence keys, adversarial verifier with veto authority, `ai_analyses` cost accounting, scenarios (§13 base/bull/bear), machine-checkable invalidators.

**`ai/compliance` ships in this phase** (D3), as a code gate rather than a prompt instruction — §27 and §40 are now a regulatory posture, and "we told the model not to" is not a control.

**Done when:** every published signal's prose cites only real evidence rows; a deliberately weak signal gets vetoed by the verifier in testing; and a narration deliberately prompted toward "this stock will rise" is caught by the compliance gate and logged rather than published.

---

## Phase 5 — The product surface (approx. 2–3 weeks)

Home (§10) with the five market-environment scores computed from live signals; Markets (§16), honestly an end-of-day dashboard under D2 — "today's close, and what moved it" — with each driver linking to a signal; Company (§17) and Sector (§18) screens; Watchlist (§20); Alerts (§21) with email delivery; Explore (§19) as tool-calling Q&A with the D3 refusal path; search; settings; PWA manifest and offline shell.

**The company screen under D3.** It ships as a sourced exposure profile plus related signals. §17's "Estimated Earnings Pressure" score is **cut** — describe exposure, do not forecast outcome. The compensating move is to make exposure disclosure genuinely rich: which input, what share of the cost base, sourced from filings. That is factual, defensible, and still not available anywhere else in one place.

**Legal review is scheduled before this phase ships the company screen** — not before launch. It gates whether anything beyond exposure disclosure can appear.

**Done when:** all twelve items of §41's definition of done pass end to end.

---

## Phase 6 — Validation and launch readiness (approx. 1–2 weeks)

Outcome tracking (§36), analytics for the north-star metric (§36), tier gating and quotas (§35), rate limits, legal surfaces (disclaimer, terms, privacy — see the SEBI item in `06`), performance pass (§37 "fast"), accessibility pass, and the daily brief (§34).

---

## Sequencing summary

```
P0 foundation
   └─> P1 ingestion spine ─────────┐
   └─> P2 knowledge graph + admin ─┤
                                   └─> P3 detection + signals  ← GO/NO-GO
                                          └─> P4 AI narration + verification
                                                 └─> P5 product surface
                                                        └─> P6 validation + launch
```

P1 and P2 can run in parallel — one is engineering, the other is mostly content. Everything downstream of P3 depends on P3 being genuinely good.

Rough total: **10–14 weeks** for one full-stack developer.

Two caveats now that D1/D2/D3/D9 are locked:

- **Phase 2's ~30 hours of graph review is founder time and cannot be parallelised** with the founder also writing code. If Vivek is the only developer, Phase 2 is closer to three weeks than two, because the review competes with everything else for the same person.
- **Two external dependencies sit outside the engineering critical path** and should start on day one: the D2 vendor contract, and the D3 legal review that gates the company screen in Phase 5.

---

## Explicitly out of MVP scope

Everything in §33 (global map, causality map, earnings forecast engine, alternative data, scenario simulator, portfolio impact, research agent), real-time market data, mobile-native apps, API tier for customers, Enterprise features, and non-India coverage. The schema supports global coverage; the MVP does not populate it.
