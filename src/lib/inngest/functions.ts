import { cron, NonRetriableError } from "inngest";
import { getIndicatorBySlug, listActiveIndicators } from "@/lib/db/repositories";
import { createServiceClient } from "@/lib/supabase/service";
import { applyStage, fetchStage, forecastStage } from "@/lib/ingest/pipeline";
import type { AdapterDeps } from "@/lib/ingest/types";
import { inngest } from "./client";
import { indicatorIngest, ingestScheduled } from "./events";

/** How far back a routine run asks for. Cheap, and it lets revisions surface. */
const DEFAULT_FROM = "2015-01-01";

function adapterDeps(adapter: string): AdapterDeps {
  return {
    fetch: globalThis.fetch,
    now: () => new Date(),
    apiKey: adapter === "fred" ? process.env.FRED_API_KEY : undefined,
  };
}

/**
 * Cron entry point. Fans out one event per indicator rather than looping here.
 *
 * The fan-out is the point: one slow or failing source cannot hold up the rest,
 * each indicator retries independently, and the run is no longer bounded by a
 * single function's execution limit.
 */
export const scheduledIngest = inngest.createFunction(
  {
    id: "scheduled-ingest",
    name: "Scheduled ingest (fan-out)",
    triggers: [
      // 05:30 IST — the daily macro pull in 03-data-sources.md §5.
      cron("TZ=Asia/Kolkata 30 5 * * *"),
      ingestScheduled,
    ],
  },
  async ({ event, step }) => {
    // Fires from cron as well as from an event, and a cron firing carries no
    // data — so neither `event` nor its `data` can be assumed present.
    const data = (event?.data ?? {}) as { adapter?: string; from?: string };
    const from = data.from ?? DEFAULT_FROM;
    const to = new Date().toISOString().slice(0, 10);

    const indicators = await step.run("list-active-indicators", async () => {
      const db = createServiceClient();
      const rows = await listActiveIndicators(db, data.adapter ? { adapter: data.adapter } : {});
      return rows.map((row) => ({ id: row.id, slug: row.slug }));
    });

    if (indicators.length === 0) {
      return { dispatched: 0, note: "no active indicators matched" };
    }

    await step.sendEvent(
      "dispatch-indicators",
      indicators.map((indicator) =>
        indicatorIngest.create({
          indicatorId: indicator.id,
          indicatorSlug: indicator.slug,
          from,
          to,
        }),
      ),
    );

    return { dispatched: indicators.length, from, to };
  },
);

/**
 * One indicator, as three durable steps.
 *
 * Splitting them means a parse failure retries the parse — not the fetch — so a
 * bug fix replays against stored bytes instead of hammering the provider, and a
 * provider timeout does not discard work already done.
 */
export const ingestOneIndicator = inngest.createFunction(
  {
    id: "ingest-indicator",
    name: "Ingest one indicator",
    triggers: [indicatorIngest],
    // Government endpoints are the fragile part of this system, and a stampede
    // is the fastest way to get rate-limited or blocked.
    concurrency: 4,
    retries: 3,
  },
  async ({ event, step }) => {
    const { indicatorSlug, from, to } = event.data;

    const indicator = await step.run("load-indicator", async () => {
      const db = createServiceClient();
      const row = await getIndicatorBySlug(db, indicatorSlug);
      // Retrying will not conjure a deleted indicator or a missing series code.
      if (!row) throw new NonRetriableError(`indicator ${indicatorSlug} not found`);
      if (!row.source_series_code) {
        throw new NonRetriableError(`indicator ${indicatorSlug} has no source_series_code`);
      }
      return row;
    });

    const fetched = await step.run("fetch-and-store", async () =>
      fetchStage(createServiceClient(), indicator, { from, to }, adapterDeps(indicator.adapter)),
    );

    const applied = await step.run("parse-and-apply", async () =>
      applyStage(createServiceClient(), indicator, fetched),
    );

    // Runs even when the payload was unchanged: history can shift underneath an
    // indicator for reasons unrelated to this fetch, and a stale backtest is
    // exactly what D1 exists to prevent.
    const forecast = await step.run("refresh-forecast", async () =>
      forecastStage(createServiceClient(), indicator),
    );

    return {
      slug: indicatorSlug,
      unchangedPayload: fetched.alreadySeen,
      applied: applied.applied,
      rejected: applied.rejected,
      warnings: applied.warnings.length,
      forecast: {
        isTrusted: forecast.isTrusted,
        method: forecast.method,
        expected: forecast.expected,
        mae: forecast.mae,
        reason: forecast.reason,
      },
    };
  },
);

export const functions = [scheduledIngest, ingestOneIndicator];
