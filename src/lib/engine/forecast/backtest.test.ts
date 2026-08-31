import { describe, expect, it } from "vitest";
import { backtest, selectBestMethod } from "./backtest";
import { FORECAST_METHODS } from "./methods";

/** Repeating annual shape with a steady upward trend — like a price index. */
function seasonalSeries(years: number, amplitude = 5, trendPerMonth = 0.5): number[] {
  const values: number[] = [];
  for (let i = 0; i < years * 12; i += 1) {
    values.push(100 + trendPerMonth * i + amplitude * Math.sin((2 * Math.PI * i) / 12));
  }
  return values;
}

/** Deterministic pseudo-random walk — no seasonal structure to find. */
function randomWalk(n: number, seed = 42): number[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648 - 0.5;
  };
  const values = [100];
  for (let i = 1; i < n; i += 1) {
    values.push((values[i - 1] ?? 100) + next() * 4);
  }
  return values;
}

describe("backtest", () => {
  it("never lets future data reach a forecast", () => {
    // A series that is flat then jumps. If the backtest leaked future values,
    // the pre-jump forecasts would somehow anticipate it and MAE would be ~0.
    const values = [...Array<number>(24).fill(10), ...Array<number>(12).fill(99)];
    const result = backtest(values, "naive", 12);

    // The naive method must be caught out by the jump exactly once.
    expect(result.mae).toBeGreaterThan(0);
    expect(result.n).toBeGreaterThan(0);
  });

  it("finds seasonal structure that the naive baseline misses", () => {
    const result = backtest(seasonalSeries(6), "seasonal_naive_drift", 12);

    expect(result.isTrusted).toBe(true);
    expect(result.mae).not.toBeNull();
    expect(result.naiveMae).not.toBeNull();
    expect(result.mae!).toBeLessThan(result.naiveMae!);
    expect(result.relativeSkill!).toBeGreaterThan(0);
  });

  it("refuses to trust a model that cannot beat last-value on a random walk", () => {
    // This is the case the whole trust rule exists for: on a random walk,
    // nothing beats carrying the last value forward.
    const result = backtest(randomWalk(120), "seasonal_naive", 12);

    expect(result.isTrusted).toBe(false);
    expect(result.untrustedReason).toContain("does not beat last-value baseline");
  });

  it("refuses when there are too few evaluation points", () => {
    const result = backtest(seasonalSeries(2), "seasonal_naive_drift", 12);

    expect(result.isTrusted).toBe(false);
    expect(result.untrustedReason).toMatch(/evaluation points|not enough history/);
  });

  it("refuses a series that does not vary", () => {
    // Nothing can beat a zero-error benchmark, and a flat indicator has no
    // surprises to detect anyway.
    const result = backtest(Array<number>(60).fill(7), "drift", 12);

    expect(result.isTrusted).toBe(false);
    expect(result.untrustedReason).toBe("series does not vary; no baseline to improve on");
  });

  it("refuses seasonal methods when there is no season length", () => {
    const result = backtest(seasonalSeries(6), "seasonal_naive", null);

    expect(result.isTrusted).toBe(false);
    expect(result.untrustedReason).toContain("needs a season length");
  });

  it("scores the method and the benchmark over the same points", () => {
    // Otherwise a method could win by declining to forecast the hard periods.
    const values = seasonalSeries(5);
    const seasonal = backtest(values, "seasonal_naive_drift", 12);
    const naiveResult = backtest(values, "naive", 12);

    // seasonal_naive_drift needs 24 points of history, naive needs 1 — but the
    // naiveMae recorded inside each result is computed over that result's own
    // evaluation window, so compare like with like.
    expect(seasonal.n).toBeLessThan(naiveResult.n);
    expect(seasonal.naiveMae).not.toBe(naiveResult.mae);
  });

  it("computes rmse at or above mae", () => {
    const result = backtest(seasonalSeries(6), "seasonal_naive_drift", 12);
    expect(result.rmse!).toBeGreaterThanOrEqual(result.mae!);
  });
});

describe("selectBestMethod", () => {
  it("picks the lowest-error trusted method", () => {
    const { best, all } = selectBestMethod(seasonalSeries(8), 12, FORECAST_METHODS);

    expect(best).not.toBeNull();
    expect(best!.isTrusted).toBe(true);
    expect(all).toHaveLength(FORECAST_METHODS.length);

    for (const other of all.filter((r) => r.isTrusted)) {
      expect(best!.mae!).toBeLessThanOrEqual(other.mae!);
    }
  });

  it("returns null when nothing is trustworthy — the honest outcome", () => {
    const { best } = selectBestMethod(randomWalk(120), 12, ["seasonal_naive"]);
    expect(best).toBeNull();
  });

  it("falls back to the naive baseline on a random walk", () => {
    // Nothing beats last-value on a random walk. Refusing to publish anything
    // at all would leave most financial series with no estimate and no
    // surprise detection, so carrying the last value forward is allowed —
    // its MAE is the typical period-on-period move, which is exactly the right
    // yardstick for "was this change unusual?".
    const { best } = selectBestMethod(randomWalk(200), 12, FORECAST_METHODS);

    expect(best).not.toBeNull();
    expect(best!.method).toBe("naive");
    expect(best!.mae!).toBeGreaterThan(0);
  });

  it("still prefers a genuinely better method over the baseline", () => {
    const { best } = selectBestMethod(seasonalSeries(8), 12, FORECAST_METHODS);

    expect(best!.method).not.toBe("naive");
    expect(best!.relativeSkill!).toBeGreaterThan(0);
  });

  it("scores every method over an identical window", () => {
    // Otherwise a method needing 24 periods of history is judged on a
    // different stretch of the series than one needing 1, and comparing their
    // MAEs picks a winner on the strength of an easier sample.
    const { all } = selectBestMethod(seasonalSeries(8), 12, FORECAST_METHODS);

    const counts = new Set(all.map((r) => r.n));
    expect(counts.size).toBe(1);

    const benchmarks = new Set(all.map((r) => r.naiveMae?.toFixed(9)));
    expect(benchmarks.size).toBe(1);
  });

  it("falls back to per-method windows when a common one is too short", () => {
    // A comparable-but-empty comparison is worse than a rough one.
    const { all } = selectBestMethod(seasonalSeries(2), 12, FORECAST_METHODS);
    const evaluated = all.filter((r) => r.n > 0);
    expect(evaluated.length).toBeGreaterThan(0);
  });
});
