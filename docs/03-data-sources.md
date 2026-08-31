# SignalX — Data Source & API Architecture

Two halves: **inbound** (getting the world's data in) and **outbound** (serving it to clients).

> **Accuracy note.** Access terms, rate limits and pricing for the sources below change often, and several Indian government endpoints are undocumented. Everything marked ⚠️ needs to be confirmed against the provider's current terms before it is designed around. Do not treat this table as verified fact.

---

## 1. Inbound: the adapter pattern

Every source implements one interface, and every indicator row in the DB points at an adapter plus a series code. **Adding an indicator becomes data entry, not code.** That is the only way 50–100 indicators (§8) is realistic.

```ts
interface SourceAdapter {
  id: string;                                    // 'fred'
  fetch(ctx: FetchContext): Promise<RawPayload[]>;
  parse(raw: RawPayload, ind: Indicator): Observation[];
  defaultSchedule: string;                       // cron
  rateLimit: { perMinute: number };
}
```

Adapters are dumb: fetch, hash, store, parse. No business logic, no interpretation. A new source is one file plus rows in `sources` and `indicators`.

---

## 2. Source-by-source assessment

### Tier 1 — reliable, build on these first

| Source | Access | Covers | Reality check |
|---|---|---|---|
| **FRED** (St. Louis Fed) | free API key, documented, stable | global macro, US rates, commodities | **Verified live 31 Aug 2026: 18 of 19 catalogued series current and ingesting.** But see the India CPI finding below — the India relays are worse than "lagging". |
| **Open-Meteo** | free, no key | rainfall, temperature, forecast + ERA5 historical archive | Genuinely good, no auth friction. See the monsoon caveat below. |
| **World Bank** | open, no key | long-run development series | Annual, heavily lagged. Useful for historical context panels, **nearly useless for "what changed"**. Low priority. |

### Tier 2 — usable with real effort

| Source | Access | Reality check |
|---|---|---|
| **data.gov.in** | API key ⚠️ | Coverage is uneven and inconsistent between datasets; many "APIs" are static file dumps with per-dataset schemas. Budget per-dataset work, not one adapter. |
| **IMF** | SDMX-style, no key ⚠️ | Documentation is thin and the service has a reputation for instability. Fallback, not foundation. |
| **PIB / RBI press releases / ministry RSS** | public web | The cheapest real path to policy & event detection. RSS and press-release pages are more stable than data portals. |
| **GDELT** | free, bulk | Broad global event/news coverage. Extremely noisy — needs hard filtering before it is useful. Good for geopolitics breadth. |

### Tier 3 — flagged, do not assume these work

| Source | The problem |
|---|---|
| **MOSPI** (CPI, IIP) | ⚠️ Headline releases are published largely as PDFs/press releases rather than through a clean public API. Getting CPI and IIP reliably likely means PDF/HTML parsing on a schedule — fragile, and it breaks whenever the layout changes. **These are two of the most important indicators in the product**, so this is a real cost centre, not a footnote. |
| **RBI** | ⚠️ The DBIE database publishes largely as HTML/XLS downloads; no official public REST API that I'd rely on. Scraping is fragile and raises terms-of-use questions. |
| ~~**NSE / BSE** scraping~~ | **Removed by D2.** Session-gated, blocks datacenter IPs, and exchange terms restrict scraping and redistribution. Not attempted. |
| ~~**Zerodha / Kite Connect**~~ | **Removed by D2.** Not used for redistribution. |

### The monsoon gap (worth calling out separately)

Open-Meteo gives point rainfall. The Indian agricultural signal that actually matters is **rainfall departure from the Long Period Average, by subdivision** — which is an IMD product without a clean public API. ⚠️

Practical answer: derive your own climatology from Open-Meteo's ERA5 historical archive (30-year mean per grid cell per week), aggregate to agri regions, and compute departure yourself. Label it as a SignalX-computed departure, not an IMD figure. This is a good, honest workaround — but it is a build item nobody has costed yet.

### Market data — settled by D2

Licensed EOD vendor. Everything labelled delayed. Real-time is a post-MVP, post-licensing conversation. This product's edge is causal explanation, not tick speed, and nothing in §41's definition of done requires live prices.

Candidates to price (all ⚠️ verify India coverage and, first, redistribution rights): Financial Modeling Prep, Twelve Data, Marketstack, TrueData, Global Datafeeds.

**Evaluation checklist — confirm in writing before signing.** Criterion 1 is the one that disqualified Kite, so check it first rather than last.

1. **Redistribution rights to end users** on the intended tiers.
2. NSE + BSE equities, split/bonus-adjusted, with corporate actions.
3. Indices: NIFTY 50, SENSEX, sector indices <span>§16</span>.
4. USD/INR plus the commodity set in §7.3.
5. History depth ≥ 10 years — detection needs a distribution to compare against, and a vendor with two years of history quietly breaks the z-score layer.
6. Attribution and delayed-labelling requirements, which become UI requirements.
7. Cost at MVP scale and how it scales with user count.

Whichever vendor wins sits behind the same `SourceAdapter` interface as everything else, so a later swap is one file.

---

### ⚠️ India CPI is not available from FRED — found in live verification

Confirmed against the live API on 31 Aug 2026, and worse than the general "FRED lags for India" caveat implied.

**Every monthly India CPI series on FRED stopped updating in March 2025.** `INDCPIALLMINMEI` and `CPALTT01INM659N` both end there — 518 days stale — because the OECD feed behind them stopped. Quarterly and annual variants are staler still, and FRED search returns no live monthly alternative.

This is the single most important indicator in the product. The worked example in PRD §2 terminates in inflation, and §15 leads with it.

`india-cpi` is therefore **seeded as inactive**, with the reason recorded on the row, so the gap is visible in the registry rather than silently absent or — worse — silently stale. It needs MOSPI directly or a vendor; fold it into the D2 evaluation, since several vendors bundle Indian macro.

Other India series were replaced with live equivalents during the same pass: 10-year yield is `INDIRLTLT01STM` (`IRLTLT01INM156N` returns HTTP 400), real GDP is `INDGDPRQPSMEI`, industrial production is `INDPRINTO01GYSAM`. Call money rate, 3-month interbank and REER were added as live RBI-adjacent proxies.

**Standing lesson.** A *dead* FRED series returns HTTP 400 and is obvious. A *stale* one returns a perfectly valid response full of old numbers, and nothing errors. The second is the dangerous failure, and it is why `npm run verify:fred` judges every series against its own expected release lag rather than a global cutoff. Run it before any seed change.

## 3. Missing sources the PRD needs but does not list

1. **News / text feed.** §8 puts "news/event detection" in MVP scope; §23 lists no news source at all. Recommendation: official RSS (PIB, RBI, ministries) + GDELT for MVP; a paid news API only if that proves insufficient.
2. ~~**Consensus expectations.**~~ **Settled by D1** — not purchased. Expectations are produced in-house by `engine/forecast` and labelled as SignalX estimates. See `00-decisions.md`.
3. **Corporate results / filings.** §7.8 and §17 need earnings, margins, guidance. Exchange filings run into the same access problem prices did. ⚠️ Still open — fold it into the D2 vendor evaluation, since several vendors bundle fundamentals.
4. **FII/DII flows** (§7.10) — ⚠️ still open; published by exchanges/depositories, same access question. Also worth asking the D2 vendor about.

---

## 4. Outbound: the app API

Versioned under `/api/v1`, consumed identically by the web app and any future mobile client (§31).

```
GET  /api/v1/signals                 ?category&state&country&impact_min&cursor
GET  /api/v1/signals/:slug           full detail: chain, impacts, evidence, invalidators
GET  /api/v1/signals/:slug/chain     graph payload for the causal visual
GET  /api/v1/indicators              registry + latest value
GET  /api/v1/indicators/:slug        metadata, series, expectation, related signals
GET  /api/v1/sectors/:slug           outlook, drivers, companies, signals
GET  /api/v1/companies/:slug         snapshot, exposures, drivers, signals
GET  /api/v1/markets/snapshot        indices, FX, commodities + "why is this moving"
GET  /api/v1/macro/dashboard         §15 categories with state/direction/momentum/risk
GET  /api/v1/brief/daily             §34 daily brief
POST /api/v1/explore                 §19 AI Q&A          (strict rate limit, tier-gated)
GET  /api/v1/watchlists              + POST/DELETE items
GET  /api/v1/alerts                  + rules CRUD
GET  /api/v1/search                  entity search across all types

POST /api/internal/ingest/:adapter   service-auth only, enqueues work
POST /api/internal/pipeline/tick     cron entry point
```

Conventions: cursor pagination, `ETag` + `Cache-Control` on content reads, Zod-validated inputs, envelope `{ data, meta }`, RFC-style error bodies, per-tier rate limits keyed by user ID.

### Explore is tool-calling, not free-form generation

`/explore` must never answer from model memory. The flow is:

1. Classify the question and extract entities.
2. The model calls **your own** read endpoints as tools (`get_indicator_series`, `find_signals`, `get_company_exposures`, `traverse_graph`).
3. It composes an answer strictly over the returned rows.
4. The response ships `{ answer, supporting_signals, data, causal_chain, confidence, sources, counterarguments }` — the seven fields §19 requires — with every citation resolving to a real row.

If the database has nothing relevant, the correct answer is "we don't have data on that", not a plausible paragraph. That rule is what separates this from a chatbot (§4).

---

## 5. Scheduling

Revised for D2 — the market feed is end-of-day, so there is no intraday market cycle.

| Cadence | What runs |
|---|---|
| hourly | news/RSS poll, event detection sweep on text sources |
| daily ~18:30 IST (post-close) | EOD market ingest, market environment scores |
| daily 05:30 IST | full macro ingest, forecast refresh, signal re-evaluation, monitor loop, brief generation |
| daily 06:30 IST | alert dispatch, daily brief delivery |
| weekly | **forecast backtests** (D1), climatology recompute, graph health + staleness checks, outcome evaluation |
| on release-calendar hit | targeted fetch + surprise detection for that indicator |
| ad hoc, offline | graph drafting job (D9) — never on a user-facing path |

All jobs write an `ingest_runs` row; all are idempotent; failures retry with backoff and surface on an internal health page.
