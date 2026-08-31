import { createHash } from "node:crypto";
import type {
  AdapterDeps,
  FetchWindow,
  ParseResult,
  RawPayload,
  SeriesSpec,
} from "./types";

/**
 * The contract every data source implements.
 *
 * `fetch` and `parse` are separate on purpose. Fetch returns the untouched
 * response so it can be hashed and stored before any interpretation happens;
 * parse is then a pure function from that stored bytes to observations. Two
 * consequences worth the split: a parser bug can be fixed and replayed against
 * history without re-hitting the provider, and the raw record backing any
 * user-visible number is always recoverable for the source drawer (§26).
 */
export interface SourceAdapter {
  /** Stable identifier, e.g. `fred`. Matches `sources.key` in the database. */
  readonly id: string;
  readonly sourceName: string;
  /** Homepage or docs URL, shown in source attribution. */
  readonly sourceUrl: string;
  /**
   * Prior on this source's reliability, 0–1, feeding signal confidence.
   * A statistical agency is not the same bet as a scraped press release.
   */
  readonly reliability: number;
  /** Whether this source needs a credential — checked before a run starts. */
  readonly requiresApiKey: boolean;

  fetch(spec: SeriesSpec, window: FetchWindow, deps: AdapterDeps): Promise<RawPayload>;
  parse(payload: RawPayload, spec: SeriesSpec): ParseResult;
}

export function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * Shared HTTP helper. Adapters use this rather than calling fetch directly so
 * every source gets the same timeout, error shape and payload construction.
 */
export async function fetchRaw(
  url: string,
  spec: SeriesSpec,
  deps: AdapterDeps,
  options: { sourceId: string; timeoutMs?: number },
): Promise<RawPayload> {
  const { sourceId, timeoutMs = 20_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await deps.fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new AdapterFetchError(`${sourceId}: request failed — ${reason}`, {
      sourceId,
      sourceSeriesCode: spec.sourceSeriesCode,
    });
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();

  if (!response.ok) {
    throw new AdapterFetchError(
      `${sourceId}: HTTP ${response.status} for ${spec.sourceSeriesCode}`,
      {
        sourceId,
        sourceSeriesCode: spec.sourceSeriesCode,
        httpStatus: response.status,
      },
    );
  }

  return {
    sourceId,
    sourceSeriesCode: spec.sourceSeriesCode,
    url,
    fetchedAt: deps.now(),
    contentHash: hashBody(body),
    body,
    httpStatus: response.status,
  };
}

export class AdapterFetchError extends Error {
  constructor(
    message: string,
    readonly meta: { sourceId: string; sourceSeriesCode: string; httpStatus?: number },
  ) {
    super(message);
    this.name = "AdapterFetchError";
  }
}

export class AdapterParseError extends Error {
  constructor(
    message: string,
    readonly meta: { sourceId: string; sourceSeriesCode: string },
  ) {
    super(message);
    this.name = "AdapterParseError";
  }
}
