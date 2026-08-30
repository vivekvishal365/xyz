-- SignalX — MVP database schema (Supabase / PostgreSQL)
-- Proposal for review. Not yet applied.
--
-- Organised in five groups:
--   A. Reference / dimensions      D. Outputs (events, signals)
--   B. Facts (observations)        E. Users, alerts, analytics
--   C. Knowledge (the graph)
--
-- Conventions:
--   * uuid primary keys, `gen_random_uuid()` (pgcrypto is available on Supabase)
--   * timestamptz everywhere, stored UTC, rendered IST in the app
--   * `slug` on every user-facing entity for stable, readable URLs
--   * numeric (not float) for anything a user sees as a number

create extension if not exists pgcrypto;
create extension if not exists vector;

-- =====================================================================
-- A. REFERENCE / DIMENSIONS
-- =====================================================================

create table countries (
  id           uuid primary key default gen_random_uuid(),
  iso2         text not null unique,
  name         text not null,
  currency     text
);

create table sources (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,              -- 'fred', 'mospi', 'open-meteo'
  name          text not null,
  url           text,
  category      text not null,                     -- official | market | weather | news | vendor
  licence_note  text,                              -- redistribution terms; see 03-data-sources.md
  -- reliability feeds the confidence score and PRD §36 "source reliability"
  reliability   numeric(3,2) not null default 0.70 check (reliability between 0 and 1),
  created_at    timestamptz not null default now()
);

create table sectors (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  parent_id    uuid references sectors(id),        -- hierarchy: Materials > Metals > Steel
  country_id   uuid references countries(id),
  description  text
);
create index on sectors(parent_id);

create table companies (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  legal_name    text,
  country_id    uuid references countries(id),
  sector_id     uuid references sectors(id),
  isin          text unique,
  description   text,
  -- lightweight fundamentals for PRD §17 snapshot; refreshed on a slow cadence
  fundamentals  jsonb,                             -- {revenue, ebitda, margin, debt, mcap, as_of}
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on companies(sector_id);

create table company_listings (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  exchange    text not null,                       -- NSE | BSE
  ticker      text not null,
  is_primary  boolean not null default false,
  unique (exchange, ticker)
);

-- The indicator registry. Adding an indicator must be DATA ENTRY, not code:
-- this is what makes 50-100 indicators (PRD §8) achievable.
create table indicators (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,         -- 'india-cpi-yoy', 'brent-crude'
  name               text not null,
  category           text not null,                -- macro | trade | commodity | production
                                                   -- | weather | market | consumer | policy
  country_id         uuid references countries(id),-- null = global
  unit               text not null,                -- '%', 'USD/bbl', 'INR bn', 'mm'
  frequency          text not null,                -- daily|weekly|monthly|quarterly|annual|irregular
  seasonality        text not null default 'none', -- none | monthly | quarterly
  higher_is          text not null default 'neutral', -- good | bad | neutral (drives arrow colour)
  -- ingestion wiring
  source_id          uuid not null references sources(id),
  adapter            text not null,                -- 'fred' | 'open-meteo' | 'mospi-cpi' ...
  source_series_code text,                         -- 'DCOILBRENTEU', dataset id, etc.
  transform          jsonb,                        -- {op:'yoy'} | {op:'scale',by:0.001}
  -- detection tuning (PRD §22 stage 3/4), per-indicator so thresholds are not global guesses
  detection_config   jsonb not null default '{}',  -- {z_window:24, z_threshold:1.8, min_pct:2}
  release_lag_days   int,                          -- expected publication lag
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
create index on indicators(category, is_active);

-- Known release calendar. Needed for "expected vs actual" (§14) to fire on time,
-- and for the app to say "CPI due in 3 days".
create table indicator_releases (
  id             uuid primary key default gen_random_uuid(),
  indicator_id   uuid not null references indicators(id) on delete cascade,
  period_end     date not null,
  scheduled_at   timestamptz,
  status         text not null default 'scheduled', -- scheduled | released | delayed
  unique (indicator_id, period_end)
);

-- =====================================================================
-- B. FACTS  (+ provenance)
-- =====================================================================

create table ingest_runs (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references sources(id),
  adapter      text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running',    -- running | ok | partial | failed
  rows_written int not null default 0,
  error        text
);

-- Immutable. Written BEFORE parsing. Provenance for PRD §26 and replay.
create table raw_payloads (
  id             uuid primary key default gen_random_uuid(),
  ingest_run_id  uuid not null references ingest_runs(id) on delete cascade,
  source_id      uuid not null references sources(id),
  request_url    text,
  fetched_at     timestamptz not null default now(),
  content_hash   text not null,
  content_type   text,
  body           text,                              -- raw JSON/CSV/HTML as returned
  unique (source_id, content_hash)
);

-- The fact table. One row = one observation of one indicator for one period.
create table indicator_observations (
  id             uuid primary key default gen_random_uuid(),
  indicator_id   uuid not null references indicators(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  period_type    text not null,                     -- day|week|month|quarter|year|point
  value          numeric not null,
  unit           text not null,
  -- the two timestamps that must never be conflated
  released_at    timestamptz,                       -- when the world learned it
  ingested_at    timestamptz not null default now(),-- when we learned it
  raw_payload_id uuid references raw_payloads(id),
  source_id      uuid not null references sources(id),
  revision       int not null default 1,
  is_current     boolean not null default true,
  unique (indicator_id, period_end, revision)
);
create index on indicator_observations(indicator_id, period_end desc) where is_current;

-- Revisions are appended, never overwritten: PRD §36 accuracy metrics require
-- point-in-time correctness. Indian macro series revise routinely.
create table observation_revisions (
  id                 uuid primary key default gen_random_uuid(),
  indicator_id       uuid not null references indicators(id) on delete cascade,
  period_end         date not null,
  previous_value     numeric not null,
  new_value          numeric not null,
  revised_at         timestamptz not null default now(),
  raw_payload_id     uuid references raw_payloads(id)
);

-- D1. One row per indicator per method. `is_trusted` is set by backtest, and
-- an untrusted model publishes NO estimate rather than a bad one.
create table expectation_models (
  id             uuid primary key default gen_random_uuid(),
  indicator_id   uuid not null references indicators(id) on delete cascade,
  method         text not null,       -- seasonal_naive | drift | seasonal_naive_drift
  params         jsonb not null default '{}',
  -- backtest results, recomputed on a weekly job
  backtest_from  date,
  backtest_to    date,
  mae            numeric,
  rmse           numeric,
  -- MAE of the dumbest possible baseline (last value). A model that cannot
  -- beat this has no business producing a user-visible number.
  naive_mae      numeric,
  is_trusted     boolean not null default false,
  evaluated_at   timestamptz,
  unique (indicator_id, method)
);

-- PRD §14 "Expected". D1: no consensus data is bought for MVP, so every
-- expectation is model-derived and must be LABELLED as a SignalX estimate.
create table expectations (
  id            uuid primary key default gen_random_uuid(),
  indicator_id  uuid not null references indicators(id) on delete cascade,
  period_end    date not null,
  expected      numeric not null,
  basis         text not null,        -- model | consensus | prior_period | manual
                                      -- (MVP writes 'model' only)
  model_id      uuid references expectation_models(id),
  -- the model's rolling error AT THE TIME this estimate was made. Surprise is
  -- normalised by this, so a naive baseline cannot manufacture a "surprise"
  -- at every seasonal turn.
  error_mae     numeric,
  source_id     uuid references sources(id),
  created_at    timestamptz not null default now(),
  unique (indicator_id, period_end, basis)
);

-- Text documents that events can be detected from (news, PIB, RBI releases, filings).
create table documents (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references sources(id),
  url          text not null unique,
  title        text not null,
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  body         text,
  summary      text,
  embedding    vector(1536),
  entities     jsonb          -- resolved {companies:[], sectors:[], indicators:[]}
);
create index on documents using ivfflat (embedding vector_cosine_ops);

-- =====================================================================
-- C. KNOWLEDGE — the curated causal graph.
--    This is the product's moat. It is reviewed content, not LLM output at
--    read time. See 01-architecture.md §1.
--
--    D9: an offline LLM job DRAFTS rows here; a human approves every one.
--    The runtime only ever reads status = 'approved'.
-- =====================================================================

-- One run of the offline drafting job. Keeps the model and prompt that
-- produced a batch, so a bad batch can be found and re-reviewed wholesale.
create table graph_draft_batches (
  id            uuid primary key default gen_random_uuid(),
  scope_note    text not null,        -- 'edges from crude oil', 'auto sector exposures'
  provider      text not null,
  model         text not null,
  prompt_hash   text not null,
  items_drafted int not null default 0,
  items_approved int not null default 0,
  items_rejected int not null default 0,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- Polymorphic node reference used by edges. node_type in
-- (indicator, sector, company, commodity, market, theme, country)
create table causal_edges (
  id             uuid primary key default gen_random_uuid(),
  from_type      text not null,
  from_id        uuid not null,
  to_type        text not null,
  to_id          uuid not null,
  -- +1 = same direction, -1 = inverse. "crude up -> aviation margin down" = -1
  polarity       smallint not null check (polarity in (-1, 1)),
  strength       numeric(3,2) not null check (strength between 0 and 1),
  lag_days       int not null default 0,
  confidence     numeric(3,2) not null check (confidence between 0 and 1),
  mechanism      text not null,       -- one sentence: WHY this edge exists
  evidence_note  text,
  -- curation lifecycle (D9)
  status         text not null default 'draft',  -- draft|approved|rejected|deprecated
  version        int  not null default 1,
  proposed_by    text not null default 'ai',     -- ai | human
  draft_batch_id uuid references graph_draft_batches(id),
  review_notes   text,
  rejection_reason text,
  created_by     uuid,
  approved_by    uuid,
  approved_at    timestamptz,
  -- edges go stale: companies divest, cost structures change. A graph nobody
  -- re-reviews degrades silently, so every edge carries a re-review date.
  review_due_at  timestamptz,
  created_at     timestamptz not null default now(),
  unique (from_type, from_id, to_type, to_id, version)
);
-- the review queue is the founder's main workspace; index for it explicitly
create index on causal_edges(draft_batch_id) where status = 'draft';
create index on causal_edges(review_due_at) where status = 'approved';
create index on causal_edges(from_type, from_id) where status = 'approved';
create index on causal_edges(to_type, to_id)   where status = 'approved';

-- Company-level exposure to a driver (PRD §13 "Affected Companies", §17 risk factors).
create table exposures (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  driver_type  text not null,        -- indicator | commodity | sector | theme
  driver_id    uuid not null,
  direction    smallint not null check (direction in (-1, 1)),
  magnitude    text not null,        -- low | medium | high
  rationale    text not null,        -- REQUIRED. shown to the user as "Reason"
  confidence   numeric(3,2) not null check (confidence between 0 and 1),
  source_note  text,                 -- filing, annual report page, etc.
  -- curation lifecycle (D9), mirrors causal_edges
  status       text not null default 'draft',   -- draft|approved|rejected|deprecated
  proposed_by  text not null default 'ai',
  draft_batch_id uuid references graph_draft_batches(id),
  review_notes text,
  rejection_reason text,
  approved_by  uuid,
  approved_at  timestamptz,
  review_due_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (company_id, driver_type, driver_id)
);
create index on exposures(draft_batch_id) where status = 'draft';
create index on exposures(driver_type, driver_id) where status = 'approved';

create table themes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text
);

-- =====================================================================
-- D. OUTPUTS — events and signals
-- =====================================================================

create table events (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,       -- data_release | threshold | anomaly
                                      -- | surprise | trend_break | news
  indicator_id   uuid references indicators(id),    -- null for news-derived events
  document_id    uuid references documents(id),
  observation_id uuid references indicator_observations(id),
  occurred_at    timestamptz not null,
  detected_at    timestamptz not null default now(),
  magnitude      numeric,             -- change size in indicator units
  magnitude_pct  numeric,
  z_score        numeric,
  surprise       numeric,             -- actual - expected, when available
  description    text not null,       -- deterministic template text, no LLM
  dedupe_key     text unique,         -- prevents the same release firing twice
  created_at     timestamptz not null default now()
);
create index on events(detected_at desc);

create table signals (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  category         text not null,     -- inflation|growth|commodity|trade|geopolitics
                                      -- |corporate|market|weather|supply_chain
  country_id       uuid references countries(id),
  direction        smallint not null check (direction in (-1, 0, 1)),
  time_horizon     text not null,     -- '0-1m' | '1-3m' | '3-6m' | '6-12m'
  -- PRD §28 — all 0..100, produced by deterministic formulas (see 04-modules)
  impact_score     int not null check (impact_score      between 0 and 100),
  probability_score int not null check (probability_score between 0 and 100),
  confidence_score int not null check (confidence_score  between 0 and 100),
  persistence_score int not null check (persistence_score between 0 and 100),
  novelty_score    int not null check (novelty_score     between 0 and 100),
  priority         numeric not null,  -- PRD §29 composite, used for ordering
  -- lifecycle (PRD §11 filters require this; PRD never defines it)
  state            text not null default 'new',
    -- new | active | strengthening | weakening | reversed | invalidated | expired
  first_seen_at    timestamptz not null default now(),
  last_evaluated_at timestamptz,
  published_at     timestamptz,
  expires_at       timestamptz,
  -- narrative, produced at stage 8 and regenerated only when structure changes
  what_happened    text,
  why_it_matters   text,
  scenarios        jsonb,             -- {base:{...}, bull:{...}, bear:{...}}
  -- verification (PRD §22 stage 8)
  verifier_verdict text,              -- pass | downgraded | vetoed
  verifier_notes   text,
  created_at       timestamptz not null default now()
);
create index on signals(state, priority desc);
create index on signals(category, published_at desc);

create table signal_events (
  signal_id uuid not null references signals(id) on delete cascade,
  event_id  uuid not null references events(id)  on delete cascade,
  primary key (signal_id, event_id)
);

-- The resolved causal chain: one row per traversed edge, so §13's graph is
-- data and every node in the UI is clickable.
create table signal_chain_nodes (
  id          uuid primary key default gen_random_uuid(),
  signal_id   uuid not null references signals(id) on delete cascade,
  depth       int not null,
  edge_id     uuid references causal_edges(id),
  node_type   text not null,
  node_id     uuid not null,
  path_score  numeric not null,       -- decays with depth * edge confidence
  narrative   text                    -- one clause explaining this hop
);
create index on signal_chain_nodes(signal_id, depth);

-- Affected sectors / companies / indicators (PRD §13 tables, §25 arrays)
--
-- D3: for company targets, `magnitude` is EXPOSURE magnitude — a property of
-- the company's cost or revenue structure — NOT an estimated earnings impact.
-- The distinction is the whole non-advisory posture: describe exposure, do not
-- forecast outcome. UI copy must not present this as an earnings estimate.
create table signal_impacts (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references signals(id) on delete cascade,
  target_type   text not null,        -- indicator | sector | company | market
  target_id     uuid not null,
  direction     smallint not null check (direction in (-1, 0, 1)),
  magnitude     text not null,        -- low | medium | high  (exposure, see above)
  confidence    numeric(3,2) not null,
  reason        text not null,        -- REQUIRED, surfaced in the UI
  exposure_id   uuid references exposures(id)
);
create index on signal_impacts(target_type, target_id);

-- Every factual claim traces to a row here (PRD §26). Narration may not cite
-- anything that is not already an evidence row.
create table signal_evidence (
  id             uuid primary key default gen_random_uuid(),
  signal_id      uuid not null references signals(id) on delete cascade,
  kind           text not null,       -- observation | document | edge
  observation_id uuid references indicator_observations(id),
  document_id    uuid references documents(id),
  edge_id        uuid references causal_edges(id),
  stance         text not null default 'supporting',  -- supporting | contradicting
  note           text,
  citation_key   text not null        -- '[1]' — what the LLM is allowed to emit
);

-- PRD §13: mandatory, and machine-checkable wherever possible so the monitor
-- loop can actually fire the `invalidated` transition.
create table signal_invalidators (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references signals(id) on delete cascade,
  description   text not null,
  indicator_id  uuid references indicators(id),
  operator      text,                 -- lt | gt | lte | gte | crosses
  threshold     numeric,
  is_machine_checkable boolean not null default false,
  triggered_at  timestamptz
);

create table signal_state_history (
  id          uuid primary key default gen_random_uuid(),
  signal_id   uuid not null references signals(id) on delete cascade,
  from_state  text,
  to_state    text not null,
  reason      text not null,
  changed_at  timestamptz not null default now()
);

-- PRD §32 Phase 6 / §36 intelligence metrics
create table signal_outcomes (
  id                uuid primary key default gen_random_uuid(),
  signal_id         uuid not null references signals(id) on delete cascade,
  evaluated_at      timestamptz not null default now(),
  horizon_end       date not null,
  direction_correct boolean,
  verdict           text,             -- correct | directional | early | late | irrelevant
  realised_move     numeric,
  notes             text
);

-- PRD §10 market environment scores, computed from signals, never hand-entered
create table market_environment_scores (
  id          uuid primary key default gen_random_uuid(),
  country_id  uuid not null references countries(id),
  as_of       date not null,
  dimension   text not null,          -- inflation_risk | growth_momentum
                                      -- | market_risk | currency_risk | commodity_pressure
  score       int not null check (score between 0 and 100),
  delta_7d    int,
  inputs      jsonb not null,         -- signal ids + weights, for "why is this 68?"
  unique (country_id, as_of, dimension)
);

-- D3. Every generated string that the compliance gate blocked. Logged, never
-- silently dropped: a rising block rate means the narration prompt has drifted.
create table compliance_flags (
  id            uuid primary key default gen_random_uuid(),
  surface       text not null,        -- narration | explore | alert | brief
  signal_id     uuid references signals(id) on delete cascade,
  ai_analysis_id uuid,
  rule          text not null,        -- 'price_prediction' | 'recommendation' ...
  matched_text  text not null,
  action        text not null,        -- blocked | regenerated | allowed_with_edit
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on compliance_flags(created_at desc);

-- Every LLM call, for cost control and auditability
create table ai_analyses (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,        -- narrate | verify | explore | brief
                                      -- | draft_edges | draft_exposures  (D9, offline)
  signal_id     uuid references signals(id) on delete cascade,
  user_id       uuid,
  provider      text not null,
  model         text not null,
  prompt_hash   text not null,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10,6),
  latency_ms    int,
  output        jsonb,
  created_at    timestamptz not null default now()
);
create index on ai_analyses(user_id, created_at desc);

-- =====================================================================
-- E. USERS, WATCHLISTS, ALERTS, ANALYTICS      (all RLS default-deny)
-- =====================================================================

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,                  -- PRD §10 "Good Morning, Vivek"
  tier          text not null default 'free',   -- free | pro | professional | enterprise
  timezone      text not null default 'Asia/Kolkata',
  onboarding    jsonb,                 -- interests chosen at signup
  created_at    timestamptz not null default now()
);

create table watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'My Watchlist',
  created_at  timestamptz not null default now()
);

create table watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid not null references watchlists(id) on delete cascade,
  item_type     text not null,         -- company|sector|indicator|commodity|country|theme
  item_id       uuid not null,
  added_at      timestamptz not null default now(),
  unique (watchlist_id, item_type, item_id)
);

create table alert_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scope       text not null,           -- all | watchlist | company | sector | macro
  target_type text,
  target_id   uuid,
  min_impact  int not null default 70, -- significance gate (PRD §21)
  channels    text[] not null default '{email}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  rule_id      uuid references alert_rules(id) on delete set null,
  signal_id    uuid references signals(id) on delete cascade,
  title        text not null,
  body         text not null,
  dedupe_key   text not null,          -- one alert per signal per rule per state change
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  delivered_at timestamptz,
  unique (user_id, dedupe_key)
);

-- PRD §36 north star: "useful intelligence actions per user"
create table user_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  kind        text not null,           -- signal_view|analysis_open|company_view
                                       -- |save|alert_create|ai_question
  subject_type text,
  subject_id  uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index on user_events(user_id, created_at desc);

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  action      text not null,           -- edge.approve, exposure.edit, signal.veto
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS. Content tables are served through /api/v1 by the service role, so
-- only user-owned tables need policies. Default deny everything else.
-- ---------------------------------------------------------------------
alter table profiles        enable row level security;
alter table watchlists      enable row level security;
alter table watchlist_items enable row level security;
alter table alert_rules     enable row level security;
alter table alerts          enable row level security;
alter table user_events     enable row level security;

create policy own_profile on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy own_watchlists on watchlists
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_watchlist_items on watchlist_items
  for all using (exists (
    select 1 from watchlists w
    where w.id = watchlist_id and w.user_id = auth.uid()
  ));

create policy own_alert_rules on alert_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_alerts on alerts
  for select using (user_id = auth.uid());

create policy own_user_events on user_events
  for insert with check (user_id = auth.uid());
