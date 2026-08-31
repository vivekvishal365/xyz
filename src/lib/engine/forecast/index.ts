import { isContiguous, seasonLengthFor } from "@/lib/ingest/period";
import type { IsoDate, PeriodType } from "@/lib/ingest/types";
import { backtest, selectBestMethod, type BacktestResult } from "./backtest";
import { FORECAST_METHODS, forecastWith, type ForecastMethod } from "./methods";

export * from "./methods";
export * from "./backtest";
export * from "./surprise";

export type SeriesInput = {
  periodEnds: readonly IsoDate[];
  values: readonly number[];
  periodType: PeriodType;
};

export type IndicatorForecast = {
  /** The expected value for the next period, or null when nothing is trusted. */
  expected: number | null;
  /** The period this forecast is for. */
  forPeriodEnd: IsoDate | null;
  method: ForecastMethod | null;
  /** Rolling MAE, stored alongside the estimate so surprise can be normalised. */
  mae: number | null;
  isTrusted: boolean;
  /** Why there is no estimate. Surfaced in the admin panel, not swallowed. */
  reason: string | null;
  /** Every method's backtest, for the admin panel's model comparison. */
  evaluations: BacktestResult[];
};

/**
 * Produce the SignalX estimate for an indicator's next period (D1).
 *
 * Returns `expected: null` far more often than a naive implementation would,
 * and that is the intended behaviour. Each null is a case where publishing a
 * number would have been dishonest.
 */
export function forecastIndicator(series: SeriesInput): IndicatorForecast {
  const empty: IndicatorForecast = {
    expected: null,
    forPeriodEnd: null,
    method: null,
    mae: null,
    isTrusted: false,
    reason: null,
    evaluations: [],
  };

  if (series.values.length !== series.periodEnds.length) {
    return { ...empty, reason: "series is malformed: value and period counts differ" };
  }

  if (series.values.length < 2) {
    return { ...empty, reason: "not enough history" };
  }

  // Seasonal methods index backwards by position, so a gap would silently make
  // "12 slots ago" mean something other than the same month last year. Refuse
  // rather than forecast from a series we have misread.
  if (!isContiguous(series.periodEnds, series.periodType)) {
    return { ...empty, reason: "series has gaps or is out of order" };
  }

  const seasonLength = seasonLengthFor(series.periodType);
  const { best, all } = selectBestMethod(series.values, seasonLength, FORECAST_METHODS);

  if (!best) {
    const closest = all.find((r) => r.untrustedReason !== null);
    return {
      ...empty,
      evaluations: all,
      reason: closest?.untrustedReason ?? "no method beat the last-value baseline",
    };
  }

  const expected = forecastWith(best.method, series.values, seasonLength);
  if (expected === null) {
    return { ...empty, evaluations: all, reason: "selected method produced no forecast" };
  }

  const lastPeriodEnd = series.periodEnds.at(-1) ?? null;

  return {
    expected,
    forPeriodEnd: lastPeriodEnd === null ? null : nextPeriodEnd(lastPeriodEnd, series.periodType),
    method: best.method,
    mae: best.mae,
    isTrusted: true,
    reason: null,
    evaluations: all,
  };
}

/** Evaluate one named method, for the admin panel's per-method view. */
export function evaluateMethod(
  series: SeriesInput,
  method: ForecastMethod,
): BacktestResult {
  return backtest(series.values, method, seasonLengthFor(series.periodType));
}

function nextPeriodEnd(periodEnd: IsoDate, periodType: PeriodType): IsoDate {
  const date = new Date(`${periodEnd}T00:00:00Z`);

  switch (periodType) {
    case "day":
      return iso(new Date(date.getTime() + 86_400_000));
    case "week":
      return iso(new Date(date.getTime() + 7 * 86_400_000));
    case "month":
      return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0)));
    case "quarter":
      return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 4, 0)));
    case "year":
      return iso(new Date(Date.UTC(date.getUTCFullYear() + 1, 12, 0)));
  }
}

function iso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}
