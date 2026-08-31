import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getPipelineHealth, type IndicatorHealth } from "@/lib/ingest/health";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Pipeline health" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<IndicatorHealth["status"], string> = {
  ok: "text-sev-low bg-sev-low-bg",
  stale: "text-sev-high bg-sev-high-bg",
  empty: "text-sev-high bg-sev-high-bg",
  inactive: "text-ink-3 bg-surface-2",
};

export default async function PipelineHealthPage() {
  const health = await getPipelineHealth(createServiceClient());

  return (
    <>
      <PageHeader
        eyebrow="Internal"
        title="Pipeline health"
        lede="Freshness is judged per indicator against its own release lag — a source returning HTTP 200 with year-old numbers is the failure this page exists to catch."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge
          tone={health.status === "ok" ? "ok" : "bad"}
          label={health.status === "ok" ? "All checks passing" : `${health.problems.length} problem(s)`}
        />
        <Badge
          tone={health.database.applyObservations ? "ok" : "bad"}
          label={`apply_observations() ${health.database.applyObservations ? "present" : "MISSING"}`}
        />
        <Badge
          tone={health.runs.failed24h === 0 ? "ok" : "bad"}
          label={`${health.runs.last24h} runs / 24h · ${health.runs.failed24h} failed`}
        />
      </div>

      {health.problems.length > 0 ? (
        <div className="mb-6 rounded border border-sev-high/40 bg-sev-high-bg px-4 py-3">
          <h2 className="text-sm font-semibold text-sev-high">Problems</h2>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-sev-high">
            {health.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule sm:grid-cols-5">
        <Stat label="Indicators" value={`${health.totals.active}/${health.totals.indicators}`} hint="active" />
        <Stat label="Observations" value={health.totals.observations.toLocaleString("en-IN")} />
        <Stat label="Revisions" value={health.totals.revisions.toLocaleString("en-IN")} />
        <Stat label="With estimate" value={String(health.totals.withEstimate)} hint="D1" />
        <Stat
          label="Last run"
          value={health.runs.lastRunAt ? new Date(health.runs.lastRunAt).toISOString().slice(5, 16).replace("T", " ") : "—"}
        />
      </dl>

      <div className="overflow-x-auto rounded border border-rule">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule bg-surface-2 text-left">
              <Th>Indicator</Th>
              <Th>Source</Th>
              <Th className="text-right">Obs</Th>
              <Th>Last period</Th>
              <Th className="text-right">Age</Th>
              <Th className="text-right">Stale after</Th>
              <Th>Estimate</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {health.indicators.map((indicator) => (
              <tr key={indicator.slug} className="border-b border-rule last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/indicators/${indicator.slug}`}
                    className="text-accent-ink hover:underline"
                  >
                    {indicator.name}
                  </Link>
                  <div className="font-mono text-[11px] text-ink-3">{indicator.slug}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-2">{indicator.adapter}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                  {indicator.observations.toLocaleString("en-IN")}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-2">
                  {indicator.lastPeriodEnd ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-ink-2">
                  {indicator.ageDays === null ? "—" : `${indicator.ageDays}d`}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-ink-3">
                  {indicator.staleAfterDays}d
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-2">
                  {indicator.hasEstimate ? (indicator.estimateMethod ?? "yes") : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] uppercase ${STATUS_STYLE[indicator.status]}`}
                  >
                    {indicator.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ink-3">
        Machine-readable at{" "}
        <code className="font-mono">/api/v1/health/pipeline</code> — returns 503 when degraded.
      </p>
    </>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3 ${className}`}
    >
      {children}
    </th>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="font-mono text-[11px] text-ink-3">{hint}</dd> : null}
    </div>
  );
}

function Badge({ tone, label }: { tone: "ok" | "bad"; label: string }) {
  return (
    <span
      className={`rounded px-2 py-1 font-mono text-[11px] ${
        tone === "ok" ? "bg-sev-low-bg text-sev-low" : "bg-sev-high-bg text-sev-high"
      }`}
    >
      {label}
    </span>
  );
}
