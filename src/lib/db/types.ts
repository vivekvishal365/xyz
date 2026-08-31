import type { IsoDate, PeriodType } from "@/lib/ingest/types";

/**
 * Row shapes for the tables the ingestion pipeline touches.
 *
 * Hand-written rather than generated for now. When the schema settles, replace
 * these with `supabase gen types typescript` output — until then generated
 * types would need regenerating on every migration and would drift.
 */

export type SourceRow = {
  id: string;
  slug: string;
  name: string;
  url: string | null;
  category: string;
  licence_note: string | null;
  reliability: number;
};

export type IndicatorRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  country_id: string | null;
  unit: string;
  frequency: string;
  seasonality: string;
  higher_is: string;
  source_id: string;
  adapter: string;
  source_series_code: string | null;
  transform: Record<string, unknown> | null;
  /** Adapter-specific settings, e.g. coordinates for a weather series. */
  adapter_config: Record<string, unknown>;
  detection_config: Record<string, unknown>;
  release_lag_days: number | null;
  is_active: boolean;
};

export type IngestRunRow = {
  id: string;
  source_id: string;
  adapter: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "partial" | "failed";
  rows_written: number;
  error: string | null;
};

export type RawPayloadRow = {
  id: string;
  ingest_run_id: string;
  source_id: string;
  request_url: string | null;
  fetched_at: string;
  content_hash: string;
  content_type: string | null;
  body: string | null;
};

export type ObservationRow = {
  id: string;
  indicator_id: string;
  period_start: IsoDate;
  period_end: IsoDate;
  period_type: PeriodType;
  value: number;
  unit: string;
  released_at: string | null;
  ingested_at: string;
  raw_payload_id: string | null;
  source_id: string;
  revision: number;
  is_current: boolean;
};

export type ExpectationModelRow = {
  id: string;
  indicator_id: string;
  method: string;
  params: Record<string, unknown>;
  backtest_from: IsoDate | null;
  backtest_to: IsoDate | null;
  mae: number | null;
  rmse: number | null;
  naive_mae: number | null;
  is_trusted: boolean;
  evaluated_at: string | null;
};

/** Frequency values the schema accepts, mapped from our PeriodType. */
export const FREQUENCY_BY_PERIOD_TYPE: Record<PeriodType, string> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  quarter: "quarterly",
  year: "annual",
};

export function periodTypeForFrequency(frequency: string): PeriodType {
  switch (frequency) {
    case "daily":
      return "day";
    case "weekly":
      return "week";
    case "monthly":
      return "month";
    case "quarterly":
      return "quarter";
    case "annual":
      return "year";
    default:
      throw new Error(`Unsupported indicator frequency: ${frequency}`);
  }
}
