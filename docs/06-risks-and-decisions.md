# SignalX — Contradictions, Gaps, Risks & Open Decisions

Sections A–C describe what I found in the PRD; section D tracks the decisions.

**Status, 31 Aug 2026:** D1, D2, D3 and D9 are locked — see `00-decisions.md`, which is now the authoritative record. The rest proceed on the recommendations below. Section E collects the new risks the locked decisions introduce.

---

## A. Contradictions inside the PRD

**A1. "Not a financial chatbot" (§4) vs Explore (§19).**
§19 is a natural-language Q&A interface, which is a chatbot by any ordinary reading. Resolvable, but only by constraining it deliberately: structured response envelope, citations to real rows, no conversational memory beyond the thread, and a hard "we don't have data on that" path. Left unconstrained, it becomes the product's centre of gravity and drags positioning with it.

**A2. Positioning (§4, §40) vs company-level outputs (§17, §33).** — **resolved by D3.**
§40 forbids "this stock will go up", yet §17 shipped an "Estimated Earnings Pressure" rating per company. The line is now drawn: **describe exposure, do not forecast outcome.** §17's rating is cut from MVP; §33's engines wait for legal review.

**A3. Free tier "delayed data" (§35) vs real-time framing (§16, §21).** — **resolved by D2.**
Delayed/EOD throughout, labelled clearly. §16 becomes an honest end-of-day dashboard. See E3 for what this costs.

**A4. Persistence score is defined but unused.**
§28 defines four scores. §29's ranking formula uses three of them plus Novelty, which §28 never defines. Both need reconciling — see D6.

**A5. Impact is both a 0–100 score and a HIGH/MEDIUM/LOW label.**
§28 says 0–100; §10, §12 and §13 show "HIGH". Also, §12 shows Probability 74% and Confidence 81% as distinct numbers on one card, which most users will not distinguish. Needs one central mapping and probably fewer numbers on screen.

**A6. Signal fields assume every signal is numeric.**
§6 requires current/previous/expected value on every signal. Geopolitical, policy and news-derived signals have no such values. The data model must make these optional rather than universal — the schema in `02` does, but the PRD should say so.

---

## B. Missing requirements

| # | Gap | Why it blocks |
|---|---|---|
| B1 | ~~No consensus-expectations source~~ | **Resolved by D1.** In-house model baseline, labelled as a SignalX estimate, surprise normalised by the model's own error. New risk in E1. |
| B2 | **No news source listed** | §8 puts news/event detection in MVP scope; §23 lists none. |
| B3 | **No signal lifecycle definition** | §11's New/Strengthening/Weakening/Reversed filters need a state machine the PRD never specifies. Proposed in `01` §4. |
| B4 | ~~No curation/admin tooling~~ | **Resolved by D9.** Promoted to a first-class Phase 2 deliverable, designed for review throughput. New risk in E4. |
| B5 | **No data-revision handling** | Indian macro series revise routinely; §36's accuracy metrics are meaningless without point-in-time correctness. Added in `02`. |
| B6 | **No release calendar** | Surprise detection needs to know when CPI is due. Added in `02`. |
| B7 | **"Novelty" undefined** | It is a term in §29's ranking formula with no definition anywhere. |
| B8 | **No alert delivery channel** | §21 defines alert *content* but not email/push/in-app. Recommend email for MVP. |
| B9 | **No LLM cost model** | §35 sells "unlimited AI research" at ₹499/month with no per-user budget. → D5 |
| B10 | ~~No data licensing position~~ | **Resolved by D2.** Licensed EOD vendor with redistribution rights confirmed before signing; no exchange scraping. |
| B11 | **No onboarding** | §10 greets "Vivek" and personalises, but nothing captures interests at signup. |
| B12 | ~~No legal surface~~ | **Partly resolved by D3.** Disclaimer and non-advisory framing move to Phase 0; terms and privacy still to be drafted, and legal review gates the company screen. |
| B13 | **No confidence methodology** | Users are shown "78%" with no stated basis. Numbers of that precision imply calibration the system will not have. |
| B14 | No timezone/market-calendar handling, no accessibility spec, no i18n, no caching/staleness policy | Smaller, but each surfaces during build. |

---

## C. Technical and business risks

**C1. Regulatory — the highest-stakes item. ⚠️ Posture set by D3; the legal question is still open.**
Company-specific analysis distributed to Indian users for investment consideration may fall within SEBI's Research Analyst regulations, and personalised recommendations within the Investment Adviser regulations. I cannot tell you where this product lands, and it is not a question to resolve from a PRD.

D3 reduces exposure by choosing the narrow path — describe exposure, do not forecast outcome — and by enforcing it with a code gate rather than an instruction. **It does not remove the need for counsel.** Legal review still gates §17's company screen in Phase 5 and anything from §33, and should start early enough not to block that phase.

**C2. Causal hallucination.** Mitigated by the Option B architecture (`01` §1), but only if the discipline holds: the LLM must never add an edge at request time. This is the constraint most likely to erode under schedule pressure.

**C3. Cold-start content cost.** An empty graph produces zero signals. Roughly 400 edges and 800 exposures, human-reviewed, is the entry ticket. Under D9 that is ~30 hours of founder time — now budgeted in `05` Phase 2, and the reason the admin panel is built before the drafting job runs. See E4.

**C4. Source fragility.** MOSPI and RBI access is the weakest link (`03`); NSE/BSE scraping is off the table under D2. Each remaining scraper is a maintenance liability that breaks silently. Mitigation: source health monitoring, staleness badges in the UI, and never letting a broken source fail closed into a wrong number.

**C5. Serverless execution limits.** Addressed by Inngest (`01` §3), but it is a real constraint that invalidates the PRD's stated Vercel-Cron-only approach.

**C6. LLM cost at scale.** Narration + verification per signal per day, plus Explore. Needs token budgets, caching, and a cheaper model tier for routine narration.

**C7. False precision.** Displaying 78% confidence when the underlying method is a weighted heuristic is a credibility risk with exactly the sophisticated users this product targets. Recommend bands.

**C8. Supabase + serverless connection pooling.** Use the transaction pooler; a naive client-per-invocation will exhaust connections under cron fan-out.

**C9. Signal quality is unfalsifiable early.** Until `signal_outcomes` has months of history, nobody can prove the signals are good. Instrument from day one so that history starts accumulating at launch, not later.

---

## D. Decisions — status

Four are locked; `00-decisions.md` is the authoritative record and carries the full consequences of each.

| # | Question | Status |
|---|---|---|
| **D1** | Expected-vs-actual without consensus data | **LOCKED** — SignalX model estimate, no consensus purchase |
| **D2** | Market data vendor and latency | **LOCKED** — licensed EOD vendor; Zerodha out; delayed labelling |
| **D3** | Regulatory posture | **LOCKED** — informational/non-advisory; legal review gates company features |
| D4 | Company coverage at launch | proceeding: ~150 deep |
| D5 | Free/Pro tier limits | deferred to Phase 6; gating built, limits configurable |
| D6 | Ranking formula | proceeding: impact × probability × confidence × novelty |
| D7 | Score presentation | proceeding: bands in UI, 0–100 stored |
| D8 | LLM provider | proceeding: abstraction, per-task model choice |
| **D9** | Who curates the graph | **LOCKED** — founder approves, AI drafts, via admin panel |
| D10 | Auth scope | proceeding: email + Google |

D5 interacts with D3: the non-advisory posture thins §35's "advanced company analysis" Pro tier, so pricing should be set after the company screen exists and its real value is visible.

---

## E. New risks introduced by the locked decisions

Each decision is sound. Each also creates something new to watch.

**E1 · Model expectations manufacture false surprises.** *(from D1)*
A seasonal-naive baseline is wrong in predictable ways, and every one of those errors looks like a "surprise" to a detector comparing raw values. Left unmanaged, the app cries wolf at every seasonal turn and users learn to ignore it — which is the exact failure §29 was written to prevent.
*Mitigation, already in the design:* normalise surprise by the model's rolling MAE; gate surprise events on error-normalised thresholds; publish no estimate at all for indicators whose model fails backtest; and weight model-derived surprises lower in the confidence score than a consensus-derived surprise would be.

**E2 · "SignalX estimate" invites a credibility question the product must be ready for.** *(from D1)*
A sophisticated user will ask what the estimate is worth. The answer needs to be visible, not buried: the method, the backtest window, and the historical error, reachable on tap. Handled well this is a trust-builder — showing your error bars is more credible than quoting someone else's consensus. Handled badly it reads as a number invented to fill a slot.

**E3 · EOD data narrows the "why is this moving" feature.** *(from D2)*
§16's driver attribution now explains a close, not a move in progress. Traders (target user B, "need fast identification of emerging market-moving events") get materially less from the market screen than §16 implies.
*Mitigation:* frame the screen honestly as an end-of-day dashboard, and lean the value onto macro/commodity/policy signals, which are not intraday phenomena anyway. Worth knowing that this decision quietly de-prioritises one of the four primary user segments — an acceptable MVP trade, but it should be a conscious one.

**E4 · The founder is now a hard bottleneck on graph growth and graph maintenance.** *(from D9)*
Initial curation is ~30 hours, and that is the easy part: edges also go stale as companies divest and cost structures change. A graph nobody re-reviews degrades silently, and the degradation is invisible until a signal is embarrassingly wrong.
*Mitigation:* `review_due_at` on every edge, a staleness queue in the admin panel, and an explicit re-review cadence. Accept that graph growth is capped by one person's available hours, and let that inform D4's coverage target rather than fighting it.

**E5 · Single-reviewer bias, with no second opinion.** *(from D9)*
Every edge reflects one person's model of the economy. Systematic blind spots become systematic product errors, and nothing in the pipeline detects them.
*Partial mitigation:* the mandatory `mechanism` sentence makes every edge auditable by a future second reviewer, and the adversarial verifier attacks conclusions at runtime. Neither is a substitute for a second curator once the product has traction.

**E6 · The compliance gate can quietly hollow out the product.** *(from D3)*
A gate strict enough to block advice will also block some legitimately useful analysis, and the failure mode is silent: narration gets blander over time and nobody notices. This is why blocked output is logged rather than dropped — the `compliance_flags` queue needs to be read regularly, not just written to.

**E7 · The company screen may be too thin to sell.** *(from D3)*
Exposure disclosure without an assessment is genuinely less compelling than "earnings pressure: HIGH", and §35 sells company analysis on the Pro tier.
*Mitigation:* invest in exposure depth — share of cost base, sourced from filings, with the mechanism spelled out. Validate with real users in Phase 5 before setting Pro pricing under D5. If it does not hold up, the answer is better sourcing, not a return to ratings.

---

## One structural observation

The PRD was unusually clear about *what the product should feel like* and comparatively quiet about *where the intelligence comes from*. Almost everything in this document traced back to that single gap.

D1, D2, D3 and D9 close it. The intelligence now has a stated provenance at every layer: expectations come from a backtested in-house model that admits its error, market data comes from a contract, the causal graph comes from a named human who approved each row, and the language the product uses about companies is bounded by a code gate rather than an intention. That is a defensible answer, and it is the answer the remaining build can be planned against.

What is left open — D4 through D8 and D10 — are tuning decisions. None of them changes the architecture.
