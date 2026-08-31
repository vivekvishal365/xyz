import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { listBatches, loadQueue } from "@/lib/graph/review";
import { ReviewQueue } from "@/components/admin/review-queue";
import { RejectBatchButton } from "@/components/admin/reject-batch-button";

export const metadata: Metadata = { title: "Review queue" };
export const dynamic = "force-dynamic";

export default async function ReviewBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const db = createServiceClient();

  const batches = await listBatches(db);
  const batch = batches.find((candidate) => candidate.id === batchId);
  if (!batch) notFound();

  const drafts = await loadQueue(db, batchId);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/admin/graph"
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink-2"
          >
            ← Graph curation
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">{batch.scopeNote}</h1>
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">
            {batch.provider}/{batch.model} · drafted{" "}
            {new Date(batch.createdAt).toISOString().slice(0, 16).replace("T", " ")}
          </p>
        </div>
        <RejectBatchButton batchId={batchId} pending={batch.pending} />
      </div>

      <ReviewQueue
        drafts={drafts}
        batchId={batchId}
        batchLabel={batch.scopeNote}
        alreadyDecided={batch.itemsApproved + batch.itemsRejected}
      />
    </>
  );
}
