import type { SupabaseClient } from "@supabase/supabase-js";
import { key, resolveNodes, unknownNode, type ResolvedNode } from "./nodes";

/**
 * The review queue (D9).
 *
 * Every design choice here serves one number: seconds per item. ~1,200 items at
 * 90 seconds is 30 hours of founder time, and it is the largest single call on
 * that time in the whole MVP. Anything that adds a round trip, a tab switch or
 * a form submission costs hours in aggregate.
 *
 * So: whole batches load at once, both endpoints arrive resolved, and every
 * mutation is a single call that returns the next item.
 */

export type DraftKind = "edge" | "exposure";

export type BatchSummary = {
  id: string;
  scopeNote: string;
  provider: string;
  model: string;
  createdAt: string;
  itemsDrafted: number;
  itemsApproved: number;
  itemsRejected: number;
  /** Still awaiting a decision — the number that matters to a reviewer. */
  pending: number;
  kinds: DraftKind[];
};

export type EdgeDraft = {
  kind: "edge";
  id: string;
  from: ResolvedNode;
  to: ResolvedNode;
  polarity: -1 | 1;
  strength: number;
  lagDays: number;
  confidence: number;
  mechanism: string;
  evidenceNote: string | null;
  status: string;
  proposedBy: string;
  batchId: string | null;
  reviewNotes: string | null;
};

export type ExposureDraft = {
  kind: "exposure";
  id: string;
  company: ResolvedNode;
  driver: ResolvedNode;
  direction: -1 | 1;
  magnitude: string;
  confidence: number;
  rationale: string;
  sourceNote: string | null;
  status: string;
  proposedBy: string;
  batchId: string | null;
  reviewNotes: string | null;
};

export type Draft = EdgeDraft | ExposureDraft;

export async function listBatches(db: SupabaseClient): Promise<BatchSummary[]> {
  const { data: batches } = await db
    .from("graph_draft_batches")
    .select("*")
    .order("created_at", { ascending: false });

  const summaries: BatchSummary[] = [];

  for (const batch of batches ?? []) {
    const id = batch.id as string;

    const [edgePending, exposurePending, edgeAny, exposureAny] = await Promise.all([
      countRows(db, "causal_edges", id, "draft"),
      countRows(db, "exposures", id, "draft"),
      countRows(db, "causal_edges", id),
      countRows(db, "exposures", id),
    ]);

    const kinds: DraftKind[] = [];
    if (edgeAny > 0) kinds.push("edge");
    if (exposureAny > 0) kinds.push("exposure");

    summaries.push({
      id,
      scopeNote: batch.scope_note as string,
      provider: batch.provider as string,
      model: batch.model as string,
      createdAt: batch.created_at as string,
      itemsDrafted: Number(batch.items_drafted ?? 0),
      itemsApproved: Number(batch.items_approved ?? 0),
      itemsRejected: Number(batch.items_rejected ?? 0),
      pending: edgePending + exposurePending,
      kinds,
    });
  }

  return summaries;
}

async function countRows(
  db: SupabaseClient,
  table: string,
  batchId: string,
  status?: string,
): Promise<number> {
  let query = db.from(table).select("*", { count: "exact", head: true }).eq("draft_batch_id", batchId);
  if (status) query = query.eq("status", status);
  const { count } = await query;
  return count ?? 0;
}

/**
 * Load a batch's pending drafts, endpoints already resolved.
 *
 * The whole queue arrives in one request rather than one item at a time. It is
 * a few hundred rows at most, and it means moving to the next item is instant
 * instead of a network round trip — which, across 1,200 items, is the
 * difference between the UI feeling like a tool and feeling like a form.
 */
export async function loadQueue(
  db: SupabaseClient,
  batchId: string,
  options: { includeDecided?: boolean } = {},
): Promise<Draft[]> {
  const statuses = options.includeDecided
    ? ["draft", "approved", "rejected"]
    : ["draft"];

  const [{ data: edges }, { data: exposures }] = await Promise.all([
    db
      .from("causal_edges")
      .select("*")
      .eq("draft_batch_id", batchId)
      .in("status", statuses)
      .order("from_type")
      .order("created_at"),
    db
      .from("exposures")
      .select("*")
      .eq("draft_batch_id", batchId)
      .in("status", statuses)
      .order("created_at"),
  ]);

  const refs: { type: string; id: string }[] = [];
  for (const edge of edges ?? []) {
    refs.push({ type: edge.from_type as string, id: edge.from_id as string });
    refs.push({ type: edge.to_type as string, id: edge.to_id as string });
  }
  for (const exposure of exposures ?? []) {
    refs.push({ type: "company", id: exposure.company_id as string });
    refs.push({ type: exposure.driver_type as string, id: exposure.driver_id as string });
  }

  const nodes = await resolveNodes(db, refs);
  const lookup = (type: string, id: string) => nodes.get(key(type, id)) ?? unknownNode(type, id);

  const drafts: Draft[] = [];

  for (const edge of edges ?? []) {
    drafts.push({
      kind: "edge",
      id: edge.id as string,
      from: lookup(edge.from_type as string, edge.from_id as string),
      to: lookup(edge.to_type as string, edge.to_id as string),
      polarity: Number(edge.polarity) as -1 | 1,
      strength: Number(edge.strength),
      lagDays: Number(edge.lag_days),
      confidence: Number(edge.confidence),
      mechanism: edge.mechanism as string,
      evidenceNote: (edge.evidence_note as string | null) ?? null,
      status: edge.status as string,
      proposedBy: edge.proposed_by as string,
      batchId: (edge.draft_batch_id as string | null) ?? null,
      reviewNotes: (edge.review_notes as string | null) ?? null,
    });
  }

  for (const exposure of exposures ?? []) {
    drafts.push({
      kind: "exposure",
      id: exposure.id as string,
      company: lookup("company", exposure.company_id as string),
      driver: lookup(exposure.driver_type as string, exposure.driver_id as string),
      direction: Number(exposure.direction) as -1 | 1,
      magnitude: exposure.magnitude as string,
      confidence: Number(exposure.confidence),
      rationale: exposure.rationale as string,
      sourceNote: (exposure.source_note as string | null) ?? null,
      status: exposure.status as string,
      proposedBy: exposure.proposed_by as string,
      batchId: (exposure.draft_batch_id as string | null) ?? null,
      reviewNotes: (exposure.review_notes as string | null) ?? null,
    });
  }

  /*
   * Group by driver so a sitting holds one mental context.
   *
   * Judging "crude oil → aviation fuel cost" and then "crude oil → paint input
   * cost" back to back is far cheaper than alternating between crude and
   * rainfall. This ordering is a throughput feature, not cosmetics.
   */
  drafts.sort((a, b) => {
    const aDriver = a.kind === "edge" ? a.from.name : a.driver.name;
    const bDriver = b.kind === "edge" ? b.from.name : b.driver.name;
    if (aDriver !== bDriver) return aDriver.localeCompare(bDriver);
    const aTarget = a.kind === "edge" ? a.to.name : a.company.name;
    const bTarget = b.kind === "edge" ? b.to.name : b.company.name;
    return aTarget.localeCompare(bTarget);
  });

  return drafts;
}

export type EdgeEdits = {
  polarity?: -1 | 1;
  strength?: number;
  lagDays?: number;
  confidence?: number;
  mechanism?: string;
};

export type ExposureEdits = {
  direction?: -1 | 1;
  magnitude?: string;
  confidence?: number;
  rationale?: string;
};

/**
 * Approve, optionally applying edits in the same write.
 *
 * Edit-then-approve is one call rather than save-then-approve. Most drafts will
 * be directionally right with a wrong strength or lag, so that correction is
 * the common path, and making it two round trips would double the cost of the
 * majority case.
 *
 * `review_due_at` is set on approval because an unreviewed graph decays
 * silently — see E4 in docs/06.
 */
export async function approveDraft(
  db: SupabaseClient,
  kind: DraftKind,
  id: string,
  edits: EdgeEdits | ExposureEdits = {},
  reviewerId: string | null = null,
): Promise<void> {
  const reviewDue = new Date();
  reviewDue.setUTCMonth(reviewDue.getUTCMonth() + 6);

  const base = {
    status: "approved",
    approved_by: reviewerId,
    approved_at: new Date().toISOString(),
    review_due_at: reviewDue.toISOString(),
    // An edited draft is no longer purely the model's proposal.
    ...(Object.keys(edits).length > 0 ? { proposed_by: "ai+human" } : {}),
  };

  if (kind === "edge") {
    const e = edits as EdgeEdits;
    const { error } = await db
      .from("causal_edges")
      .update({
        ...base,
        ...(e.polarity !== undefined ? { polarity: e.polarity } : {}),
        ...(e.strength !== undefined ? { strength: e.strength } : {}),
        ...(e.lagDays !== undefined ? { lag_days: e.lagDays } : {}),
        ...(e.confidence !== undefined ? { confidence: e.confidence } : {}),
        ...(e.mechanism !== undefined ? { mechanism: e.mechanism } : {}),
      })
      .eq("id", id);
    if (error) throw new Error(`approve edge: ${error.message}`);
  } else {
    const e = edits as ExposureEdits;
    const { error } = await db
      .from("exposures")
      .update({
        ...base,
        ...(e.direction !== undefined ? { direction: e.direction } : {}),
        ...(e.magnitude !== undefined ? { magnitude: e.magnitude } : {}),
        ...(e.confidence !== undefined ? { confidence: e.confidence } : {}),
        ...(e.rationale !== undefined ? { rationale: e.rationale } : {}),
      })
      .eq("id", id);
    if (error) throw new Error(`approve exposure: ${error.message}`);
  }
}

export async function rejectDraft(
  db: SupabaseClient,
  kind: DraftKind,
  id: string,
  reason: string,
  reviewerId: string | null = null,
): Promise<void> {
  const table = kind === "edge" ? "causal_edges" : "exposures";
  const { error } = await db
    .from(table)
    .update({
      status: "rejected",
      rejection_reason: reason,
      approved_by: reviewerId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`reject ${kind}: ${error.message}`);
}

/** Bulk reject a whole batch that has clearly gone wrong. */
export async function rejectBatch(
  db: SupabaseClient,
  batchId: string,
  reason: string,
): Promise<number> {
  let total = 0;
  for (const table of ["causal_edges", "exposures"]) {
    const { data, error } = await db
      .from(table)
      .update({
        status: "rejected",
        rejection_reason: reason,
        approved_at: new Date().toISOString(),
      })
      .eq("draft_batch_id", batchId)
      .eq("status", "draft")
      .select("id");
    if (error) throw new Error(`reject batch (${table}): ${error.message}`);
    total += (data ?? []).length;
  }
  return total;
}

/** Recompute a batch's counters from the rows themselves. */
export async function refreshBatchCounts(db: SupabaseClient, batchId: string): Promise<void> {
  const [approvedEdges, approvedExposures, rejectedEdges, rejectedExposures] = await Promise.all([
    countRows(db, "causal_edges", batchId, "approved"),
    countRows(db, "exposures", batchId, "approved"),
    countRows(db, "causal_edges", batchId, "rejected"),
    countRows(db, "exposures", batchId, "rejected"),
  ]);

  await db
    .from("graph_draft_batches")
    .update({
      items_approved: approvedEdges + approvedExposures,
      items_rejected: rejectedEdges + rejectedExposures,
    })
    .eq("id", batchId);
}
