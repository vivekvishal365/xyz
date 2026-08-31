import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalObservation, IsoDate } from "@/lib/ingest/types";
import type {
  ExpectationModelRow,
  IndicatorRow,
  IngestRunRow,
  ObservationRow,
  RawPayloadRow,
  SourceRow,
} from "./types";

/**
 * Repository layer for the ingestion pipeline.
 *
 * Every function takes the client explicitly rather than reaching for a
 * module-level singleton, which keeps them usable from a request, a cron
 * worker or a script without any of them sharing connection state.
 */

function fail(operation: string, error: { message: string } | null): never {
  throw new Error(`db: ${operation} failed — ${error?.message ?? "unknown error"}`);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function upsertSource(
  db: SupabaseClient,
  source: {
    slug: string;
    name: string;
    url?: string;
    category: string;
    reliability: number;
    licenceNote?: string;
  },
): Promise<SourceRow> {
  const { data, error } = await db
    .from("sources")
    .upsert(
      {
        slug: source.slug,
        name: source.name,
        url: source.url ?? null,
        category: source.category,
        reliability: source.reliability,
        licence_note: source.licenceNote ?? null,
      },
      { onConflict: "slug" },
    )
    .select()
    .single();

  if (error) fail(`upsertSource(${source.slug})`, error);
  return data as SourceRow;
}

export async function getSourceBySlug(
  db: SupabaseClient,
  slug: string,
): Promise<SourceRow | null> {
  const { data, error } = await db.from("sources").select().eq("slug", slug).maybeSingle();
  if (error) fail(`getSourceBySlug(${slug})`, error);
  return (data as SourceRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

export async function upsertIndicator(
  db: SupabaseClient,
  indicator: Omit<IndicatorRow, "id">,
): Promise<IndicatorRow> {
  const { data, error } = await db
    .from("indicators")
    .upsert(indicator, { onConflict: "slug" })
    .select()
    .single();

  if (error) fail(`upsertIndicator(${indicator.slug})`, error);
  return data as IndicatorRow;
}

export async function listActiveIndicators(
  db: SupabaseClient,
  options: { adapter?: string } = {},
): Promise<IndicatorRow[]> {
  let query = db.from("indicators").select().eq("is_active", true).order("slug");
  if (options.adapter) query = query.eq("adapter", options.adapter);

  const { data, error } = await query;
  if (error) fail("listActiveIndicators", error);
  return (data ?? []) as IndicatorRow[];
}

export async function getIndicatorBySlug(
  db: SupabaseClient,
  slug: string,
): Promise<IndicatorRow | null> {
  const { data, error } = await db.from("indicators").select().eq("slug", slug).maybeSingle();
  if (error) fail(`getIndicatorBySlug(${slug})`, error);
  return (data as IndicatorRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Ingest runs
// ---------------------------------------------------------------------------

export async function startIngestRun(
  db: SupabaseClient,
  input: { sourceId: string; adapter: string },
): Promise<IngestRunRow> {
  const { data, error } = await db
    .from("ingest_runs")
    .insert({ source_id: input.sourceId, adapter: input.adapter, status: "running" })
    .select()
    .single();

  if (error) fail("startIngestRun", error);
  return data as IngestRunRow;
}

export async function finishIngestRun(
  db: SupabaseClient,
  runId: string,
  outcome: { status: "ok" | "partial" | "failed"; rowsWritten: number; error?: string },
): Promise<void> {
  const { error } = await db
    .from("ingest_runs")
    .update({
      status: outcome.status,
      rows_written: outcome.rowsWritten,
      error: outcome.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) fail(`finishIngestRun(${runId})`, error);
}

// ---------------------------------------------------------------------------
// Raw payloads
// ---------------------------------------------------------------------------

export type StoredPayload = { row: RawPayloadRow; alreadySeen: boolean };

/**
 * Store a raw payload, or return the existing row if this exact body has been
 * seen from this source before.
 *
 * `alreadySeen` is what lets the pipeline skip re-parsing an unchanged
 * response — most daily pulls of a monthly series return byte-identical data.
 */
export async function storeRawPayload(
  db: SupabaseClient,
  input: {
    ingestRunId: string;
    sourceId: string;
    requestUrl: string;
    contentHash: string;
    body: string;
    contentType?: string;
    fetchedAt: Date;
  },
): Promise<StoredPayload> {
  const existing = await db
    .from("raw_payloads")
    .select()
    .eq("source_id", input.sourceId)
    .eq("content_hash", input.contentHash)
    .maybeSingle();

  if (existing.error) fail("storeRawPayload(lookup)", existing.error);
  if (existing.data) {
    return { row: existing.data as RawPayloadRow, alreadySeen: true };
  }

  const { data, error } = await db
    .from("raw_payloads")
    .insert({
      ingest_run_id: input.ingestRunId,
      source_id: input.sourceId,
      request_url: input.requestUrl,
      content_hash: input.contentHash,
      content_type: input.contentType ?? "application/json",
      body: input.body,
      fetched_at: input.fetchedAt.toISOString(),
    })
    .select()
    .single();

  if (error) fail("storeRawPayload(insert)", error);
  return { row: data as RawPayloadRow, alreadySeen: false };
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

/** PostgREST caps a response at 1000 rows regardless of `.limit()`. */
const PAGE_SIZE = 1000;

/**
 * Full current history for an indicator, chronologically.
 *
 * Paginated deliberately. PostgREST silently truncates at 1000 rows — it does
 * not error and does not signal that more exist — so a single select would
 * quietly return the first 1000 observations of a decade-long daily series and
 * every backtest downstream would be computed on a third of the data, with
 * plausible-looking numbers to show for it.
 */
export async function getCurrentObservations(
  db: SupabaseClient,
  indicatorId: string,
): Promise<ObservationRow[]> {
  const rows: ObservationRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("indicator_observations")
      .select()
      .eq("indicator_id", indicatorId)
      .eq("is_current", true)
      .order("period_end")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) fail(`getCurrentObservations(${indicatorId})`, error);

    const page = (data ?? []) as ObservationRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

export type ApplyResult = { inserted: number; revised: number; unchanged: number };

/**
 * Apply a batch of observations atomically via the `apply_observations`
 * function from migration 0002.
 *
 * Deliberately not implemented client-side. Applying a revision means retiring
 * the current row, inserting the successor and appending a revision record —
 * three statements that must succeed or fail together. Split across REST calls,
 * a failure between them leaves the series with two current rows or none, and
 * every later read is silently wrong.
 */
export async function applyObservations(
  db: SupabaseClient,
  input: {
    indicatorId: string;
    sourceId: string;
    rawPayloadId: string | null;
    observations: readonly CanonicalObservation[];
  },
): Promise<ApplyResult> {
  if (input.observations.length === 0) {
    return { inserted: 0, revised: 0, unchanged: 0 };
  }

  const rows = input.observations.map((o) => ({
    period_start: o.periodStart,
    period_end: o.periodEnd,
    period_type: o.periodType,
    value: o.value,
    unit: o.unit,
    released_at: o.releasedAt?.toISOString() ?? "",
  }));

  const { data, error } = await db.rpc("apply_observations", {
    p_indicator_id: input.indicatorId,
    p_source_id: input.sourceId,
    p_raw_payload_id: input.rawPayloadId,
    p_rows: rows,
  });

  if (error) {
    if (/could not find the function|does not exist|schema cache/i.test(error.message)) {
      return bootstrapObservations(db, input);
    }
    fail("applyObservations", error);
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    inserted: Number(result?.inserted ?? 0),
    revised: Number(result?.revised ?? 0),
    unchanged: Number(result?.unchanged ?? 0),
  };
}

/**
 * First-load path, used only while `apply_observations` has not been applied.
 *
 * Inserting brand-new rows is a single statement, so it needs no transaction
 * and is safe to do from the client. Applying a *revision* is not, so this
 * refuses rather than attempting it — a half-applied revision leaves the series
 * with two current rows or none, and every later read is silently wrong.
 *
 * Delete this once migration 0002 is applied everywhere.
 */
async function bootstrapObservations(
  db: SupabaseClient,
  input: {
    indicatorId: string;
    sourceId: string;
    rawPayloadId: string | null;
    observations: readonly CanonicalObservation[];
  },
): Promise<ApplyResult> {
  const current = await getCurrentObservations(db, input.indicatorId);
  const stored = new Map(current.map((row) => [row.period_end, Number(row.value)]));

  const toInsert: CanonicalObservation[] = [];
  let unchanged = 0;
  const wouldRevise: string[] = [];

  for (const observation of input.observations) {
    const existing = stored.get(observation.periodEnd);
    if (existing === undefined) {
      toInsert.push(observation);
    } else if (Math.abs(existing - observation.value) <= 1e-9) {
      unchanged += 1;
    } else {
      wouldRevise.push(observation.periodEnd);
    }
  }

  if (wouldRevise.length > 0) {
    throw new Error(
      `db: ${wouldRevise.length} revision(s) need applying (e.g. ${wouldRevise[0]}), which ` +
        "requires a transaction. Apply supabase/migrations/20260831010000_observation_apply.sql, " +
        "then re-run. Refusing to apply them non-atomically.",
    );
  }

  if (toInsert.length > 0) {
    const { error } = await db.from("indicator_observations").insert(
      toInsert.map((o) => ({
        indicator_id: input.indicatorId,
        period_start: o.periodStart,
        period_end: o.periodEnd,
        period_type: o.periodType,
        value: o.value,
        unit: o.unit,
        released_at: o.releasedAt?.toISOString() ?? null,
        raw_payload_id: input.rawPayloadId,
        source_id: input.sourceId,
        revision: 1,
        is_current: true,
      })),
    );

    if (error) fail("bootstrapObservations(insert)", error);
  }

  return { inserted: toInsert.length, revised: 0, unchanged };
}

// ---------------------------------------------------------------------------
// Expectation models (D1)
// ---------------------------------------------------------------------------

export async function upsertExpectationModel(
  db: SupabaseClient,
  input: {
    indicatorId: string;
    method: string;
    params?: Record<string, unknown>;
    backtestFrom: IsoDate | null;
    backtestTo: IsoDate | null;
    mae: number | null;
    rmse: number | null;
    naiveMae: number | null;
    isTrusted: boolean;
  },
): Promise<ExpectationModelRow> {
  const { data, error } = await db
    .from("expectation_models")
    .upsert(
      {
        indicator_id: input.indicatorId,
        method: input.method,
        params: input.params ?? {},
        backtest_from: input.backtestFrom,
        backtest_to: input.backtestTo,
        mae: input.mae,
        rmse: input.rmse,
        naive_mae: input.naiveMae,
        is_trusted: input.isTrusted,
        evaluated_at: new Date().toISOString(),
      },
      { onConflict: "indicator_id,method" },
    )
    .select()
    .single();

  if (error) fail(`upsertExpectationModel(${input.method})`, error);
  return data as ExpectationModelRow;
}

export async function listExpectationModels(
  db: SupabaseClient,
  indicatorId: string,
): Promise<ExpectationModelRow[]> {
  const { data, error } = await db
    .from("expectation_models")
    .select()
    .eq("indicator_id", indicatorId)
    .order("mae", { nullsFirst: false });

  if (error) fail(`listExpectationModels(${indicatorId})`, error);
  return (data ?? []) as ExpectationModelRow[];
}

/**
 * Record the expected value for a period (D1).
 *
 * `error_mae` travels with the estimate rather than being looked up later,
 * because surprise is normalised by the model's error *at the time the estimate
 * was made*. Reading today's MAE against a year-old estimate would silently
 * rescale a historical surprise.
 */
export async function upsertExpectation(
  db: SupabaseClient,
  input: {
    indicatorId: string;
    periodEnd: IsoDate;
    expected: number;
    modelId: string | null;
    errorMae: number | null;
    sourceId: string | null;
  },
): Promise<void> {
  const { error } = await db.from("expectations").upsert(
    {
      indicator_id: input.indicatorId,
      period_end: input.periodEnd,
      expected: input.expected,
      basis: "model",
      model_id: input.modelId,
      error_mae: input.errorMae,
      source_id: input.sourceId,
    },
    { onConflict: "indicator_id,period_end,basis" },
  );

  if (error) fail("upsertExpectation", error);
}
