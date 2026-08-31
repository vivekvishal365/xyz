import type { IsoDate, PeriodType } from "./types";

/**
 * Period arithmetic.
 *
 * All maths is done in UTC on `YYYY-MM-DD` strings. Local-time date handling is
 * how you end up with a monthly figure landing in the wrong month for users on
 * one side of the dateline, and the whole product is date-keyed.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: IsoDate): Date {
  if (!isIsoDate(value)) {
    throw new RangeError(`Not a valid ISO date: ${value}`);
  }
  return new Date(`${value}T00:00:00Z`);
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Last day of the month containing `date`. */
function endOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/**
 * Given the first day of a period, the last day of that period.
 *
 * Providers overwhelmingly date periods by their start (FRED dates a monthly
 * series to the 1st), but a signal about "August CPI" is about a period that
 * ended on 31 August, and comparisons need the end.
 */
export function periodEndFor(periodStart: IsoDate, periodType: PeriodType): IsoDate {
  const start = parseIsoDate(periodStart);

  switch (periodType) {
    case "day":
      return toIsoDate(start);
    case "week":
      return toIsoDate(addDaysUtc(start, 6));
    case "month":
      return toIsoDate(endOfMonthUtc(start));
    case "quarter": {
      const quarterStartMonth = Math.floor(start.getUTCMonth() / 3) * 3;
      return toIsoDate(new Date(Date.UTC(start.getUTCFullYear(), quarterStartMonth + 3, 0)));
    }
    case "year":
      return toIsoDate(new Date(Date.UTC(start.getUTCFullYear(), 12, 0)));
  }
}

/**
 * The start of the period following the one that ends on `periodEnd`.
 *
 * No period type needed: the day after any period ends is the first day of the
 * next one, whatever its length.
 */
export function nextPeriodStart(periodEnd: IsoDate): IsoDate {
  return toIsoDate(addDaysUtc(parseIsoDate(periodEnd), 1));
}

/** How many periods of `periodType` separate two period ends. Negative if b precedes a. */
export function periodsBetween(a: IsoDate, b: IsoDate, periodType: PeriodType): number {
  const start = parseIsoDate(a);
  const end = parseIsoDate(b);

  switch (periodType) {
    case "day":
      return Math.round((end.getTime() - start.getTime()) / 86_400_000);
    case "week":
      return Math.round((end.getTime() - start.getTime()) / (7 * 86_400_000));
    case "month":
      return (
        (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (end.getUTCMonth() - start.getUTCMonth())
      );
    case "quarter":
      return (
        (end.getUTCFullYear() - start.getUTCFullYear()) * 4 +
        (Math.floor(end.getUTCMonth() / 3) - Math.floor(start.getUTCMonth() / 3))
      );
    case "year":
      return end.getUTCFullYear() - start.getUTCFullYear();
  }
}

/**
 * How many observations make a full seasonal cycle.
 *
 * Returns null for period types with no meaningful annual season — a yearly
 * series has no within-year pattern to exploit, and pretending otherwise would
 * give the seasonal-naive method a season length of 1, silently turning it into
 * the naive baseline it is supposed to be measured against.
 */
export function seasonLengthFor(periodType: PeriodType): number | null {
  switch (periodType) {
    case "day":
      return 365;
    case "week":
      return 52;
    case "month":
      return 12;
    case "quarter":
      return 4;
    case "year":
      return null;
  }
}

/**
 * True when every consecutive pair of period ends is exactly one period apart.
 *
 * Seasonal methods index backwards by position (`value 12 slots ago`), which is
 * only the same month last year if the series has no gaps. A missing month in a
 * government series would silently shift every seasonal lookup by one.
 */
export function isContiguous(periodEnds: readonly IsoDate[], periodType: PeriodType): boolean {
  for (let i = 1; i < periodEnds.length; i += 1) {
    const previous = periodEnds[i - 1];
    const current = periodEnds[i];
    if (previous === undefined || current === undefined) return false;
    if (periodsBetween(previous, current, periodType) !== 1) return false;
  }
  return true;
}
