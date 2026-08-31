import { describe, expect, it, vi } from "vitest";
import { fredAdapter } from "./fred";
import { AdapterParseError } from "../adapter";
import type { AdapterDeps, RawPayload, SeriesSpec } from "../types";

const spec: SeriesSpec = {
  indicatorKey: "in.cpi.yoy",
  sourceSeriesCode: "INDCPIALLMINMEI",
  periodType: "month",
  unit: "percent",
};

/** Shape taken from FRED's documented observations response. */
const FRED_BODY = JSON.stringify({
  realtime_start: "2026-08-31",
  realtime_end: "2026-08-31",
  observations: [
    { realtime_start: "2026-06-12", realtime_end: "9999-12-31", date: "2026-05-01", value: "4.9" },
    { realtime_start: "2026-07-14", realtime_end: "9999-12-31", date: "2026-06-01", value: "5.1" },
    // FRED encodes a missing period as a single full stop.
    { realtime_start: "2026-08-13", realtime_end: "9999-12-31", date: "2026-07-01", value: "." },
  ],
});

function deps(overrides: Partial<AdapterDeps> = {}): AdapterDeps {
  return {
    fetch: vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(FRED_BODY, { status: 200 })),
    now: () => new Date("2026-08-31T06:00:00Z"),
    apiKey: "test-key",
    ...overrides,
  };
}

function payload(body: string): RawPayload {
  return {
    sourceId: "fred",
    sourceSeriesCode: spec.sourceSeriesCode,
    url: "https://api.stlouisfed.org/fred/series/observations",
    fetchedAt: new Date("2026-08-31T06:00:00Z"),
    contentHash: "hash",
    body,
    httpStatus: 200,
  };
}

describe("fredAdapter.fetch", () => {
  it("redacts the API key from the stored URL", async () => {
    // The payload URL is shown in the source drawer (§26). A credential must
    // not travel with it into the database or onto a user's screen.
    const result = await fredAdapter.fetch(spec, { from: "2020-01-01", to: "2026-08-31" }, deps());

    expect(result.url).toContain("api_key=REDACTED");
    expect(result.url).not.toContain("test-key");
  });

  it("still sends the real key to FRED", async () => {
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(FRED_BODY, { status: 200 }));
    await fredAdapter.fetch(
      spec,
      { from: "2020-01-01", to: "2026-08-31" },
      deps({ fetch: fetchSpy }),
    );

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("api_key=test-key");
    expect(calledUrl).toContain("series_id=INDCPIALLMINMEI");
    expect(calledUrl).toContain("observation_start=2020-01-01");
  });

  it("fails loudly without an API key", async () => {
    await expect(
      fredAdapter.fetch(spec, { from: "2020-01-01", to: "2026-08-31" }, deps({ apiKey: undefined })),
    ).rejects.toBeInstanceOf(AdapterParseError);
  });

  it("hashes the body so an unchanged response can be skipped", async () => {
    const result = await fredAdapter.fetch(spec, { from: "2020-01-01", to: "2026-08-31" }, deps());
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("fredAdapter.parse", () => {
  it("derives period ends and keeps the vintage as the release date", () => {
    const { observations, warnings } = fredAdapter.parse(payload(FRED_BODY), spec);

    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      periodType: "month",
      value: 4.9,
      unit: "percent",
    });
    expect(observations[0]?.releasedAt?.toISOString()).toBe("2026-06-12T00:00:00.000Z");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no value");
  });

  it("does not read a missing value as zero", () => {
    // A missing month of CPI is not a month of zero inflation.
    const { observations } = fredAdapter.parse(payload(FRED_BODY), spec);
    expect(observations.some((o) => o.value === 0)).toBe(false);
    expect(observations.map((o) => o.periodEnd)).not.toContain("2026-07-31");
  });

  it("treats FRED's 9999 sentinel as no release date rather than the year 9999", () => {
    const body = JSON.stringify({
      observations: [
        { date: "2026-05-01", value: "4.9", realtime_start: "9999-12-31" },
      ],
    });

    const { observations } = fredAdapter.parse(payload(body), spec);
    expect(observations[0]?.releasedAt).toBeNull();
  });

  it("warns on an unparseable value instead of throwing away the whole payload", () => {
    const body = JSON.stringify({
      observations: [
        { date: "2026-05-01", value: "n/a" },
        { date: "2026-06-01", value: "5.1" },
      ],
    });

    const { observations, warnings } = fredAdapter.parse(payload(body), spec);
    expect(observations).toHaveLength(1);
    expect(warnings[0]).toContain("unparseable value");
  });

  it("throws on a response that is not FRED-shaped", () => {
    expect(() => fredAdapter.parse(payload("{\"error\":\"bad request\"}"), spec)).toThrow(
      AdapterParseError,
    );
    expect(() => fredAdapter.parse(payload("<html>502</html>"), spec)).toThrow(AdapterParseError);
  });

  it("snaps quarterly series to calendar quarter ends", () => {
    const quarterlySpec: SeriesSpec = { ...spec, periodType: "quarter", unit: "index" };
    const body = JSON.stringify({ observations: [{ date: "2026-07-01", value: "120.5" }] });

    const { observations } = fredAdapter.parse(payload(body), quarterlySpec);
    expect(observations[0]?.periodEnd).toBe("2026-09-30");
  });
});
