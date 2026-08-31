import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Offline graph drafting (D9).
 *
 * An LLM proposes candidate edges and exposures; a human approves every one.
 * This runs **outside the request path** and produces nothing a user can see —
 * every row lands as `status = 'draft'`, and the runtime traverses only
 * `approved`.
 *
 * That separation is what keeps the Option B architecture honest. Using a model
 * to *propose* causality offline is fine; using one to *assert* causality at
 * read time is the failure mode the whole design exists to avoid.
 */

export const draftedEdgeSchema = z.object({
  fromType: z.enum(["indicator", "sector", "company", "commodity"]),
  fromSlug: z.string().min(1),
  toType: z.enum(["indicator", "sector", "company", "commodity"]),
  toSlug: z.string().min(1),
  polarity: z.union([z.literal(-1), z.literal(1)]),
  strength: z.number().min(0).max(1),
  lagDays: z.number().int().min(0).max(3650),
  confidence: z.number().min(0).max(1),
  /** One sentence saying WHY. Required — an edge nobody can audit is worthless. */
  mechanism: z.string().min(20),
  evidenceNote: z.string().optional(),
});

export const draftedExposureSchema = z.object({
  companySlug: z.string().min(1),
  driverType: z.enum(["indicator", "commodity", "sector", "theme"]),
  driverSlug: z.string().min(1),
  direction: z.union([z.literal(-1), z.literal(1)]),
  magnitude: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(20),
  sourceNote: z.string().optional(),
});

export type DraftedEdge = z.infer<typeof draftedEdgeSchema>;
export type DraftedExposure = z.infer<typeof draftedExposureSchema>;

export const draftResponseSchema = z.object({
  edges: z.array(draftedEdgeSchema).default([]),
  exposures: z.array(draftedExposureSchema).default([]),
});

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * The drafting instruction.
 *
 * Written to make the model's job *narrow*: propose linkages between things
 * that already exist in our catalogue, state a mechanism, and admit
 * uncertainty. It is explicitly told that a human will reject anything it
 * cannot justify — which is true, and which is the only reason it is safe to
 * let a model near the graph at all.
 */
export const DRAFTING_SYSTEM_PROMPT = `You propose candidate cause-and-effect links for an economic intelligence system covering India.

Your output is a DRAFT. A human reviews every single row and rejects anything that is not defensible. Proposing fewer, better-justified links is strictly better than proposing many weak ones.

Rules:
- Only use slugs from the supplied catalogue. Never invent one.
- Every edge needs a one-sentence MECHANISM explaining why the link exists. "They are correlated" is not a mechanism. Name the transmission channel: a cost input, a demand channel, a funding cost, a policy response.
- polarity: +1 if the driver rising pushes the target up, -1 if it pushes it down.
- strength: 0-1, how much of the target's movement this driver plausibly explains. Most real edges are 0.2-0.5. Reserve above 0.7 for near-mechanical relationships.
- lagDays: how long transmission takes. Fuel prices reach airline costs in days; policy rates reach loan demand in months.
- confidence: 0-1, how sure you are the link is real and correctly signed. Be honest; low confidence is useful information, an overconfident guess is not.
- Do NOT propose links you cannot explain. Do NOT propose a link merely because two things are in the same sector.
- Do NOT make claims about share prices or investment merit. Describe exposure and transmission only.

Return JSON matching the requested schema. No prose outside the JSON.`;

export function buildDraftingPrompt(input: {
  driverLabel: string;
  driverSlug: string;
  driverType: string;
  indicators: { slug: string; name: string; unit: string; category: string }[];
  sectors: { slug: string; name: string; description: string | null }[];
  companies: { slug: string; name: string; sector: string; description: string | null }[];
  want: "edges" | "exposures" | "both";
}): string {
  const lines: string[] = [];

  lines.push(`Driver: ${input.driverLabel} (${input.driverType}, slug: ${input.driverSlug})`);
  lines.push("");
  lines.push("Propose links FROM this driver to things in the catalogue below.");
  lines.push("");
  lines.push("## Indicators");
  for (const i of input.indicators) lines.push(`- ${i.slug} — ${i.name} (${i.category}, ${i.unit})`);
  lines.push("");
  lines.push("## Sectors");
  for (const s of input.sectors) lines.push(`- ${s.slug} — ${s.name}${s.description ? `: ${s.description}` : ""}`);
  lines.push("");
  lines.push("## Companies");
  for (const c of input.companies) lines.push(`- ${c.slug} — ${c.name} [${c.sector}]${c.description ? `: ${c.description}` : ""}`);
  lines.push("");
  lines.push(
    input.want === "exposures"
      ? "Return company exposures only."
      : input.want === "edges"
        ? "Return edges only (driver to indicator or sector)."
        : "Return both edges (driver to indicator/sector) and company exposures.",
  );

  return lines.join("\n");
}

export function hashPrompt(system: string, user: string): string {
  return createHash("sha256").update(`${system}\n---\n${user}`, "utf8").digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Provider abstraction (D8)
// ---------------------------------------------------------------------------

export type LlmClient = {
  provider: string;
  model: string;
  completeJson(system: string, user: string): Promise<unknown>;
};

/**
 * Anthropic adapter.
 *
 * Kept behind the `LlmClient` interface so the provider is a one-file swap —
 * D8 left the choice open, and the drafting job is exactly the workload where
 * model quality matters most, so it should be easy to change.
 */
export function anthropicClient(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof globalThis.fetch;
}): LlmClient {
  const model = options.model ?? "claude-opus-4-5";
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  return {
    provider: "anthropic",
    model,
    async completeJson(system, user) {
      const response = await doFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });

      if (!response.ok) {
        throw new Error(`anthropic: HTTP ${response.status} — ${(await response.text()).slice(0, 300)}`);
      }

      const body = (await response.json()) as { content?: { type: string; text?: string }[] };
      const text = (body.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      return JSON.parse(extractJson(text));
    },
  };
}

/** Models sometimes wrap JSON in prose or a fence despite instructions. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);

  return text.trim();
}

// ---------------------------------------------------------------------------
// Writing a batch
// ---------------------------------------------------------------------------

export type WriteBatchInput = {
  scopeNote: string;
  provider: string;
  model: string;
  promptHash: string;
  edges: DraftedEdge[];
  exposures: DraftedExposure[];
};

export type WriteBatchResult = {
  batchId: string;
  edgesWritten: number;
  exposuresWritten: number;
  /** Proposals dropped before reaching the queue, with the reason. */
  skipped: { item: string; reason: string }[];
};

/**
 * Resolve slugs to ids and write the batch as drafts.
 *
 * Unresolvable slugs are dropped and reported rather than written. A model that
 * invents a company name should cost a line in a report, not a broken row that
 * a reviewer has to puzzle over — reviewer attention is the scarce resource.
 */
export async function writeDraftBatch(
  db: SupabaseClient,
  input: WriteBatchInput,
): Promise<WriteBatchResult> {
  const [indicators, sectors, companies] = await Promise.all([
    db.from("indicators").select("id, slug"),
    db.from("sectors").select("id, slug"),
    db.from("companies").select("id, slug"),
  ]);

  const idFor: Record<string, Map<string, string>> = {
    indicator: new Map((indicators.data ?? []).map((r) => [r.slug as string, r.id as string])),
    commodity: new Map((indicators.data ?? []).map((r) => [r.slug as string, r.id as string])),
    sector: new Map((sectors.data ?? []).map((r) => [r.slug as string, r.id as string])),
    company: new Map((companies.data ?? []).map((r) => [r.slug as string, r.id as string])),
    theme: new Map(),
  };

  const skipped: { item: string; reason: string }[] = [];

  const { data: batch, error: batchError } = await db
    .from("graph_draft_batches")
    .insert({
      scope_note: input.scopeNote,
      provider: input.provider,
      model: input.model,
      prompt_hash: input.promptHash,
      items_drafted: 0,
    })
    .select()
    .single();

  if (batchError || !batch) {
    throw new Error(`create batch: ${batchError?.message ?? "no row returned"}`);
  }

  const batchId = batch.id as string;

  const edgeRows = [];
  for (const edge of input.edges) {
    const fromId = idFor[edge.fromType]?.get(edge.fromSlug);
    const toId = idFor[edge.toType]?.get(edge.toSlug);

    if (!fromId) {
      skipped.push({ item: `${edge.fromSlug} → ${edge.toSlug}`, reason: `unknown ${edge.fromType} "${edge.fromSlug}"` });
      continue;
    }
    if (!toId) {
      skipped.push({ item: `${edge.fromSlug} → ${edge.toSlug}`, reason: `unknown ${edge.toType} "${edge.toSlug}"` });
      continue;
    }

    edgeRows.push({
      from_type: edge.fromType === "commodity" ? "indicator" : edge.fromType,
      from_id: fromId,
      to_type: edge.toType === "commodity" ? "indicator" : edge.toType,
      to_id: toId,
      polarity: edge.polarity,
      strength: edge.strength,
      lag_days: edge.lagDays,
      confidence: edge.confidence,
      mechanism: edge.mechanism,
      evidence_note: edge.evidenceNote ?? null,
      status: "draft",
      proposed_by: "ai",
      draft_batch_id: batchId,
    });
  }

  const exposureRows = [];
  for (const exposure of input.exposures) {
    const companyId = idFor.company?.get(exposure.companySlug);
    const driverId = idFor[exposure.driverType]?.get(exposure.driverSlug);

    if (!companyId) {
      skipped.push({ item: `${exposure.companySlug} ← ${exposure.driverSlug}`, reason: `unknown company "${exposure.companySlug}"` });
      continue;
    }
    if (!driverId) {
      skipped.push({ item: `${exposure.companySlug} ← ${exposure.driverSlug}`, reason: `unknown ${exposure.driverType} "${exposure.driverSlug}"` });
      continue;
    }

    exposureRows.push({
      company_id: companyId,
      driver_type: exposure.driverType === "commodity" ? "indicator" : exposure.driverType,
      driver_id: driverId,
      direction: exposure.direction,
      magnitude: exposure.magnitude,
      rationale: exposure.rationale,
      confidence: exposure.confidence,
      source_note: exposure.sourceNote ?? null,
      status: "draft",
      proposed_by: "ai",
      draft_batch_id: batchId,
    });
  }

  // ignoreDuplicates: re-drafting an existing pair should not error the whole
  // run. The unique constraints already guarantee one row per relationship.
  if (edgeRows.length > 0) {
    const { error } = await db
      .from("causal_edges")
      .upsert(edgeRows, { onConflict: "from_type,from_id,to_type,to_id,version", ignoreDuplicates: true });
    if (error) throw new Error(`insert edges: ${error.message}`);
  }

  if (exposureRows.length > 0) {
    const { error } = await db
      .from("exposures")
      .upsert(exposureRows, { onConflict: "company_id,driver_type,driver_id", ignoreDuplicates: true });
    if (error) throw new Error(`insert exposures: ${error.message}`);
  }

  await db
    .from("graph_draft_batches")
    .update({ items_drafted: edgeRows.length + exposureRows.length })
    .eq("id", batchId);

  return {
    batchId,
    edgesWritten: edgeRows.length,
    exposuresWritten: exposureRows.length,
    skipped,
  };
}
