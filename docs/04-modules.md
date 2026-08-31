# SignalX — Core Modules

One Next.js application, hard internal boundaries. The rule that keeps §31 (interface independence) true: **nothing under `lib/` may import React.**

```
app/
  (marketing)/                     landing, pricing
  (app)/
    home/  signals/  markets/  explore/  watchlist/
    signals/[slug]/  companies/[slug]/  sectors/[slug]/
    indicators/[slug]/  macro/  alerts/  settings/
  admin/                           curation UI — internal only, role-gated
  api/v1/...                       thin controllers over lib/
  api/internal/...                 pipeline triggers, service auth

lib/
  core/          domain types, enums, scoring, units, date/period maths
  db/            typed queries; the ONLY place SQL lives
  ingest/        adapters/, normalize, revisions, provenance
  engine/        forecast, detect, qualify, graph, score, lifecycle, compose
  ai/            llm client, narrate, verify, explore, brief, prompts
                 compliance/  (D3 gate)   drafting/  (D9 offline)
  alerts/        rule matching, dedupe, delivery
  market-env/    the five composite scores
  analytics/     event capture, north-star metric
  validation/    outcome tracking

components/      ui/ (shadcn), charts/, signal/, layout/
```

---

## Module notes

### `core` — the pure centre
Types, enums, unit handling, period arithmetic, and **all scoring formulas**. No I/O, no async, 100% unit-tested. If a score can't be recomputed from a signal's stored inputs, it isn't in this module.

### `ingest`
Adapter registry, fetch/hash/store, normalization, revision detection. Never interprets. Its contract: given a source and a window, produce observations plus an audit trail (`03-data-sources.md` §1).

### `engine/forecast` — the expectation baseline **(D1)** — *built, Phase 1*
Four methods per indicator — `naive`, `seasonal_naive`, `drift`, `seasonal_naive_drift` — producing the "expected" value §14 needs without buying consensus data. Three rules keep it honest:

- **Backtest before trust.** A weekly job walks each indicator's history, records MAE and RMSE, and compares against the dumbest baseline (last value). A model that cannot beat that has no business producing a user-visible number; `is_trusted` stays false and the indicator shows **no estimate at all**.
- **Store the error with the estimate.** `expectations.error_mae` snapshots the model's rolling error at the time the estimate was made, which is what makes surprise interpretable later.
- **Never call it consensus.** The word "Expected" alone is banned in UI copy; it is a *SignalX estimate*, with the method reachable on tap.

Two things the build surfaced that were not obvious from the spec:

- **Methods must be scored over an identical window.** Each has a different minimum history, so scoring each from its own earliest possible origin compares one method's performance on a hard stretch against another's on an easier one. `selectBestMethod` evaluates every candidate from a common start.
- **The `naive` baseline has to be selectable, not only a benchmark.** Comparing it against itself is tautological, so it could never qualify — which would leave every series where nothing beats a random walk with no estimate at all. That is most financial series, and it would gut §14. Carrying the last value forward is defensible when labelled honestly, and its MAE — the typical period-on-period move — is the right yardstick for "was this change unusual?". Every *other* method must still beat it.

### `engine/detect` — statistics, no LLM
MoM/YoY, rolling z-score, trend break, threshold crossing, seasonality-adjusted deviation, surprise vs estimate. Config per indicator (`indicators.detection_config`) so thresholds are tuned, not global guesses.

**Surprise is normalised by the model's own error** (D1): `surprise_score = (actual − expected) / model_mae`. Raw percentage-point surprises against a naive baseline fire at every seasonal turn, and an app that cries wolf twelve times a year is worse than one with no surprise feature. Surprises from a model baseline also contribute **less** confidence than a consensus-derived surprise would — recorded in the scoring formula, not hand-waved.

### `engine/qualify`
Turns candidates into events. The noise gate. Deliberately conservative — §29's whole point is that the app must not become a news feed.

### `engine/graph`
Recursive-CTE traversal over approved `causal_edges`, bounded depth ≤4, cycle-cut, path scoring with decay. Also serves the clickable chain payload for §13 and answers "what connects A to B" for Explore.

### `engine/score` — the four scores (§28)

Deterministic and explainable. Proposed formulas, all producing 0–100:

```
impact       = f(magnitude vs historical distribution,
                 breadth of affected nodes weighted by economic size,
                 edge strengths along the resolved chain)

probability  = f(edge confidences along the chain,
                 historical hit-rate of similar chains,
                 corroborating source count)

confidence   = f(source reliability, evidence count, evidence agreement,
                 data recency, revision risk)
               ── reduced by contradicting evidence, and hard-capped by the
                  verifier's verdict

persistence  = f(structural vs transient classification, expected lag,
                 mean-reversion tendency of the driver)

novelty      = decays from 100 as similar signals recur in a trailing window

priority     = (impact × probability × confidence × novelty) / 10^6     [§29]
```

Two design rules attached to this module:

1. **Every score stores its inputs.** A user tapping "68/100" should be able to see what produced it. Scores nobody can interrogate are decoration.
2. **Display bands, not fake precision.** Store 0–100 internally; render Impact as HIGH/MEDIUM/LOW and confidence in bands. "Confidence: 78%" (§10) implies a calibration this system will not have on day one. Reconcile the band boundaries once, centrally — §10 and §12 show percentages while §28 defines 0–100 and §12 also shows "HIGH".

### `engine/lifecycle`
The state machine (`01-architecture.md` §4). Re-evaluates live signals each cycle, writes `signal_state_history`, checks `signal_invalidators` against fresh observations, expires stale signals. This module is what makes §5's MONITOR real and powers §11's filters.

### `ai/narrate` and `ai/verify`
Structured in, structured out. Narration receives the resolved chain and the numbered evidence list, and may cite only those keys. Verification runs §22 Stage 8's five questions with authority to downgrade or veto. Both log to `ai_analyses` with token cost.

### `ai/explore`
Tool-calling over the app's own read API (`03` §4). Hard-capped tool-call depth, per-tier quotas, full transcript stored. Under D3 it also needs an explicit **refusal path**: "should I buy X", "what's your target price", "how much should I allocate" are redirected to the drivers behind the question rather than answered.

### `ai/compliance` — the D3 gate
A deterministic check on every generated string before it can reach a user: narration, Explore answers, alerts, the daily brief. Two layers — a fast banned-pattern pass, then a classifier for phrasing that slips past. Blocks price predictions, buy/sell/hold framing, target prices, and the vocabulary of recommendation.

Blocked output is **logged to `compliance_flags` for review, never silently dropped**; a rising block rate means the narration prompt has drifted and needs attention.

This is a code gate, not a prompt instruction. Prompts ask; gates enforce. The distinction matters because §40's constraint is now also a regulatory posture, and "we told the model not to" is not a control.

### `ai/drafting` — offline graph proposals **(D9)** — *built, Phase 2* (`src/lib/graph/drafting.ts`)
Generates candidate edges and exposures in batches, each carrying a mechanism sentence, suggested polarity/strength/lag/confidence, and a citation or stated basis. Writes rows as `status = 'draft'`, `proposed_by = 'ai'`, tagged with a `draft_batch_id`.

Runs offline, never on a request path, and produces nothing a user can see. Batch by driver — all edges from "crude oil" in one run — so the reviewer holds context across a sitting instead of context-switching every item.

### `alerts`
Rule matching on publish and on state transitions, dedupe by `(user, signal, transition)`, quiet hours in the user's timezone, delivery via email for MVP. Push comes later — installed-PWA push has real platform limits, so email is the reliable first channel.

### `market-env`
Computes §10's five scores from live signals, stores a daily row with its inputs so the number is explainable. Explicitly **not** hand-entered — §10 requires this.

### `validation`
Evaluates matured signals into `signal_outcomes`. Feeds §36's intelligence metrics and, eventually, learned edge weights.

### `admin` — the module the PRD omits, promoted by D9 — *built, Phase 2*
Since the founder personally approves every edge and exposure, this stops being a convenience and becomes **the tool that determines whether Phase 2 takes two weeks or six**. Design it for review throughput, not feature completeness.

The review queue is the centre of it:

- **Keyboard-first.** Approve, reject, edit-then-approve, skip — all single keys. A mouse round-trip per item costs hours across 1,200 items.
- **Both node contexts on screen.** The reviewer must never open a second tab to judge an edge.
- **Batch framing.** Work one `draft_batch_id` at a time with a running count, so a sitting has a visible end.
- **Bulk reject** for a batch that has clearly gone wrong, with the reason recorded against the batch.
- **Edit in place.** Most AI-drafted edges will be directionally right with a wrong strength or lag; making that correction two keystrokes rather than a form submission is most of the throughput win.

Also: exposure editor, indicator registry management, signal preview and veto queue, staleness review (`review_due_at`), the `compliance_flags` queue, and pipeline health.

**The budget this implies.** ~400 edges + ~800 exposures ≈ 1,200 items. At roughly 90 seconds each that is **~30 hours of focused review** — 4–6 working days inside Phase 2. Every second shaved off the median item is worth about 20 minutes of the founder's time.
