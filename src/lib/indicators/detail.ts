import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentObservations } from "@/lib/db/repositories";
import type { IndicatorRow } from "@/lib/db/types";
import { measureSurprise, type Surprise } from "@/lib/engine/forecast/surprise";
import type { IsoDate } from "@/lib/ingest/types";

/**
 * Everything the indicator detail screen needs, assembled server-side.
 *
 * Deliberately includes the provenance record for the most recent observation.
 * §26 requires every factual claim to be traceable, and provenance assembled as
 * a separate client request would be a second thing that can fail — leaving a
 * number on screen with no way to check it.
 */

export type SeriesPoint = { periodEnd: IsoDate; value: number };

export type EstimateDetail = {
  expected: number;
  forPeriodEnd: IsoDate;
  /** Rolling MAE at the time the estimate was made. Surprise is scaled by this. */
  errorMae: number | null;
  method: string | null;
  basis: string;
  /** Every method's backtest, so the estimate can be argued with rather than trusted. */
  models: {
    method: string;
    mae: number | null;
    naiveMae: number | null;
    relativeSkill: number | null;
    isTrusted: boolean;
    n: number | null;
    /** Why this method was rejected. Shown rather than left as a bare dash. */
    untrustedReason: string | null;
  }[];
};

export type Provenance = {
  sourceName: string;
  sourceUrl: string | null;
  sourceSlug: string;
  reliability: number;
  licenceNote: string | null;
  datasetCode: string | null;
  /** The value exactly as the provider gave it, for the period shown. */
  originalValue: number;
  periodEnd: IsoDate;
  periodStart: IsoDate;
  /** When the provider published it. Null when the provider does not say. */
  releasedAt: string | null;
  /** When we fetched it. */
  retrievedAt: string | null;
  requestUrl: string | null;
  contentHash: string | null;
  revision: number;
};

export type IndicatorDetail = {
  indicator: IndicatorRow;
  countryIso2: string | null;
  series: SeriesPoint[];
  latest: SeriesPoint | null;
  previous: SeriesPoint | null;
  estimate: EstimateDetail | null;
  /** Present only when an estimate existed for a period we have now observed. */
  surprise: Surprise | null;
  provenance: Provenance | null;
  revisionCount: number;
  /** Set when the indicator is seeded but deliberately not ingested. */
  inactiveNote: string | null;
};

export async function getIndicatorDetail(
  db: SupabaseClient,
  slug: string,
): Promise<IndicatorDetail | null> {
  const { data: indicatorData, error } = await db
    .from("indicators")
    .select("*, countries(iso2), sources(slug, name, url, reliability, licence_note)")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !indicatorData) return null;

  const row = indicatorData as IndicatorRow & {
    countries: { iso2: string } | null;
    sources: {
      slug: string;
      name: string;
      url: string | null;
      reliability: number;
      licence_note: string | null;
    } | null;
  };

  const observations = await getCurrentObservations(db, row.id);
  const series: SeriesPoint[] = observations.map((o) => ({
    periodEnd: o.period_end,
    value: Number(o.value),
  }));

  const latestObservation = observations.at(-1) ?? null;
  const latest = series.at(-1) ?? null;
  const previous = series.at(-2) ?? null;

  const [estimate, provenance, revisionCount] = await Promise.all([
    loadEstimate(db, row.id),
    latestObservation ? loadProvenance(db, row, latestObservation) : Promise.resolve(null),
    countRevisions(db, row.id),
  ]);

  // A surprise only exists once the estimated period has actually been
  // observed. Comparing an estimate against a different period's print would be
  // a category error, so this stays null until the periods line up.
  let surprise: Surprise | null = null;
  if (estimate && latest && estimate.forPeriodEnd === latest.periodEnd) {
    surprise = measureSurprise(latest.value, estimate.expected, estimate.errorMae);
  }

  const transform = row.transform as { note?: string } | null;

  return {
    indicator: row,
    countryIso2: row.countries?.iso2 ?? null,
    series,
    latest,
    previous,
    estimate,
    surprise,
    provenance,
    revisionCount,
    inactiveNote: row.is_active ? null : (transform?.note ?? null),
  };
}

async function loadEstimate(
  db: SupabaseClient,
  indicatorId: string,
): Promise<EstimateDetail | null> {
  const { data } = await db
    .from("expectations")
    .select("period_end, expected, error_mae, basis, expectation_models(method)")
    .eq("indicator_id", indicatorId)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: models } = await db
    .from("expectation_models")
    .select("method, mae, naive_mae, is_trusted, params")
    .eq("indicator_id", indicatorId);

  const modelRows = (models ?? []).map((model) => {
    const params = (model.params ?? {}) as {
      n?: number;
      relative_skill?: number | null;
      untrusted_reason?: string | null;
    };
    return {
      method: model.method as string,
      mae: model.mae === null ? null : Number(model.mae),
      naiveMae: model.naive_mae === null ? null : Number(model.naive_mae),
      relativeSkill: params.relative_skill ?? null,
      isTrusted: Boolean(model.is_trusted),
      n: params.n ?? null,
      untrustedReason: params.untrusted_reason ?? null,
    };
  });
  modelRows.sort((a, b) => (a.mae ?? Infinity) - (b.mae ?? Infinity));

  if (!data) {
    // No estimate is a real outcome under D1, but the model comparison is still
    // worth showing — it is the evidence for why there is nothing to publish.
    return modelRows.length > 0
      ? {
          expected: Number.NaN,
          forPeriodEnd: "",
          errorMae: null,
          method: null,
          basis: "model",
          models: modelRows,
        }
      : null;
  }

  // PostgREST returns an embedded to-one relation as an object in some shapes
  // and a single-element array in others, depending on how it infers the
  // relationship. Handle both rather than betting on one.
  const embedded = data.expectation_models as unknown;
  const model = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | { method: string }
    | null
    | undefined;

  return {
    expected: Number(data.expected),
    forPeriodEnd: data.period_end as string,
    errorMae: data.error_mae === null ? null : Number(data.error_mae),
    method: model?.method ?? null,
    basis: data.basis as string,
    models: modelRows,
  };
}

async function loadProvenance(
  db: SupabaseClient,
  row: IndicatorRow & {
    sources: {
      slug: string;
      name: string;
      url: string | null;
      reliability: number;
      licence_note: string | null;
    } | null;
  },
  observation: {
    period_start: string;
    period_end: string;
    value: number;
    released_at: string | null;
    raw_payload_id: string | null;
    revision: number;
  },
): Promise<Provenance | null> {
  if (!row.sources) return null;

  let requestUrl: string | null = null;
  let contentHash: string | null = null;
  let retrievedAt: string | null = null;

  if (observation.raw_payload_id) {
    const { data } = await db
      .from("raw_payloads")
      .select("request_url, content_hash, fetched_at")
      .eq("id", observation.raw_payload_id)
      .maybeSingle();

    requestUrl = (data?.request_url as string | undefined) ?? null;
    contentHash = (data?.content_hash as string | undefined) ?? null;
    retrievedAt = (data?.fetched_at as string | undefined) ?? null;
  }

  return {
    sourceName: row.sources.name,
    sourceUrl: row.sources.url,
    sourceSlug: row.sources.slug,
    reliability: Number(row.sources.reliability),
    licenceNote: row.sources.licence_note,
    datasetCode: row.source_series_code,
    originalValue: Number(observation.value),
    periodEnd: observation.period_end,
    periodStart: observation.period_start,
    releasedAt: observation.released_at,
    retrievedAt,
    requestUrl,
    contentHash,
    revision: observation.revision,
  };
}

async function countRevisions(db: SupabaseClient, indicatorId: string): Promise<number> {
  const { count } = await db
    .from("observation_revisions")
    .select("*", { count: "exact", head: true })
    .eq("indicator_id", indicatorId);
  return count ?? 0;
}

export async function listIndicatorsForIndex(db: SupabaseClient) {
  const { data } = await db
    .from("indicators")
    .select("slug, name, category, unit, adapter, is_active")
    .order("category")
    .order("slug");
  return (data ?? []) as {
    slug: string;
    name: string;
    category: string;
    unit: string;
    adapter: string;
    is_active: boolean;
  }[];
}
