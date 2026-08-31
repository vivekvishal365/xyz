import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyObservations,
  finishIngestRun,
  getCurrentObservations,
  getRawPayloadBody,
  startIngestRun,
  storeRawPayload,
  upsertExpectation,
  upsertExpectationModel,
  type ApplyResult,
} from "@/lib/db/repositories";
import { periodTypeForFrequency, type IndicatorRow } from "@/lib/db/types";
import { forecastIndicator } from "@/lib/engine/forecast";
import { getAdapter } from "./registry";
import { normalize } from "./normalize";
import type { AdapterDeps, FetchWindow, SeriesSpec } from "./types";

/**
 * One indicator, end to end: fetch, store the raw bytes, parse, normalise,
 * apply, then re-evaluate the forecast model against the new history.
 *
 * Split into three exported stages rather than one function because Inngest
 * runs each as a separate durable step. Each stage's output is small and
 * JSON-serialisable — the raw body is handed off by id, not by value, so step
 * state stays a few hundred bytes instead of megabytes, and a retry of the
 * parse stage does not re-hit the provider.
 */

export type FetchStageResult = {
  ingestRunId: string;
  rawPayloadId: string;
  contentHash: string;
  /** True when the provider returned a byte-identical response to last time. */
  alreadySeen: boolean;
  requestUrl: string;
  fetchedAt: string;
};

export type ApplyStageResult = {
  applied: ApplyResult;
  warnings: string[];
  rejected: number;
};

export type ForecastStageResult = {
  isTrusted: boolean;
  method: string | null;
  expected: number | null;
  mae: number | null;
  reason: string | null;
  notes: string[];
};

export type IngestOutcome = {
  indicatorSlug: string;
  status: "ok" | "skipped" | "failed";
  unchangedPayload: boolean;
  applied: ApplyResult;
  warnings: string[];
  rejected: number;
  forecast: ForecastStageResult | null;
  error: string | null;
};

function specFor(indicator: IndicatorRow): SeriesSpec {
  return {
    indicatorKey: indicator.slug,
    sourceSeriesCode: indicator.source_series_code ?? "",
    periodType: periodTypeForFrequency(indicator.frequency),
    unit: indicator.unit,
    config: indicator.adapter_config,
  };
}

/**
 * Stage 1 — fetch and store the raw response.
 *
 * The bytes are written before anything parses them, so a parser bug is
 * recoverable by replay rather than by re-hitting the provider, and the payload
 * behind any user-visible number stays available for the source drawer (§26).
 */
export async function fetchStage(
  db: SupabaseClient,
  indicator: IndicatorRow,
  window: FetchWindow,
  deps: AdapterDeps,
): Promise<FetchStageResult> {
  const adapter = getAdapter(indicator.adapter);
  const spec = specFor(indicator);

  const run = await startIngestRun(db, {
    sourceId: indicator.source_id,
    adapter: indicator.adapter,
  });

  try {
    const payload = await adapter.fetch(spec, window, deps);

    const stored = await storeRawPayload(db, {
      ingestRunId: run.id,
      sourceId: indicator.source_id,
      requestUrl: payload.url,
      contentHash: payload.contentHash,
      body: payload.body,
      fetchedAt: payload.fetchedAt,
    });

    return {
      ingestRunId: run.id,
      rawPayloadId: stored.row.id,
      contentHash: payload.contentHash,
      alreadySeen: stored.alreadySeen,
      requestUrl: payload.url,
      fetchedAt: payload.fetchedAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishIngestRun(db, run.id, { status: "failed", rowsWritten: 0, error: message });
    throw error;
  }
}

/** Stage 2 — parse the stored payload and apply it to the fact table. */
export async function applyStage(
  db: SupabaseClient,
  indicator: IndicatorRow,
  fetched: FetchStageResult,
): Promise<ApplyStageResult> {
  const adapter = getAdapter(indicator.adapter);
  const spec = specFor(indicator);

  const body = await getRawPayloadBody(db, fetched.rawPayloadId);
  if (body === null) {
    throw new Error(`raw payload ${fetched.rawPayloadId} has no body to parse`);
  }

  const parsed = adapter.parse(
    {
      sourceId: indicator.adapter,
      sourceSeriesCode: spec.sourceSeriesCode,
      url: fetched.requestUrl,
      fetchedAt: new Date(fetched.fetchedAt),
      contentHash: fetched.contentHash,
      body,
      httpStatus: 200,
    },
    spec,
  );

  const normalized = normalize(parsed.observations, spec, {
    sourceId: indicator.source_id,
    ingestRunId: fetched.ingestRunId,
    contentHash: fetched.contentHash,
    observedAt: new Date(fetched.fetchedAt),
  });

  const applied = await applyObservations(db, {
    indicatorId: indicator.id,
    sourceId: indicator.source_id,
    rawPayloadId: fetched.rawPayloadId,
    observations: normalized.observations,
  });

  await finishIngestRun(db, fetched.ingestRunId, {
    status: normalized.rejected.length > 0 ? "partial" : "ok",
    rowsWritten: applied.inserted + applied.revised,
  });

  return {
    applied,
    warnings: [...parsed.warnings, ...normalized.warnings],
    rejected: normalized.rejected.length,
  };
}

/**
 * Stage 3 — re-backtest against the full stored history and persist the verdict
 * (D1).
 *
 * Every method's result is written, not only the winner: the admin panel has to
 * show *why* a model was rejected, and "it failed" without the numbers is not
 * reviewable. An untrusted indicator gets no `expectations` row at all, which is
 * what makes "no estimate" the visible outcome downstream rather than a
 * silently absent one.
 */
export async function forecastStage(
  db: SupabaseClient,
  indicator: IndicatorRow,
): Promise<ForecastStageResult> {
  const periodType = periodTypeForFrequency(indicator.frequency);
  const history = await getCurrentObservations(db, indicator.id);

  const result = forecastIndicator({
    periodEnds: history.map((row) => row.period_end),
    values: history.map((row) => Number(row.value)),
    periodType,
  });

  const from = history[0]?.period_end ?? null;
  const to = history.at(-1)?.period_end ?? null;

  let winningModelId: string | null = null;

  for (const evaluation of result.evaluations) {
    const row = await upsertExpectationModel(db, {
      indicatorId: indicator.id,
      method: evaluation.method,
      params: {
        n: evaluation.n,
        relative_skill: evaluation.relativeSkill,
        // Stored so the UI can say *why* a method was rejected. "—" with no
        // explanation is the kind of opacity D1 is supposed to avoid.
        untrusted_reason: evaluation.untrustedReason,
      },
      backtestFrom: from,
      backtestTo: to,
      mae: evaluation.mae,
      rmse: evaluation.rmse,
      naiveMae: evaluation.naiveMae,
      isTrusted: evaluation.isTrusted,
    });

    if (result.method === evaluation.method) winningModelId = row.id;
  }

  if (result.isTrusted && result.expected !== null && result.forPeriodEnd !== null) {
    await upsertExpectation(db, {
      indicatorId: indicator.id,
      periodEnd: result.forPeriodEnd,
      expected: result.expected,
      modelId: winningModelId,
      // Stored with the estimate, not looked up later: surprise is normalised
      // by the model's error at the time the estimate was made.
      errorMae: result.mae,
      sourceId: indicator.source_id,
    });
  }

  return {
    isTrusted: result.isTrusted,
    method: result.method,
    expected: result.expected,
    mae: result.mae,
    reason: result.reason,
    notes: result.notes,
  };
}

/** All three stages in sequence. Used by the CLI; Inngest calls the stages. */
export async function ingestIndicator(
  db: SupabaseClient,
  indicator: IndicatorRow,
  window: FetchWindow,
  deps: AdapterDeps,
): Promise<IngestOutcome> {
  const outcome: IngestOutcome = {
    indicatorSlug: indicator.slug,
    status: "failed",
    unchangedPayload: false,
    applied: { inserted: 0, revised: 0, unchanged: 0 },
    warnings: [],
    rejected: 0,
    forecast: null,
    error: null,
  };

  if (!indicator.source_series_code) {
    return { ...outcome, status: "skipped", error: "no source_series_code" };
  }

  try {
    const fetched = await fetchStage(db, indicator, window, deps);
    const applied = await applyStage(db, indicator, fetched);
    const forecast = await forecastStage(db, indicator);

    return {
      ...outcome,
      status: "ok",
      unchangedPayload: fetched.alreadySeen,
      applied: applied.applied,
      warnings: applied.warnings,
      rejected: applied.rejected,
      forecast,
    };
  } catch (error) {
    return {
      ...outcome,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
