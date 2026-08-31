import { describe, expect, it } from "vitest";
import { forecastIndicator, type SeriesInput } from "./index";

/** Monthly period ends starting at the given year-month, contiguous. */
function monthlyPeriodEnds(startYear: number, startMonth: number, count: number): string[] {
  const ends: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(startYear, startMonth + i, 0));
    ends.push(date.toISOString().slice(0, 10));
  }
  return ends;
}

function seasonalValues(count: number): number[] {
  return Array.from(
    { length: count },
    (_, i) => 100 + 0.5 * i + 5 * Math.sin((2 * Math.PI * i) / 12),
  );
}

function series(count: number, values?: number[]): SeriesInput {
  return {
    periodEnds: monthlyPeriodEnds(2020, 1, count),
    values: values ?? seasonalValues(count),
    periodType: "month",
  };
}

describe("forecastIndicator", () => {
  it("produces a trusted estimate with its error for a well-behaved series", () => {
    const result = forecastIndicator(series(96));

    expect(result.isTrusted).toBe(true);
    expect(result.expected).not.toBeNull();
    expect(result.method).not.toBeNull();
    // The MAE must come back with the estimate — surprise normalisation is
    // impossible without it, so an estimate that lacks one is unusable.
    expect(result.mae).not.toBeNull();
    expect(result.mae!).toBeGreaterThan(0);
    expect(result.reason).toBeNull();
  });

  it("forecasts the period after the last observation", () => {
    const result = forecastIndicator(series(96));
    // 96 months from Jan 2020 ends Dec 2027; next period ends Jan 2028.
    expect(result.forPeriodEnd).toBe("2028-01-31");
  });

  it("disables seasonal methods on a gappy series but still forecasts", () => {
    // A gap makes "12 slots ago" stop meaning "same month last year", so
    // seasonal methods must not run. `naive` and `drift` read only the last
    // value and the overall slope, so they stay correct — and refusing
    // outright would leave every business-day series (crude, USD/INR,
    // treasuries) with no estimate, since weekends are calendar gaps.
    const full = series(96);
    const withGap: SeriesInput = {
      periodEnds: [...full.periodEnds.slice(0, 40), ...full.periodEnds.slice(41)],
      values: [...full.values.slice(0, 40), ...full.values.slice(41)],
      periodType: "month",
    };

    const result = forecastIndicator(withGap);

    expect(result.notes.some((n) => n.includes("not calendar-contiguous"))).toBe(true);

    const seasonal = result.evaluations.filter((e) => e.method.startsWith("seasonal"));
    expect(seasonal.length).toBeGreaterThan(0);
    expect(seasonal.every((e) => !e.isTrusted)).toBe(true);
    expect(seasonal.every((e) => e.untrustedReason?.includes("season length"))).toBe(true);

    // A non-seasonal method can still be selected.
    if (result.isTrusted) {
      expect(result.method === "naive" || result.method === "drift").toBe(true);
    }
  });

  it("carries no notes for a clean contiguous series", () => {
    expect(forecastIndicator(series(96)).notes).toEqual([]);
  });

  it("refuses a malformed series", () => {
    const result = forecastIndicator({
      periodEnds: monthlyPeriodEnds(2020, 1, 10),
      values: [1, 2, 3],
      periodType: "month",
    });

    expect(result.isTrusted).toBe(false);
    expect(result.reason).toContain("malformed");
  });

  it("returns no estimate for a short series, with a reason", () => {
    const result = forecastIndicator(series(6));

    expect(result.isTrusted).toBe(false);
    expect(result.expected).toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it("returns no estimate for a flat series", () => {
    const result = forecastIndicator(series(60, Array<number>(60).fill(42)));

    expect(result.isTrusted).toBe(false);
    expect(result.expected).toBeNull();
    // D1's honesty rule: no estimate beats a meaningless one.
    expect(result.reason).not.toBeNull();
  });

  it("reports every method's evaluation for the admin panel", () => {
    const result = forecastIndicator(series(96));
    expect(result.evaluations.length).toBeGreaterThan(1);
    expect(result.evaluations.every((e) => e.method)).toBe(true);
  });
});
