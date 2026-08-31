import { z } from "zod";
import { AdapterParseError, fetchRaw, type SourceAdapter } from "../adapter";
import type {
  AdapterDeps,
  FetchWindow,
  ParsedObservation,
  ParseResult,
  RawPayload,
  SeriesSpec,
} from "../types";

const SOURCE_ID = "open_meteo";
const BASE_URL = "https://archive-api.open-meteo.com/v1/archive";

/** Per-series settings: where to measure, and which daily variable to read. */
const configSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Open-Meteo daily variable, e.g. `precipitation_sum`, `temperature_2m_mean`. */
  daily: z.string().min(1),
});

const responseSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
  }).catchall(z.array(z.union([z.number(), z.null()]))),
});

/**
 * Open-Meteo ERA5 archive.
 *
 * Free and keyless, with reanalysis data back to 1940. That history depth is
 * the point: Indian monsoon signals are about rainfall *departure from normal*,
 * and IMD publishes no usable API for its long-period averages. With enough
 * archive we compute our own climatology instead of depending on one.
 *
 * Note this is reanalysis, not station data — it is a model's best estimate of
 * what happened, which is appropriate for departure-from-normal comparisons but
 * is not the same thing as a gauge reading.
 */
export const openMeteoAdapter: SourceAdapter = {
  id: SOURCE_ID,
  sourceName: "Open-Meteo (ERA5 reanalysis)",
  sourceUrl: "https://open-meteo.com",
  reliability: 0.85,
  requiresApiKey: false,

  async fetch(spec: SeriesSpec, window: FetchWindow, deps: AdapterDeps): Promise<RawPayload> {
    const config = configSchema.safeParse(spec.config ?? {});
    if (!config.success) {
      throw new AdapterParseError(
        `Open-Meteo series ${spec.sourceSeriesCode} needs latitude, longitude and daily in config`,
        { sourceId: SOURCE_ID, sourceSeriesCode: spec.sourceSeriesCode },
      );
    }

    const url = new URL(BASE_URL);
    url.searchParams.set("latitude", String(config.data.latitude));
    url.searchParams.set("longitude", String(config.data.longitude));
    url.searchParams.set("start_date", window.from);
    url.searchParams.set("end_date", window.to);
    url.searchParams.set("daily", config.data.daily);
    url.searchParams.set("timezone", "Asia/Kolkata");

    return fetchRaw(url.toString(), spec, deps, { sourceId: SOURCE_ID });
  },

  parse(payload: RawPayload, spec: SeriesSpec): ParseResult {
    const config = configSchema.safeParse(spec.config ?? {});
    if (!config.success) {
      throw new AdapterParseError(`Open-Meteo series ${spec.sourceSeriesCode} has invalid config`, {
        sourceId: SOURCE_ID,
        sourceSeriesCode: spec.sourceSeriesCode,
      });
    }

    let json: unknown;
    try {
      json = JSON.parse(payload.body);
    } catch {
      throw new AdapterParseError("Open-Meteo returned a body that is not JSON", {
        sourceId: SOURCE_ID,
        sourceSeriesCode: spec.sourceSeriesCode,
      });
    }

    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) {
      throw new AdapterParseError("Open-Meteo response did not match the expected shape", {
        sourceId: SOURCE_ID,
        sourceSeriesCode: spec.sourceSeriesCode,
      });
    }

    const { time } = parsed.data.daily;
    const values = parsed.data.daily[config.data.daily];

    if (!Array.isArray(values)) {
      throw new AdapterParseError(
        `Open-Meteo response has no "${config.data.daily}" series`,
        { sourceId: SOURCE_ID, sourceSeriesCode: spec.sourceSeriesCode },
      );
    }

    const observations: ParsedObservation[] = [];
    const warnings: string[] = [];

    if (time.length !== values.length) {
      warnings.push(
        `${spec.sourceSeriesCode}: ${time.length} dates but ${values.length} values — reading the overlap only`,
      );
    }

    const count = Math.min(time.length, values.length);
    for (let i = 0; i < count; i += 1) {
      const date = time[i];
      const value = values[i];

      if (date === undefined) continue;

      // Open-Meteo uses null for a genuine gap. Same reasoning as FRED's ".":
      // a day with no rainfall reading is not a day of zero rainfall.
      if (value === null || value === undefined) {
        warnings.push(`${spec.sourceSeriesCode}: no value for ${date}`);
        continue;
      }

      observations.push({
        sourceSeriesCode: spec.sourceSeriesCode,
        periodStart: date,
        periodEnd: date,
        periodType: "day",
        value,
        unit: spec.unit,
        // Reanalysis has no publication event to point at.
        releasedAt: null,
      });
    }

    return { observations, warnings };
  },
};
