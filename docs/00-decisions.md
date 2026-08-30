# SignalX — Decision Log

Locked decisions carry a date and are binding on the specs. Anything here overrides the earlier documents where they disagree.

---

## Locked — 31 Aug 2026

### D1 · Expectations come from a SignalX model, not consensus
No consensus data purchased for MVP. Expected values are computed by an in-house baseline forecast and **labelled as SignalX estimates everywhere they appear**. `expectations.basis = 'model'`.

**Consequences**
- New module `engine/forecast` (seasonal naive + drift baseline per indicator).
- Every indicator's model is **backtested before it is trusted**; rolling MAE is stored.
- Surprise is measured in units of the model's own historical error, not raw percentage points — otherwise a naive baseline manufactures a "surprise" at every seasonal turn.
- An indicator whose model fails backtest shows **no estimate at all**, rather than a bad one.
- Model-derived surprises carry a lower confidence contribution than a consensus-derived surprise would. This is recorded in the scoring formula, not hand-waved.
- UI copy: never the bare word "Expected". Always "SignalX estimate" with the method reachable on tap.

---

### D2 · Licensed EOD market data. Zerodha is out.
Kite Connect is not used for redistribution. Market data comes from a licensed vendor on an end-of-day basis; everything is labelled delayed.

**Consequences**
- NSE/BSE scraping is removed from the plan entirely.
- Vendor selection becomes a Phase 1 procurement task with explicit criteria (below).
- The Markets screen <span>§16</span> is honestly an end-of-day dashboard: "today's close, and what moved it" — not a live terminal.
- Market environment scores and signal re-evaluation run on a daily post-close cycle.
- The vendor sits behind the same `SourceAdapter` interface as everything else, so a vendor swap is one file.

**Vendor selection criteria** — all must be confirmed in writing before signing:
1. **Redistribution rights to end users** on the intended tiers. This is the criterion that disqualified Kite; check it first, not last.
2. NSE + BSE equities, split/bonus-adjusted, with corporate actions.
3. Indices: NIFTY 50, SENSEX, and sector indices <span>§16</span>.
4. USD/INR and the commodity set in §7.3.
5. History depth ≥ 10 years (detection needs a distribution to compare against).
6. Attribution and "delayed" labelling requirements — these become UI requirements.
7. Cost at MVP scale, and how it scales with user count.

Still unresolved and tracked separately: corporate results/filings <span>§7.8</span> and FII/DII flows <span>§7.10</span>. Some vendors bundle fundamentals — fold this into the same evaluation.

---

### D3 · Informational, non-advisory posture
No company-level investment recommendations in MVP. Legal review gates the company-specific earnings and portfolio features.

**The line this draws: describe exposure, do not forecast outcome.**

| Kept for MVP | Deferred behind legal review |
|---|---|
| Company **exposure** to a driver — which input, which direction, why, sourced from filings | Company-level **"Estimated Earnings Pressure: High/Med/Low"** <span>§17</span> |
| "Aviation fuel is ~X% of an airline's cost base" (factual, cited) | "This company's earnings will come under pressure" (a forecast about a security) |
| Sector-level outlook framed as driver conditions | Per-company impact magnitude presented as an earnings estimate |
| Direction of a mechanical linkage (crude up → fuel cost up) | §33 earnings forecast engine, portfolio impact |

**Consequences**
- §17's "Estimated Earnings Pressure" score is **cut from MVP**. The company screen ships as a sourced exposure profile plus related signals.
- §13's "Affected Companies" keeps direction and the reason, and expresses magnitude as **exposure magnitude** (a property of the company's cost structure) rather than estimated earnings impact.
- New module `ai/compliance`: a deterministic pre-publish check on every generated string. Blocks price predictions, buy/sell/hold framing, target prices, "recommend", "should invest", "guaranteed", "multibagger". Runs on narration, Explore answers, alerts and the daily brief. Blocked output is logged, not silently dropped.
- Explore <span>§19</span> gets an explicit refusal path for advice-seeking questions, which redirects to the underlying drivers.
- Disclaimer moves to **Phase 0** — it should exist before the first user, not before launch.
- Legal review is scheduled before Phase 5 ships the company screen, not before launch.

**Accepted trade-off:** this removes the sharpest company-level output, and §35's "advanced company analysis" Pro tier gets thinner as a result. The mitigation is to make exposure disclosure genuinely rich and well-sourced — which is defensible, differentiated, and still not available anywhere else in one place. Revisit when D5 pricing is set.

---

### D9 · Founder-curated graph, AI-drafted
An offline LLM job proposes edges and exposures; **Vivek personally approves every one** through an admin panel. Nothing unapproved is ever traversed at runtime.

This is not a retreat from the Option B architecture — it is what makes it work. AI proposes, a human disposes, and the runtime only ever reads approved rows.

**Consequences**
- The admin panel is promoted from a side task to a **first-class Phase 2 deliverable**, designed for review throughput rather than completeness.
- Drafting job produces, per proposed edge: mechanism sentence, suggested polarity/strength/lag/confidence, and a citation or stated basis. Batched by driver so the reviewer holds context across a run.
- Schema gains draft provenance: `proposed_by`, `draft_batch_id`, `review_notes`, `rejection_reason`.
- **Review is budgeted work.** ~400 edges + ~800 exposures ≈ 1,200 items. At roughly 90 seconds each, that is **~30 hours of focused review** — call it 4–6 working days inside Phase 2's 2–3 week window. The admin UI's job is to drive that number down: keyboard-first approve/reject, bulk actions on a batch, and both node contexts on screen so no tab-switching is needed.
- Edges get `review_due_at`. Exposures go stale — companies divest, cost structures change — and a graph nobody re-reviews degrades silently.

**Known risk accepted:** single-reviewer bias, and the founder as the bottleneck on graph growth. Mitigated only partly by requiring a written `mechanism` on every edge so a second reviewer can audit later.

---

## Working defaults — not locked, proceeding anyway

You said this is enough to move forward, so I am proceeding on my earlier recommendations for the rest. Each is cheap to change later; none blocks Phase 1. Say the word on any of them and I will adjust.

| # | Question | Proceeding with |
|---|---|---|
| D4 | Company coverage at launch | ~150 companies, deep and reviewed, over ~500 thin |
| D5 | Free/Pro tier limits | Deferred to Phase 6; API tier-gating built but limits left configurable |
| D6 | Ranking formula | `impact × probability × confidence × novelty`; persistence drives expiry, not rank; novelty decays over a 14-day similarity window |
| D7 | Score presentation | Bands in the UI, 0–100 stored, inputs revealed on tap |
| D8 | LLM provider | Provider abstraction; strong model for verification and graph drafting, cheaper model for routine narration; verifier on a different model than the narrator |
| D10 | Auth scope | Email + Google |

D5 interacts with D3 — the non-advisory posture thins the Pro tier's company analysis, so pricing should be set after the company screen exists and its real value is visible.
