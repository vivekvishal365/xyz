/**
 * Baseline forecasting methods (D1).
 *
 * Deliberately simple and transparent. These are not trying to be good
 * forecasts — they are trying to be *defensible* ones whose error is
 * measurable, so a surprise can be expressed in units of known model error
 * rather than raw percentage points.
 *
 * Every method takes a chronological history and returns the forecast for the
 * next period, or null when there is not enough history to produce one. Null is
 * the honest answer, and callers must not substitute a number for it.
 */

export type ForecastMethod = "naive" | "seasonal_naive" | "drift" | "seasonal_naive_drift";

export const FORECAST_METHODS: readonly ForecastMethod[] = [
  "naive",
  "seasonal_naive",
  "drift",
  "seasonal_naive_drift",
];

/**
 * Last value carried forward — the random-walk benchmark.
 *
 * This is the bar every other method has to clear. For many financial series it
 * is genuinely hard to beat, which is exactly why it is the benchmark: a model
 * that cannot beat it has no business producing a user-visible number.
 */
export function naive(history: readonly number[]): number | null {
  return history.at(-1) ?? null;
}

/** The value one full season ago. Captures repeating annual shape. */
export function seasonalNaive(history: readonly number[], seasonLength: number): number | null {
  if (seasonLength < 2) return null;
  if (history.length < seasonLength) return null;
  return history[history.length - seasonLength] ?? null;
}

/**
 * Last value plus the average per-period change across the whole history.
 *
 * Equivalent to extending the straight line from the first observation to the
 * last by one period.
 */
export function drift(history: readonly number[]): number | null {
  if (history.length < 2) return null;

  const first = history[0];
  const last = history.at(-1);
  if (first === undefined || last === undefined) return null;

  const slope = (last - first) / (history.length - 1);
  return last + slope;
}

/**
 * Seasonal naive plus the trend measured between the last two seasons.
 *
 * The trend term is the year-over-year change, so a series that is both
 * seasonal and drifting (most price indices) is not systematically under- or
 * over-forecast the way plain seasonal naive would be.
 */
export function seasonalNaiveDrift(
  history: readonly number[],
  seasonLength: number,
): number | null {
  if (seasonLength < 2) return null;
  if (history.length < seasonLength * 2) return null;

  const lastSeason = history[history.length - seasonLength];
  const priorSeason = history[history.length - seasonLength * 2];
  if (lastSeason === undefined || priorSeason === undefined) return null;

  const seasonalTrend = (lastSeason - priorSeason) / seasonLength;
  return lastSeason + seasonalTrend * seasonLength;
}

export function forecastWith(
  method: ForecastMethod,
  history: readonly number[],
  seasonLength: number | null,
): number | null {
  switch (method) {
    case "naive":
      return naive(history);
    case "drift":
      return drift(history);
    case "seasonal_naive":
      return seasonLength === null ? null : seasonalNaive(history, seasonLength);
    case "seasonal_naive_drift":
      return seasonLength === null ? null : seasonalNaiveDrift(history, seasonLength);
  }
}

/** Smallest history a method can produce a forecast from. */
export function minimumHistoryFor(
  method: ForecastMethod,
  seasonLength: number | null,
): number | null {
  switch (method) {
    case "naive":
      return 1;
    case "drift":
      return 2;
    case "seasonal_naive":
      return seasonLength === null ? null : seasonLength;
    case "seasonal_naive_drift":
      return seasonLength === null ? null : seasonLength * 2;
  }
}
