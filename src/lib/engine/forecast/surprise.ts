/**
 * Surprise measurement (D1).
 *
 * The rule that makes model-based expectations usable: **surprise is measured
 * in units of the model's own historical error, not in raw percentage points.**
 *
 * A seasonal-naive baseline is wrong in predictable, seasonal ways. A detector
 * comparing raw values would flag every one of those routine misses as a
 * surprise, and an app that cries wolf twelve times a year teaches users to
 * ignore it — the exact failure §29 exists to prevent.
 *
 * Dividing by rolling MAE asks the only question that matters: is this miss
 * large *relative to how wrong this model usually is*?
 */

export type SurpriseSignificance = "none" | "notable" | "significant" | "major";

export type Surprise = {
  actual: number;
  expected: number;
  /** Raw difference, in the indicator's own units. For display. */
  delta: number;
  /** Delta in units of the model's historical MAE. For decisions. */
  score: number;
  significance: SurpriseSignificance;
  direction: -1 | 0 | 1;
};

/**
 * Thresholds in MAE multiples.
 *
 * Set deliberately high. At 1× MAE the model is merely being as wrong as usual,
 * which is not news; the bar for "significant" is roughly a doubling of typical
 * error. These are tunable per indicator once real data exists — the point for
 * now is that they are stated in one place rather than scattered as magic
 * numbers through the detector.
 */
export const SURPRISE_THRESHOLDS = {
  notable: 1.5,
  significant: 2.5,
  major: 4,
} as const;

/**
 * @param modelMae the model's rolling mean absolute error from backtest. Must
 *   be positive — an expectation without a measured error cannot produce a
 *   trustworthy surprise, so this returns null rather than guessing.
 */
export function measureSurprise(
  actual: number,
  expected: number,
  modelMae: number | null,
): Surprise | null {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return null;
  if (modelMae === null || !Number.isFinite(modelMae) || modelMae <= 0) return null;

  const delta = actual - expected;
  const score = delta / modelMae;
  const magnitude = Math.abs(score);

  let significance: SurpriseSignificance = "none";
  if (magnitude >= SURPRISE_THRESHOLDS.major) significance = "major";
  else if (magnitude >= SURPRISE_THRESHOLDS.significant) significance = "significant";
  else if (magnitude >= SURPRISE_THRESHOLDS.notable) significance = "notable";

  return {
    actual,
    expected,
    delta,
    score,
    significance,
    direction: delta > 0 ? 1 : delta < 0 ? -1 : 0,
  };
}

/**
 * Confidence weight for a surprise, 0–1, feeding the signal confidence score.
 *
 * Capped at 0.75 on purpose. A surprise measured against a SignalX model
 * estimate is weaker evidence than one measured against an analyst consensus:
 * consensus tells you the market was positioned differently, whereas our model
 * only tells you the number differed from a statistical extrapolation. D1
 * accepted that trade, and this is where the discount is actually applied
 * rather than merely described.
 */
export const MODEL_BASIS_CONFIDENCE_CAP = 0.75;

export function surpriseConfidence(
  surprise: Surprise,
  basis: "model" | "consensus",
): number {
  const magnitude = Math.abs(surprise.score);

  // Saturating curve: more surprise means more confidence that something real
  // happened, with diminishing returns past the "major" threshold.
  const raw = Math.min(1, magnitude / SURPRISE_THRESHOLDS.major);

  return basis === "model" ? raw * MODEL_BASIS_CONFIDENCE_CAP : raw;
}

/**
 * How a surprise should be described to a user.
 *
 * Never the bare word "Expected" (D1) — that reads as analyst consensus, which
 * this is not. Wording lives here rather than in a component so every surface
 * says the same thing.
 */
export function describeExpectation(basis: "model" | "consensus"): string {
  return basis === "model" ? "SignalX estimate" : "Analyst consensus";
}
