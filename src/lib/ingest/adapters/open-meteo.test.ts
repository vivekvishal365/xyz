import { describe, expect, it, vi } from "vitest";
import { openMeteoAdapter } from "./open-meteo";
import { AdapterParseError } from "../adapter";
import type { AdapterDeps, RawPayload, SeriesSpec } from "../types";

/** Mumbai, daily rainfall. */
const spec: SeriesSpec = {
  indicatorKey: "in.rainfall.mumbai",
  sourceSeriesCode: "mumbai_precip",
  periodType: "day",
  unit: "mm",
  config: { latitude: 19.076, longitude: 72.8777, daily: "precipitation_sum" },
};

const BODY = JSON.stringify({
  latitude: 19.0,
  longitude: 72.875,
  daily: {
    time: ["2026-06-01", "2026-06-02", "2026-06-03"],
    precipitation_sum: [12.4, null, 30.1],
  },
});

function deps(overrides: Partial<AdapterDeps> = {}): AdapterDeps {
  return {
    fetch: vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(BODY, { status: 200 })),
    now: () => new Date("2026-08-31T06:00:00Z"),
    ...overrides,
  };
}

function payload(body: string): RawPayload {
  return {
    sourceId: "open_meteo",
    sourceSeriesCode: spec.sourceSeriesCode,
    url: "https://archive-api.open-meteo.com/v1/archive",
    fetchedAt: new Date("2026-08-31T06:00:00Z"),
    contentHash: "hash",
    body,
    httpStatus: 200,
  };
}

describe("openMeteoAdapter.fetch", () => {
  it("builds the archive query from the series config", async () => {
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(BODY, { status: 200 }));
    await openMeteoAdapter.fetch(
      spec,
      { from: "2026-06-01", to: "2026-06-03" },
      deps({ fetch: fetchSpy }),
    );

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain("latitude=19.076");
    expect(url).toContain("daily=precipitation_sum");
    expect(url).toContain("start_date=2026-06-01");
    expect(url).toContain("timezone=Asia%2FKolkata");
  });

  it("refuses a series missing its coordinates", async () => {
    const bad: SeriesSpec = { ...spec, config: { daily: "precipitation_sum" } };
    await expect(
      openMeteoAdapter.fetch(bad, { from: "2026-06-01", to: "2026-06-03" }, deps()),
    ).rejects.toBeInstanceOf(AdapterParseError);
  });

  it("needs no API key", () => {
    expect(openMeteoAdapter.requiresApiKey).toBe(false);
  });
});

describe("openMeteoAdapter.parse", () => {
  it("pairs dates with values and skips gaps", () => {
    const { observations, warnings } = openMeteoAdapter.parse(payload(BODY), spec);

    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      periodStart: "2026-06-01",
      periodEnd: "2026-06-01",
      periodType: "day",
      value: 12.4,
      unit: "mm",
    });
    expect(observations[1]?.value).toBe(30.1);
    expect(warnings[0]).toContain("no value for 2026-06-02");
  });

  it("does not read a null reading as zero rainfall", () => {
    // A day with no reading is not a dry day, and the difference matters for a
    // rainfall-departure signal.
    const { observations } = openMeteoAdapter.parse(payload(BODY), spec);
    expect(observations.map((o) => o.periodEnd)).not.toContain("2026-06-02");
    expect(observations.some((o) => o.value === 0)).toBe(false);
  });

  it("keeps zero as a real reading", () => {
    // Genuine zero rainfall must survive — only null is a gap.
    const body = JSON.stringify({
      daily: { time: ["2026-06-01"], precipitation_sum: [0] },
    });

    const { observations } = openMeteoAdapter.parse(payload(body), spec);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.value).toBe(0);
  });

  it("reads the overlap and warns when arrays are misaligned", () => {
    const body = JSON.stringify({
      daily: { time: ["2026-06-01", "2026-06-02"], precipitation_sum: [5.0] },
    });

    const { observations, warnings } = openMeteoAdapter.parse(payload(body), spec);
    expect(observations).toHaveLength(1);
    expect(warnings.some((w) => w.includes("dates but"))).toBe(true);
  });

  it("throws when the requested variable is absent", () => {
    const body = JSON.stringify({
      daily: { time: ["2026-06-01"], temperature_2m_mean: [31.2] },
    });

    expect(() => openMeteoAdapter.parse(payload(body), spec)).toThrow(AdapterParseError);
  });

  it("throws on a non-JSON body", () => {
    expect(() => openMeteoAdapter.parse(payload("<html>503</html>"), spec)).toThrow(
      AdapterParseError,
    );
  });
});
