import { describe, expect, it } from "vitest";
import { classifyObservation, diffAgainstStored, normalize, toSeries } from "./normalize";
import type { CanonicalObservation, ParsedObservation, SeriesSpec } from "./types";

const spec: SeriesSpec = {
  indicatorKey: "in.cpi.yoy",
  sourceSeriesCode: "INDCPIALLMINMEI",
  periodType: "month",
  unit: "percent",
};

const context = {
  sourceId: "fred",
  ingestRunId: "run-1",
  contentHash: "abc123",
  observedAt: new Date("2026-08-31T00:00:00Z"),
};

function parsed(overrides: Partial<ParsedObservation> = {}): ParsedObservation {
  return {
    sourceSeriesCode: "INDCPIALLMINMEI",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    periodType: "month",
    value: 5.4,
    unit: "percent",
    releasedAt: null,
    ...overrides,
  };
}

describe("normalize", () => {
  it("canonicalises and sorts chronologically", () => {
    const result = normalize(
      [
        parsed({ periodStart: "2026-07-01", periodEnd: "2026-07-31", value: 5.4 }),
        parsed({ periodStart: "2026-05-01", periodEnd: "2026-05-31", value: 4.9 }),
        parsed({ periodStart: "2026-06-01", periodEnd: "2026-06-30", value: 5.1 }),
      ],
      spec,
      context,
    );

    expect(result.observations.map((o) => o.periodEnd)).toEqual([
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
    ]);
    expect(result.observations[0]?.indicatorKey).toBe("in.cpi.yoy");
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects a periodEnd that is not the end of its period", () => {
    // Catches an adapter computing period boundaries wrongly, which would
    // otherwise put a figure in the wrong month forever.
    const result = normalize([parsed({ periodEnd: "2026-07-15" })], spec, context);

    expect(result.observations).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("is not the end of the month");
  });

  it("rejects rather than silently dropping bad rows", () => {
    const result = normalize(
      [
        parsed({ value: Number.NaN }),
        parsed({ periodStart: "not-a-date", periodEnd: "2026-07-31" }),
        parsed({ periodType: "quarter" }),
      ],
      spec,
      context,
    );

    expect(result.observations).toHaveLength(0);
    expect(result.rejected).toHaveLength(3);
    // Every rejection carries a reason — nothing disappears without a trace.
    expect(result.rejected.every((r) => r.reason.length > 0)).toBe(true);
  });

  it("keeps the last row when a payload repeats a period, and says so", () => {
    const result = normalize(
      [parsed({ value: 5.0 }), parsed({ value: 5.4 })],
      spec,
      context,
    );

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.value).toBe(5.4);
    expect(result.warnings[0]).toContain("more than once");
  });
});

describe("classifyObservation", () => {
  it("detects a genuine revision and keeps the previous value", () => {
    const change = classifyObservation({ value: 5.6 }, { value: 5.4 });

    expect(change.kind).toBe("revision");
    if (change.kind === "revision") {
      expect(change.previousValue).toBe(5.4);
      expect(change.delta).toBeCloseTo(0.2, 10);
    }
  });

  it("does not treat float noise as a revision", () => {
    // A provider re-emitting 4.900000000001 for 4.9 would otherwise produce a
    // stream of phantom revision rows.
    expect(classifyObservation({ value: 4.9 + 1e-12 }, { value: 4.9 }).kind).toBe("unchanged");
  });

  it("reports new when nothing is stored", () => {
    expect(classifyObservation({ value: 5.4 }, null).kind).toBe("new");
  });
});

describe("diffAgainstStored", () => {
  it("separates inserts, revisions and unchanged rows", () => {
    const incoming = normalize(
      [
        parsed({ periodStart: "2026-05-01", periodEnd: "2026-05-31", value: 4.9 }),
        parsed({ periodStart: "2026-06-01", periodEnd: "2026-06-30", value: 5.2 }),
        parsed({ periodStart: "2026-07-01", periodEnd: "2026-07-31", value: 5.4 }),
      ],
      spec,
      context,
    ).observations;

    const stored = new Map([
      ["2026-05-31", { value: 4.9 }], // unchanged
      ["2026-06-30", { value: 5.1 }], // revised up to 5.2
      // July is new
    ]);

    const result = diffAgainstStored(incoming, stored);

    expect(result.unchanged).toBe(1);
    expect(result.toInsert.map((o) => o.periodEnd)).toEqual(["2026-07-31"]);
    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]?.previousValue).toBe(5.1);
    expect(result.revisions[0]?.delta).toBeCloseTo(0.1, 10);
  });

  it("never mutates the stored value in place", () => {
    // Revisions are recorded, not applied — point-in-time correctness depends
    // on the original print surviving.
    const stored = new Map([["2026-07-31", { value: 5.1 }]]);
    const incoming = normalize([parsed({ value: 5.4 })], spec, context).observations;

    diffAgainstStored(incoming, stored);

    expect(stored.get("2026-07-31")?.value).toBe(5.1);
  });
});

describe("toSeries", () => {
  it("returns chronological values for the forecast module", () => {
    const observations = normalize(
      [
        parsed({ periodStart: "2026-07-01", periodEnd: "2026-07-31", value: 5.4 }),
        parsed({ periodStart: "2026-05-01", periodEnd: "2026-05-31", value: 4.9 }),
      ],
      spec,
      context,
    ).observations;

    const series = toSeries(observations as CanonicalObservation[]);

    expect(series.values).toEqual([4.9, 5.4]);
    expect(series.periodEnds).toEqual(["2026-05-31", "2026-07-31"]);
    expect(series.periodType).toBe("month");
  });
});
