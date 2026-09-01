"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@/lib/graph/review";
import { reopenAction } from "@/app/(app)/admin/graph/actions";

/**
 * Already-decided items, with a way back.
 *
 * The queue's `u` undo walks an in-memory list, so it only reaches decisions
 * made in the current sitting — a refresh loses it. A misfired keystroke found
 * an hour later needs a route back that does not involve editing the database
 * by hand.
 *
 * Reopen asks for confirmation rather than being a single click. Unlike the
 * queue's undo, this is not a hot path: it is rare, deliberate, and it changes
 * a row someone already made a decision about, so the extra click is the right
 * trade in the other direction.
 */
export function DecidedList({ items, batchId }: { items: Draft[]; batchId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  /**
   * Reopened rows are dropped from the list immediately, before the server
   * round trip settles. router.refresh() can take a moment, and a row that
   * still reads APPROVED after a confirmed reopen invites a second click —
   * the same "did that work?" doubt that made this feature necessary.
   */
  const [reopened, setReopened] = useState<Set<string>>(new Set());

  const remaining = items.filter((item) => !reopened.has(item.id));
  if (remaining.length === 0) return null;

  const visible = expanded ? remaining : remaining.slice(0, 8);

  async function reopen(item: Draft) {
    // Drop the row FIRST, then await. The server action also recounts the
    // batch, so the round trip runs to roughly a second — long enough that a
    // row still reading APPROVED invites the second click this whole feature
    // exists to prevent. If the write fails the row comes back with an error.
    setReopened((prev) => new Set(prev).add(item.id));
    setConfirming(null);
    setBusy(item.id);
    setError(null);

    const result = await reopenAction(item.kind, item.id, batchId);
    setBusy(null);

    if (!result.ok) {
      setReopened((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
          Decided ({remaining.length})
        </h2>
        <p className="font-mono text-[10px] text-ink-3">
          Reopen puts an item back in the queue as a draft.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mb-2 rounded border border-sev-high/40 bg-sev-high-bg px-3 py-1.5 text-xs text-sev-high">
          {error}
        </p>
      ) : null}

      <ul className="overflow-hidden rounded border border-rule">
        {visible.map((item) => {
          const isEdge = item.kind === "edge";
          const from = isEdge ? item.from.name : item.driver.name;
          const to = isEdge ? item.to.name : item.company.name;
          const approved = item.status === "approved";

          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule bg-surface px-3 py-2 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="text-ink-2">{from}</span>
                  <span className="mx-1.5 font-mono text-ink-3">
                    {(isEdge ? item.polarity : item.direction) === 1 ? "→ +" : "→ −"}
                  </span>
                  <span>{to}</span>
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-ink-3">
                  {isEdge ? "edge" : "exposure"}
                  {item.decidedAt ? ` · ${formatWhen(item.decidedAt)}` : ""}
                  {item.proposedBy === "ai+human" ? " · edited on approval" : ""}
                  {item.rejectionReason ? ` · “${item.rejectionReason}”` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                    approved ? "bg-sev-low-bg text-sev-low" : "bg-sev-high-bg text-sev-high"
                  }`}
                >
                  {item.status}
                </span>

                {confirming === item.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-ink-2">Reopen?</span>
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void reopen(item)}
                      className="rounded bg-accent px-2 py-0.5 font-mono text-[10px] text-white disabled:opacity-50"
                    >
                      {busy === item.id ? "…" : "Yes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="rounded border border-rule px-2 py-0.5 font-mono text-[10px] text-ink-2"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(item.id);
                      setError(null);
                    }}
                    className="rounded border border-rule px-2 py-0.5 font-mono text-[10px] text-ink-3 hover:bg-surface-2 hover:text-ink-2"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {remaining.length > 8 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 font-mono text-[11px] text-ink-3 hover:text-ink-2"
        >
          {expanded ? "show fewer" : `show all ${remaining.length}`}
        </button>
      ) : null}
    </section>
  );
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
