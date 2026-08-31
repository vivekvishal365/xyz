import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pipeline health.
 *
 * Built around one specific failure this system is prone to: a source that
 * keeps returning HTTP 200 while the data behind it stops moving. Nothing
 * errors, no run fails, and the indicator quietly serves numbers from last
 * year — which is exactly how FRED's India CPI went 518 days stale without
 * anyone noticing (see docs/03-data-sources.md).
 *
 * So freshness is judged per indicator against its own expected release lag,
 * not by whether the last run succeeded.
 */

export type IndicatorHealth = {
  slug: string;
  name: string;
  adapter: string;
  isActive: boolean;
  observations: number;
  lastPeriodEnd: string | null;
  /** Days between the last observed period and today. */
  ageDays: number | null;
  releaseLagDays: number | null;
  /** Age beyond which this indicator is considered stale. */
  staleAfterDays: number;
  status: "ok" | "stale" | "empty" | "inactive";
  hasEstimate: boolean;
  estimateMethod: string | null;
};

export type PipelineHealth = {
  status: "ok" | "degraded";
  checkedAt: string;
  database: { reachable: boolean; applyObservations: boolean };
  totals: {
    indicators: number;
    active: number;
    observations: number;
    revisions: number;
    withEstimate: number;
  };
  runs: { last24h: number; failed24h: number; lastRunAt: string | null };
  indicators: IndicatorHealth[];
  problems: string[];
};

/** Generous but finite: twice the expected lag, plus a two-month grace. */
export function staleThreshold(releaseLagDays: number | null): number {
  return (releaseLagDays ?? 30) * 2 + 60;
}

function daysSince(date: string): number {
  return Math.round((Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000);
}

export async function getPipelineHealth(db: SupabaseClient): Promise<PipelineHealth> {
  const checkedAt = new Date().toISOString();
  const problems: string[] = [];

  const { data: indicatorRows, error: indicatorError } = await db
    .from("indicators")
    .select("id, slug, name, adapter, is_active, release_lag_days")
    .order("slug");

  if (indicatorError) {
    return {
      status: "degraded",
      checkedAt,
      database: { reachable: false, applyObservations: false },
      totals: { indicators: 0, active: 0, observations: 0, revisions: 0, withEstimate: 0 },
      runs: { last24h: 0, failed24h: 0, lastRunAt: null },
      indicators: [],
      problems: [`database unreachable: ${indicatorError.message}`],
    };
  }

  const indicators = (indicatorRows ?? []) as {
    id: string;
    slug: string;
    name: string;
    adapter: string;
    is_active: boolean;
    release_lag_days: number | null;
  }[];

  // The RPC migration 0002 installs. Called with an empty batch so it writes
  // nothing — this is a presence check, not an operation.
  const rpc = await db.rpc("apply_observations", {
    p_indicator_id: "00000000-0000-0000-0000-000000000000",
    p_source_id: "00000000-0000-0000-0000-000000000000",
    p_raw_payload_id: null,
    p_rows: [],
  });
  const hasApplyObservations = !(
    rpc.error && /could not find|does not exist|schema cache/i.test(rpc.error.message)
  );
  if (!hasApplyObservations) {
    problems.push("apply_observations() is missing — revisions cannot be applied");
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: runs24h }, { count: failed24h }, lastRun, { count: revisions }] =
    await Promise.all([
      db.from("ingest_runs").select("*", { count: "exact", head: true }).gte("started_at", since),
      db
        .from("ingest_runs")
        .select("*", { count: "exact", head: true })
        .gte("started_at", since)
        .eq("status", "failed"),
      db
        .from("ingest_runs")
        .select("started_at")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("observation_revisions").select("*", { count: "exact", head: true }),
    ]);

  const health: IndicatorHealth[] = [];
  let totalObservations = 0;
  let withEstimate = 0;

  for (const indicator of indicators) {
    const [{ count }, latest, estimate] = await Promise.all([
      db
        .from("indicator_observations")
        .select("*", { count: "exact", head: true })
        .eq("indicator_id", indicator.id)
        .eq("is_current", true),
      db
        .from("indicator_observations")
        .select("period_end")
        .eq("indicator_id", indicator.id)
        .eq("is_current", true)
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("expectations")
        .select("period_end, expectation_models(method)")
        .eq("indicator_id", indicator.id)
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const observations = count ?? 0;
    totalObservations += observations;

    const lastPeriodEnd = (latest.data?.period_end as string | undefined) ?? null;
    const ageDays = lastPeriodEnd ? daysSince(lastPeriodEnd) : null;
    const staleAfterDays = staleThreshold(indicator.release_lag_days);

    // PostgREST returns an embedded to-one relation as an object or as a
    // single-element array depending on how it infers the relationship.
    const embedded = estimate.data?.expectation_models as unknown;
    const model = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { method: string }
      | null
      | undefined;
    const hasEstimate = Boolean(estimate.data);
    if (hasEstimate) withEstimate += 1;

    let status: IndicatorHealth["status"];
    if (!indicator.is_active) status = "inactive";
    else if (observations === 0) status = "empty";
    else if (ageDays !== null && ageDays > staleAfterDays) status = "stale";
    else status = "ok";

    if (status === "stale") {
      problems.push(`${indicator.slug} is stale — last period ${lastPeriodEnd}, ${ageDays}d old`);
    }
    if (status === "empty") {
      problems.push(`${indicator.slug} is active but has no observations`);
    }

    health.push({
      slug: indicator.slug,
      name: indicator.name,
      adapter: indicator.adapter,
      isActive: indicator.is_active,
      observations,
      lastPeriodEnd,
      ageDays,
      releaseLagDays: indicator.release_lag_days,
      staleAfterDays,
      status,
      hasEstimate,
      estimateMethod: model?.method ?? null,
    });
  }

  if ((failed24h ?? 0) > 0) {
    problems.push(`${failed24h} ingest run(s) failed in the last 24h`);
  }

  return {
    status: problems.length === 0 ? "ok" : "degraded",
    checkedAt,
    database: { reachable: true, applyObservations: hasApplyObservations },
    totals: {
      indicators: indicators.length,
      active: indicators.filter((i) => i.is_active).length,
      observations: totalObservations,
      revisions: revisions ?? 0,
      withEstimate,
    },
    runs: {
      last24h: runs24h ?? 0,
      failed24h: failed24h ?? 0,
      lastRunAt: (lastRun.data?.started_at as string | undefined) ?? null,
    },
    indicators: health,
    problems,
  };
}
