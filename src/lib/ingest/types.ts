/**
 * Core ingestion types.
 *
 * The distinction that matters most here is between the two timestamps on an
 * observation. `periodEnd` is what the number *describes*; `releasedAt` is when
 * the world learned it. Conflating them makes point-in-time correctness
 * impossible, which in turn makes §36's accuracy metrics meaningless — you
 * cannot honestly claim you detected something early if you are backtesting
 * against numbers nobody had at the time.
 */

export type PeriodType = "day" | "week" | "month" | "quarter" | "year";

/** ISO calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/**
 * An untouched provider response, hashed and stored before anything parses it.
 * Never overwritten: provenance (§26) and replay both depend on it surviving.
 */
export type RawPayload = {
  sourceId: string;
  /** The provider's own identifier for the series, e.g. a FRED series id. */
  sourceSeriesCode: string;
  url: string;
  /** When we fetched it. */
  fetchedAt: Date;
  /** SHA-256 of `body`. Identical hash means identical response — skip re-parse. */
  contentHash: string;
  body: string;
  httpStatus: number;
};

/** One data point as the adapter understood it, before canonicalisation. */
export type ParsedObservation = {
  sourceSeriesCode: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  periodType: PeriodType;
  value: number;
  /** Provider's stated unit, before mapping to our canonical unit. */
  unit: string;
  /**
   * When the provider published this figure, when they tell us. Many do not,
   * in which case this stays null and downstream code must not invent one.
   */
  releasedAt: Date | null;
};

/** A parsed observation resolved against our own indicator registry. */
export type CanonicalObservation = {
  indicatorKey: string;
  sourceId: string;
  sourceSeriesCode: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  periodType: PeriodType;
  value: number;
  unit: string;
  releasedAt: Date | null;
  observedAt: Date;
  ingestRunId: string;
  contentHash: string;
};

export type ParseResult = {
  observations: ParsedObservation[];
  /**
   * Non-fatal problems: a missing value, an unparseable row, a gap. Surfaced
   * rather than swallowed — a source that starts emitting warnings is usually a
   * source that is about to break.
   */
  warnings: string[];
};

/** What an adapter needs to know to pull one series. */
export type SeriesSpec = {
  /** Our canonical key, e.g. `in.cpi.yoy`. Stable across source changes. */
  indicatorKey: string;
  sourceSeriesCode: string;
  periodType: PeriodType;
  /** Canonical unit we store in, e.g. `percent`, `index`, `mm`. */
  unit: string;
  /** Adapter-specific settings — coordinates for weather, transforms for FRED. */
  config?: Record<string, unknown>;
};

export type FetchWindow = {
  from: IsoDate;
  to: IsoDate;
};

/**
 * Injected dependencies. Everything non-deterministic an adapter touches comes
 * through here, so adapters are testable without network access or a clock.
 */
export type AdapterDeps = {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  /** Provider credential, when the provider needs one. */
  apiKey?: string | undefined;
};

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly meta: { sourceId: string; sourceSeriesCode: string; httpStatus?: number },
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
