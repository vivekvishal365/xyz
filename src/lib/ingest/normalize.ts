import { isIsoDate, periodEndFor } from "./period";
import type {
  CanonicalObservation,
  IsoDate,
  ParsedObservation,
  PeriodType,
  SeriesSpec,
} from "./types";

/**
 * Normalisation: adapter output to canonical observations.
 *
 * The interesting work here is revision handling. Indian macro series are
 * revised routinely — a first-print IIP figure is not the number that will be
 * in the database a quarter later. If a revision overwrites history in place,
 * every backtest silently starts scoring against numbers nobody had at the
 * time, and §36's "did we detect it early?" metric becomes unanswerable.
 *
 * So revisions never mutate. They are classified, and a revision is recorded as
 * a new row with the prior value preserved.
 */

export type NormalizeContext = {
  sourceId: string;
  ingestRunId: string;
  contentHash: string;
  observedAt: Date;
};

export type NormalizeResult = {
  observations: CanonicalObservation[];
  warnings: string[];
  /** Rows dropped as invalid, with the reason. Never silently discarded. */
  rejected: { observation: ParsedObservation; reason: string }[];
};

export function normalize(
  parsed: readonly ParsedObservation[],
  spec: SeriesSpec,
  context: NormalizeContext,
): NormalizeResult {
  const observations: CanonicalObservation[] = [];
  const warnings: string[] = [];
  const rejected: { observation: ParsedObservation; reason: string }[] = [];

  // Last write wins within a single payload — providers occasionally repeat a
  // period in one response, and the later row is the corrected one.
  const byPeriodEnd = new Map<IsoDate, CanonicalObservation>();

  for (const row of parsed) {
    const problem = validate(row, spec);
    if (problem) {
      rejected.push({ observation: row, reason: problem });
      continue;
    }

    const periodEnd = row.periodEnd;

    if (byPeriodEnd.has(periodEnd)) {
      warnings.push(
        `${spec.indicatorKey}: payload contained ${periodEnd} more than once — keeping the last`,
      );
    }

    byPeriodEnd.set(periodEnd, {
      indicatorKey: spec.indicatorKey,
      sourceId: context.sourceId,
      sourceSeriesCode: row.sourceSeriesCode,
      periodStart: row.periodStart,
      periodEnd,
      periodType: row.periodType,
      value: row.value,
      unit: spec.unit,
      releasedAt: row.releasedAt,
      observedAt: context.observedAt,
      ingestRunId: context.ingestRunId,
      contentHash: context.contentHash,
    });
  }

  observations.push(...byPeriodEnd.values());
  observations.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  return { observations, warnings, rejected };
}

function validate(row: ParsedObservation, spec: SeriesSpec): string | null {
  if (!Number.isFinite(row.value)) {
    return `value is not finite (${row.value})`;
  }
  if (!isIsoDate(row.periodStart)) {
    return `periodStart is not a valid date (${row.periodStart})`;
  }
  if (!isIsoDate(row.periodEnd)) {
    return `periodEnd is not a valid date (${row.periodEnd})`;
  }
  if (row.periodType !== spec.periodType) {
    return `periodType ${row.periodType} does not match the spec (${spec.periodType})`;
  }
  if (row.periodEnd < row.periodStart) {
    return `periodEnd ${row.periodEnd} precedes periodStart ${row.periodStart}`;
  }

  // The adapter is supposed to have derived periodEnd from periodStart. If it
  // disagrees with our own arithmetic, one of the two is wrong and guessing
  // which is worse than rejecting the row.
  const expectedEnd = periodEndFor(row.periodStart, row.periodType);
  if (expectedEnd !== row.periodEnd) {
    return `periodEnd ${row.periodEnd} is not the end of the ${row.periodType} starting ${row.periodStart} (expected ${expectedEnd})`;
  }

  return null;
}

/** What an incoming observation means relative to what we already stored. */
export type ObservationChange =
  | { kind: "new" }
  | { kind: "unchanged" }
  | { kind: "revision"; previousValue: number; delta: number };

/**
 * Compare an incoming observation against the stored one for the same period.
 *
 * `epsilon` guards against float noise: a provider re-emitting 4.90000000001
 * for 4.9 is not a revision, and treating it as one would produce a stream of
 * phantom revision rows.
 */
export function classifyObservation(
  incoming: { value: number },
  existing: { value: number } | null,
  epsilon = 1e-9,
): ObservationChange {
  if (!existing) return { kind: "new" };

  const delta = incoming.value - existing.value;
  if (Math.abs(delta) <= epsilon) return { kind: "unchanged" };

  return { kind: "revision", previousValue: existing.value, delta };
}

/**
 * Split a batch by what it means for stored history, so the caller can insert
 * new rows, ignore unchanged ones, and record revisions without overwriting.
 */
export function diffAgainstStored(
  incoming: readonly CanonicalObservation[],
  stored: ReadonlyMap<IsoDate, { value: number }>,
): {
  toInsert: CanonicalObservation[];
  revisions: { observation: CanonicalObservation; previousValue: number; delta: number }[];
  unchanged: number;
} {
  const toInsert: CanonicalObservation[] = [];
  const revisions: { observation: CanonicalObservation; previousValue: number; delta: number }[] =
    [];
  let unchanged = 0;

  for (const observation of incoming) {
    const change = classifyObservation(observation, stored.get(observation.periodEnd) ?? null);

    switch (change.kind) {
      case "new":
        toInsert.push(observation);
        break;
      case "unchanged":
        unchanged += 1;
        break;
      case "revision":
        revisions.push({
          observation,
          previousValue: change.previousValue,
          delta: change.delta,
        });
        break;
    }
  }

  return { toInsert, revisions, unchanged };
}

/** Chronological values for the forecast module, which works on plain numbers. */
export function toSeries(
  observations: readonly CanonicalObservation[],
): { periodEnds: IsoDate[]; values: number[]; periodType: PeriodType | null } {
  const sorted = [...observations].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return {
    periodEnds: sorted.map((o) => o.periodEnd),
    values: sorted.map((o) => o.value),
    periodType: sorted[0]?.periodType ?? null,
  };
}
