import { z } from "zod";
import { AdapterParseError, fetchRaw, type SourceAdapter } from "../adapter";
import { periodEndFor } from "../period";
import type {
  AdapterDeps,
  FetchWindow,
  ParsedObservation,
  ParseResult,
  RawPayload,
  SeriesSpec,
} from "../types";

const SOURCE_ID = "fred";
const BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

/**
 * FRED observation rows.
 *
 * `realtime_start` is FRED's vintage marker — the date this value became the
 * current one. It is the closest thing the API gives us to a release date, and
 * it is what makes revisions visible: a revised figure reappears with the same
 * `date` and a later `realtime_start`.
 */
const fredResponse = z.object({
  observations: z.array(
    z.object({
      date: z.string(),
      value: z.string(),
      realtime_start: z.string().optional(),
    }),
  ),
});

/**
 * FRED — Federal Reserve Bank of St. Louis.
 *
 * Free, keyed, and the most dependable source in the Phase 1 set. Carries a
 * good deal of Indian macro data sourced onward from the IMF and OECD, which
 * arrives later than the original Indian release but in a far more usable
 * shape than MOSPI's PDFs.
 */
export const fredAdapter: SourceAdapter = {
  id: SOURCE_ID,
  sourceName: "Federal Reserve Economic Data (FRED)",
  sourceUrl: "https://fred.stlouisfed.org",
  reliability: 0.95,
  requiresApiKey: true,

  async fetch(spec: SeriesSpec, window: FetchWindow, deps: AdapterDeps): Promise<RawPayload> {
    if (!deps.apiKey) {
      throw new AdapterParseError("FRED requires an API key (FRED_API_KEY)", {
        sourceId: SOURCE_ID,
        sourceSeriesCode: spec.sourceSeriesCode,
      });
    }

    const url = new URL(BASE_URL);
    url.searchParams.set("series_id", spec.sourceSeriesCode);
    url.searchParams.set("api_key", deps.apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("observation_start", window.from);
    url.searchParams.set("observation_end", window.to);

    const payload = await fetchRaw(url.toString(), spec, deps, { sourceId: SOURCE_ID });

    // The key is a credential and the payload URL is stored and shown in the
    // source drawer. Redact before it goes anywhere near the database.
    url.searchParams.set("api_key", "REDACTED");
    return { ...payload, url: url.toString() };
  },

  parse(payload: RawPayload, spec: SeriesSpec): ParseResult {
    let json: unknown;
    try {
      json = JSON.parse(payload.body);
    } catch {
      throw new AdapterParseError("FRED returned a body that is not JSON", {
        sourceId: SOURCE_ID,
        sourceSeriesCode: spec.sourceSeriesCode,
      });
    }

    const parsed = fredResponse.safeParse(json);
    if (!parsed.success) {
      throw new AdapterParseError(
        `FRED response did not match the expected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        { sourceId: SOURCE_ID, sourceSeriesCode: spec.sourceSeriesCode },
      );
    }

    const observations: ParsedObservation[] = [];
    const warnings: string[] = [];

    for (const row of parsed.data.observations) {
      // FRED encodes "no data for this period" as a single full stop. Treating
      // that as 0 would be a silent, invisible data-quality failure — a missing
      // month of industrial production is not a month of zero production.
      if (row.value === ".") {
        warnings.push(`${spec.sourceSeriesCode}: no value for period starting ${row.date}`);
        continue;
      }

      const value = Number(row.value);
      if (!Number.isFinite(value)) {
        warnings.push(`${spec.sourceSeriesCode}: unparseable value "${row.value}" at ${row.date}`);
        continue;
      }

      let periodEnd: string;
      try {
        periodEnd = periodEndFor(row.date, spec.periodType);
      } catch {
        warnings.push(`${spec.sourceSeriesCode}: unparseable date "${row.date}"`);
        continue;
      }

      observations.push({
        sourceSeriesCode: spec.sourceSeriesCode,
        periodStart: row.date,
        periodEnd,
        periodType: spec.periodType,
        value,
        unit: spec.unit,
        releasedAt: parseVintage(row.realtime_start),
      });
    }

    return { observations, warnings };
  },
};

/**
 * FRED uses 9999-12-31 to mean "current, no end vintage". Passing that through
 * as a release date would put the release a few thousand years in the future.
 */
function parseVintage(value: string | undefined): Date | null {
  if (!value || value.startsWith("9999")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
