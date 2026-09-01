"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
  approveDraft,
  refreshBatchCounts,
  rejectBatch,
  rejectDraft,
  reopenDraft,
  type DraftKind,
  type EdgeEdits,
  type ExposureEdits,
} from "@/lib/graph/review";

/**
 * Review mutations.
 *
 * These return quickly and deliberately do NOT revalidate the queue page on
 * every decision. The client holds the whole batch and advances locally — a
 * revalidation per item would re-render the queue 1,200 times and make the
 * keyboard flow stutter, which is the one thing this UI cannot afford.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function approveAction(
  kind: DraftKind,
  id: string,
  edits: EdgeEdits | ExposureEdits,
): Promise<ActionResult> {
  try {
    await approveDraft(createServiceClient(), kind, id, edits);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "approve failed" };
  }
}

export async function rejectAction(
  kind: DraftKind,
  id: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await rejectDraft(createServiceClient(), kind, id, reason);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "reject failed" };
  }
}

/**
 * Put a decided draft back in the queue.
 *
 * Undo has to exist for the keyboard flow to be safe. Single-key approve is
 * only fast if a misfire is cheap to reverse; without undo, reviewers slow down
 * to double-check every keystroke and the throughput gain evaporates.
 */
export async function undoAction(kind: DraftKind, id: string): Promise<ActionResult> {
  try {
    const table = kind === "edge" ? "causal_edges" : "exposures";
    const { error } = await createServiceClient()
      .from(table)
      .update({
        status: "draft",
        rejection_reason: null,
        approved_by: null,
        approved_at: null,
        review_due_at: null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "undo failed" };
  }
}

/**
 * Reopen a decided item from the Decided list.
 *
 * Distinct from `undoAction` on purpose. Undo is the hot path — optimistic, no
 * revalidation, keeping the keyboard flow instant. Reopen is a deliberate,
 * rare correction, so it refreshes the batch counters and revalidates the page
 * so the lists visibly agree with the database afterwards.
 */
export async function reopenAction(
  kind: DraftKind,
  id: string,
  batchId: string,
): Promise<ActionResult> {
  try {
    const db = createServiceClient();
    await reopenDraft(db, kind, id);
    await refreshBatchCounts(db, batchId);
    revalidatePath(`/admin/graph/${batchId}`);
    revalidatePath("/admin/graph");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "reopen failed" };
  }
}

export async function rejectBatchAction(
  batchId: string,
  reason: string,
): Promise<ActionResult & { count?: number }> {
  try {
    const db = createServiceClient();
    const count = await rejectBatch(db, batchId, reason);
    await refreshBatchCounts(db, batchId);
    revalidatePath("/admin/graph");
    return { ok: true, count };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "bulk reject failed" };
  }
}

/** Called once when a sitting ends, rather than after every decision. */
export async function finishBatchAction(batchId: string): Promise<ActionResult> {
  try {
    await refreshBatchCounts(createServiceClient(), batchId);
    revalidatePath("/admin/graph");
    revalidatePath(`/admin/graph/${batchId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "refresh failed" };
  }
}
