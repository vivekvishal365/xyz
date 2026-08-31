import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { listIndicatorsForIndex } from "@/lib/indicators/detail";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Indicators" };
export const dynamic = "force-dynamic";

export default async function IndicatorsPage() {
  const indicators = await listIndicatorsForIndex(createServiceClient());

  const byCategory = new Map<string, typeof indicators>();
  for (const indicator of indicators) {
    const bucket = byCategory.get(indicator.category) ?? [];
    bucket.push(indicator);
    byCategory.set(indicator.category, bucket);
  }

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Indicators"
        lede={`${indicators.filter((i) => i.is_active).length} active of ${indicators.length} tracked.`}
      />

      <div className="flex flex-col gap-7">
        {[...byCategory.entries()].map(([category, rows]) => (
          <section key={category}>
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
              {category}
            </h2>
            <ul className="overflow-hidden rounded border border-rule">
              {rows.map((indicator) => (
                <li key={indicator.slug} className="border-b border-rule last:border-0">
                  <Link
                    href={`/indicators/${indicator.slug}`}
                    className="flex items-center justify-between gap-4 bg-surface px-4 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{indicator.name}</span>
                      <span className="block font-mono text-[11px] text-ink-3">
                        {indicator.slug}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[11px] text-ink-3">{indicator.unit}</span>
                      {!indicator.is_active ? (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-3">
                          inactive
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
