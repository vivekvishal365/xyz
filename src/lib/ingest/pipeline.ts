import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyObservations,
  finishIngestRun,
  getCurrentObservations,
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
 * Ordering matters. The raw payload is written before anything parses it, so a
 * parser bug is recoverable by replay rather than by re-hitting the provider,
 * and the bytes behind any user-visible number stay available for the source
 * drawer (§26).
 */

export type IngestOutcome = {
  indicatorSlug: string;
  status: "ok" | "skipped" | "failed";
  /** True when the provider returned a byte-identical response to last time. */
  unchangedPayload: boolean;
  applied: ApplyResult;
  warnings: string[];
  rejected: number;
  forecast: {
    isTrusted: boolean;
    method: string | null;
    expected: number | null;
    mae: number | null;
    reason: string | null;
  } | null;
  error: string | null;
};

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

  const adapter = getAdapter(indicator.adapter);
  const periodType = periodTypeForFrequency(indicator.frequency);

  const spec: SeriesSpec = {
    indicatorKey: indicator.slug,
    sourceSeriesCode: indicator.source_series_code,
    periodType,
    unit: indicator.unit,
    config: indicator.adapter_config,
  };

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

    // A byte-identical response means nothing has changed upstream. Most daily
    // pulls of a monthly series land here, and re-parsing them is wasted work.
    // Still re-run the forecast: history may have shifted for other reasons.
    outcome.unchangedPayload = stored.alreadySeen;

    const parsed = adapter.parse(payload, spec);
    outcome.warnings = parsed.warnings;

    const normalized = normalize(parsed.observations, spec, {
      sourceId: indicator.source_id,
      ingestRunId: run.id,
      contentHash: payload.contentHash,
      observedAt: payload.fetchedAt,
    });
    outcome.rejected = normalized.rejected.length;
    outcome.warnings.push(...normalized.warnings);

    outcome.applied = await applyObservations(db, {
      indicatorId: indicator.id,
      sourceId: indicator.source_id,
      rawPayloadId: stored.row.id,
      observations: normalized.observations,
    });

    outcome.forecast = await refreshForecast(db, indicator, periodType);

    await finishIngestRun(db, run.id, {
      status: outcome.rejected > 0 ? "partial" : "ok",
      rowsWritten: outcome.applied.inserted + outcome.applied.revised,
    });

    return { ...outcome, status: "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishIngestRun(db, run.id, { status: "failed", rowsWritten: 0, error: message });
    return { ...outcome, status: "failed", error: message };
  }
}

/**
 * Re-backtest the indicator against its full stored history and persist the
 * verdict (D1).
 *
 * Every method's result is written, not only the winner — the admin panel needs
 * to show why a model was rejected, and "it failed" without the numbers is not
 * reviewable. An untrusted indicator gets no `expectations` row at all, which
 * is what makes "no estimate" the visible outcome downstream.
 */
async function refreshForecast(
  db: SupabaseClient,
  indicator: IndicatorRow,
  periodType: ReturnType<typeof periodTypeForFrequency>,
): Promise<IngestOutcome["forecast"]> {
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
      params: { n: evaluation.n, relative_skill: evaluation.relativeSkill },
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
  };
}
