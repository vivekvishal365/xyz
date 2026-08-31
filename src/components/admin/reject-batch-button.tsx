"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rejectBatchAction } from "@/app/(app)/admin/graph/actions";

/**
 * Bulk reject, for a batch that has clearly gone wrong.
 *
 * Worth having as a first-class control: if the drafting prompt produced
 * nonsense, working through 300 items one keystroke at a time to say so is
 * pure waste. The reason is recorded against every row, so a bad batch is
 * traceable back to the prompt that produced it.
 */
export function RejectBatchButton({ batchId, pending }: { batchId: string; pending: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (pending === 0) return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="shrink-0 rounded border border-rule px-2.5 py-1 font-mono text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-2"
      >
        Reject all {pending}
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded border border-sev-high/40 bg-surface px-3 py-2.5 sm:w-auto">
      <p className="font-mono text-[11px] uppercase text-sev-high">
        Reject all {pending} pending items?
      </p>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="why this batch is wrong"
        className="mt-1.5 w-full rounded border border-rule bg-surface-2 px-2 py-1 text-sm outline-none focus-visible:border-accent"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy || reason.trim().length === 0}
          onClick={async () => {
            setBusy(true);
            await rejectBatchAction(batchId, reason.trim());
            router.refresh();
            setBusy(false);
            setConfirming(false);
          }}
          className="rounded bg-sev-high px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Rejecting…" : "Reject all"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded border border-rule px-2.5 py-1 text-xs"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 font-mono text-[10px] text-ink-3">A reason is required.</p>
    </div>
  );
}
