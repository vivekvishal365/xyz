import {
  forecastWith,
  minimumHistoryFor,
  naive,
  type ForecastMethod,
} from "./methods";

/**
 * Rolling-origin backtest (D1).
 *
 * The rule this file exists to enforce: **an indicator whose model fails
 * backtest publishes no estimate at all.** A bad expected value is worse than
 * none, because §14's surprise detection compares against it and would
 * manufacture surprises out of the model's own systematic error.
 *
 * Evaluation walks forward through history one period at a time, forecasting
 * each point from only the data that preceded it. No future information reaches
 * a forecast, which is the whole point — an in-sample fit would flatter every
 * method and tell us nothing about how it behaves on the next real print.
 */

export type BacktestOptions = {
  /**
   * Minimum forecast/actual pairs before a verdict is meaningful. Twelve is a
   * full seasonal cycle for monthly data — enough that a method cannot look
   * good purely by having been lucky in one part of the year.
   */
  minEvaluationPoints?: number;
  /**
   * Force evaluation to begin at this index instead of the method's own
   * minimum. `selectBestMethod` uses it to score every method over an identical
   * window — without that, a method needing 24 periods of history is scored on
   * a different (and possibly easier) stretch of the series than one needing 1,
   * and comparing their MAEs is meaningless.
   */
  startIndex?: number;
};

export type BacktestResult = {
  method: ForecastMethod;
  /** Number of forecast/actual pairs evaluated. */
  n: number;
  mae: number | null;
  rmse: number | null;
  /** MAE of last-value-carried-forward over the same points. The benchmark. */
  naiveMae: number | null;
  /**
   * 1 − mae/naiveMae. Positive means better than the random walk; 0.2 means it
   * cut the average error by a fifth. Surfaced in the admin panel so the margin
   * is visible rather than just the pass/fail.
   */
  relativeSkill: number | null;
  isTrusted: boolean;
  /** Why it was not trusted, for the admin panel and the logs. */
  untrustedReason: string | null;
};

export function backtest(
  values: readonly number[],
  method: ForecastMethod,
  seasonLength: number | null,
  options: BacktestOptions = {},
): BacktestResult {
  const minEvaluationPoints = options.minEvaluationPoints ?? 12;
  const methodMinimum = minimumHistoryFor(method, seasonLength);

  const empty: BacktestResult = {
    method,
    n: 0,
    mae: null,
    rmse: null,
    naiveMae: null,
    relativeSkill: null,
    isTrusted: false,
    untrustedReason: null,
  };

  if (methodMinimum === null) {
    return { ...empty, untrustedReason: `${method} needs a season length, none available` };
  }

  const minHistory = Math.max(methodMinimum, options.startIndex ?? 0);

  const absoluteErrors: number[] = [];
  const squaredErrors: number[] = [];
  const naiveAbsoluteErrors: number[] = [];

  for (let i = minHistory; i < values.length; i += 1) {
    const train = values.slice(0, i);
    const actual = values[i];
    if (actual === undefined) continue;

    const predicted = forecastWith(method, train, seasonLength);
    const naivePredicted = naive(train);

    // Only score points where BOTH the method and the benchmark produced a
    // forecast. Comparing MAEs computed over different point sets would let a
    // method win by declining to forecast the hard periods.
    if (predicted === null || naivePredicted === null) continue;

    const error = actual - predicted;
    absoluteErrors.push(Math.abs(error));
    squaredErrors.push(error * error);
    naiveAbsoluteErrors.push(Math.abs(actual - naivePredicted));
  }

  const n = absoluteErrors.length;
  if (n === 0) {
    return { ...empty, untrustedReason: "not enough history to evaluate" };
  }

  const mae = mean(absoluteErrors);
  const rmse = Math.sqrt(mean(squaredErrors));
  const naiveMae = mean(naiveAbsoluteErrors);

  const relativeSkill = naiveMae === 0 ? null : 1 - mae / naiveMae;

  const result: Omit<BacktestResult, "isTrusted" | "untrustedReason"> = {
    method,
    n,
    mae,
    rmse,
    naiveMae,
    relativeSkill,
  };

  if (n < minEvaluationPoints) {
    return {
      ...result,
      isTrusted: false,
      untrustedReason: `only ${n} evaluation points, need ${minEvaluationPoints}`,
    };
  }

  // A perfectly flat series gives the benchmark zero error. Nothing can beat
  // that, and an indicator that never moves has no surprises to detect anyway.
  if (naiveMae === 0) {
    return {
      ...result,
      isTrusted: false,
      untrustedReason: "series does not vary; no baseline to improve on",
    };
  }

  // `naive` IS the benchmark, so comparing it against itself is tautological —
  // it would always tie and never qualify. That would leave every series where
  // nothing beats a random walk with no estimate at all, which is most
  // financial series, and would gut §14's surprise detection.
  //
  // Carrying the last value forward is a defensible expectation as long as it
  // is labelled honestly, and its MAE — the typical period-on-period move — is
  // exactly the right yardstick for "was this change unusual?".
  if (method !== "naive" && mae >= naiveMae) {
    return {
      ...result,
      isTrusted: false,
      untrustedReason: `does not beat last-value baseline (mae ${round(mae)} vs ${round(naiveMae)})`,
    };
  }

  return { ...result, isTrusted: true, untrustedReason: null };
}

/**
 * Run every method and return the best trusted one, or null if none qualify.
 *
 * Returning null is a real outcome, not an error case: it means this indicator
 * shows no SignalX estimate, and the UI must render that absence rather than
 * fall back to something.
 */
export function selectBestMethod(
  values: readonly number[],
  seasonLength: number | null,
  methods: readonly ForecastMethod[],
  options: BacktestOptions = {},
): { best: BacktestResult | null; all: BacktestResult[] } {
  // Score every method over the same window, starting where the most
  // history-hungry candidate can first produce a forecast. Otherwise their
  // MAEs cover different stretches of the series and picking the lowest is
  // comparing a method's performance on one period against another's on a
  // different one.
  const commonStart = methods.reduce((widest, method) => {
    const required = minimumHistoryFor(method, seasonLength);
    return required === null ? widest : Math.max(widest, required);
  }, 0);

  // If the common window leaves too little to evaluate, fall back to per-method
  // windows — a comparable-but-empty comparison is worse than a rough one.
  const minEvaluationPoints = options.minEvaluationPoints ?? 12;
  const useCommonWindow = values.length - commonStart >= minEvaluationPoints;

  const all = methods.map((method) =>
    backtest(values, method, seasonLength, {
      ...options,
      ...(useCommonWindow ? { startIndex: commonStart } : {}),
    }),
  );

  const trusted = all.filter((r) => r.isTrusted && r.mae !== null);
  trusted.sort((a, b) => (a.mae ?? Infinity) - (b.mae ?? Infinity));

  return { best: trusted[0] ?? null, all };
}

function mean(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function round(value: number): string {
  return value.toFixed(4);
}
