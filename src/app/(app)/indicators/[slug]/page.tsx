import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getIndicatorDetail } from "@/lib/indicators/detail";
import { PageHeader } from "@/components/ui/page-header";
import { SeriesChart } from "@/components/indicators/series-chart";
import { EstimatePanel } from "@/components/indicators/estimate-panel";
import { SourceDrawer } from "@/components/indicators/source-drawer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getIndicatorDetail(createServiceClient(), slug);
  return { title: detail?.indicator.name ?? "Indicator" };
}

export default async function IndicatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getIndicatorDetail(createServiceClient(), slug);

  if (!detail) notFound();

  const { indicator, latest, previous, estimate, surprise, provenance } = detail;
  const change = latest && previous ? latest.value - previous.value : null;

  return (
    <>
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
        <Link href="/indicators" className="hover:text-ink-2">
          Indicators
        </Link>
        <span>/</span>
        <span>{indicator.category}</span>
      </div>

      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={indicator.name}
          lede={`${indicator.frequency} · ${indicator.unit}${detail.countryIso2 ? ` · ${detail.countryIso2}` : " · global"}`}
        />
        <div className="flex items-center gap-2 pt-1">
          {provenance ? <SourceDrawer provenance={provenance} /> : null}
        </div>
      </div>

      {detail.inactiveNote ? (
        <div className="mb-6 rounded border border-sev-med/40 bg-sev-med-bg px-4 py-3">
          <h2 className="text-sm font-semibold text-sev-med">This indicator is not being ingested</h2>
          <p className="mt-1 text-xs leading-relaxed text-sev-med">{detail.inactiveNote}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <section className="rounded border border-rule bg-surface p-4">
            {latest ? (
              <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <div>
                  <span className="text-3xl font-semibold tabular-nums tracking-tight">
                    {latest.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                  <span className="ml-1.5 text-sm text-ink-3">{indicator.unit}</span>
                </div>
                {change !== null ? (
                  <span className="font-mono text-sm tabular-nums text-ink-2">
                    {change > 0 ? "▲" : change < 0 ? "▼" : "■"}{" "}
                    {Math.abs(change).toLocaleString("en-IN", { maximumFractionDigits: 3 })} vs
                    previous
                  </span>
                ) : null}
                <span className="font-mono text-xs text-ink-3">as of {latest.periodEnd}</span>
              </div>
            ) : null}

            {detail.series.length > 1 ? (
              <SeriesChart
                series={detail.series}
                unit={indicator.unit}
                estimate={
                  estimate && Number.isFinite(estimate.expected)
                    ? {
                        value: estimate.expected,
                        periodEnd: estimate.forPeriodEnd,
                        errorMae: estimate.errorMae,
                      }
                    : null
                }
              />
            ) : (
              <p className="py-8 text-center text-sm text-ink-3">
                No observations yet for this indicator.
              </p>
            )}
          </section>

          <section className="rounded border border-rule bg-surface px-4 py-3">
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
              Series
            </h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
              <Meta label="Observations" value={detail.series.length.toLocaleString("en-IN")} />
              <Meta label="Revisions" value={String(detail.revisionCount)} />
              <Meta label="First" value={detail.series[0]?.periodEnd ?? "—"} />
              <Meta label="Latest" value={latest?.periodEnd ?? "—"} />
            </dl>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <EstimatePanel estimate={estimate} surprise={surprise} unit={indicator.unit} />
        </div>
      </div>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-mono tabular-nums">{value}</dd>
    </div>
  );
}
