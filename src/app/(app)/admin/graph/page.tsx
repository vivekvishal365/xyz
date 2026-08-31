import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { listBatches } from "@/lib/graph/review";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Graph curation" };
export const dynamic = "force-dynamic";

export default async function GraphBatchesPage() {
  const db = createServiceClient();
  const batches = await listBatches(db);

  const [{ count: approvedEdges }, { count: approvedExposures }] = await Promise.all([
    db.from("causal_edges").select("*", { count: "exact", head: true }).eq("status", "approved"),
    db.from("exposures").select("*", { count: "exact", head: true }).eq("status", "approved"),
  ]);

  const totalPending = batches.reduce((sum, batch) => sum + batch.pending, 0);

  return (
    <>
      <PageHeader
        eyebrow="Internal · D9"
        title="Graph curation"
        lede="AI drafts, you approve. The runtime traverses only approved rows, so nothing reaches a user without passing through here."
      />

      <dl className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule sm:grid-cols-4">
        <Stat label="Pending review" value={String(totalPending)} hint={estimate(totalPending)} />
        <Stat label="Approved edges" value={String(approvedEdges ?? 0)} />
        <Stat label="Approved exposures" value={String(approvedExposures ?? 0)} />
        <Stat label="Batches" value={String(batches.length)} />
      </dl>

      {batches.length === 0 ? (
        <div className="rounded border border-dashed border-rule bg-surface px-5 py-10">
          <p className="text-sm font-semibold">No draft batches yet</p>
          <p className="mt-1.5 max-w-[60ch] text-xs leading-relaxed text-ink-2">
            Run the drafting job to propose candidate edges and exposures:
          </p>
          <code className="mt-2 block font-mono text-[11px] text-accent-ink">
            npm run graph:draft -- --driver brent-crude-daily
          </code>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {batches.map((batch) => (
            <li key={batch.id}>
              <Link
                href={`/admin/graph/${batch.id}` as Route}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule bg-surface px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{batch.scopeNote}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
                    {batch.model} · {new Date(batch.createdAt).toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                    {batch.kinds.join(" + ") || "empty"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                  {batch.pending > 0 ? (
                    <span className="rounded bg-accent-bg px-2 py-0.5 text-accent-ink">
                      {batch.pending} pending
                    </span>
                  ) : (
                    <span className="rounded bg-sev-low-bg px-2 py-0.5 text-sev-low">done</span>
                  )}
                  <span className="text-sev-low">{batch.itemsApproved}✓</span>
                  <span className="text-sev-high">{batch.itemsRejected}✕</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 rounded border border-rule bg-surface px-4 py-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
          Why this exists
        </h2>
        <p className="mt-1.5 max-w-[68ch] text-xs leading-relaxed text-ink-2">
          The causal graph is the product&apos;s moat and the thing an LLM would most happily
          invent. Under D9 an offline job proposes edges and a human approves every one — the
          runtime reads <code>status = &apos;approved&apos;</code> and nothing else. Every approved
          edge also gets a re-review date, because exposures go stale as companies divest and a
          graph nobody re-reads degrades invisibly.
        </p>
      </div>
    </>
  );
}

/** ~90 seconds per item is the planning figure from docs/00-decisions.md. */
function estimate(pending: number): string | undefined {
  if (pending === 0) return undefined;
  const minutes = Math.round((pending * 90) / 60);
  return minutes >= 60 ? `~${(minutes / 60).toFixed(1)}h at 90s each` : `~${minutes}m at 90s each`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="font-mono text-[10px] text-ink-3">{hint}</dd> : null}
    </div>
  );
}
