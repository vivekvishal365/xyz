/**
 * Offline graph drafting job (D9).
 *
 *   npm run graph:draft -- --driver brent-crude-daily [--want both] [--dry-run]
 *
 * Proposes candidate edges and exposures into the review queue as DRAFTS.
 * Nothing it writes is visible to a user, and nothing is traversed at runtime,
 * until a human approves it in /admin/graph.
 *
 * Needs ANTHROPIC_API_KEY (or swap the client — see LlmClient in
 * src/lib/graph/drafting.ts).
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  anthropicClient,
  buildDraftingPrompt,
  draftResponseSchema,
  DRAFTING_SYSTEM_PROMPT,
  hashPrompt,
  writeDraftBatch,
} from "../src/lib/graph/drafting";

config({ path: ".env.local", quiet: true });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const driverSlug = arg("driver");
  if (!driverSlug) {
    console.error("usage: npm run graph:draft -- --driver <indicator-slug> [--want edges|exposures|both]");
    process.exit(1);
  }

  const want = (arg("want") ?? "both") as "edges" | "exposures" | "both";
  const dryRun = hasFlag("dry-run");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !dryRun) {
    console.error(
      "ANTHROPIC_API_KEY is not set.\n" +
        "Add it to .env.local, or run with --dry-run to print the prompt without calling a model.",
    );
    process.exit(1);
  }

  const [{ data: driver }, indicators, sectors, companies] = await Promise.all([
    db.from("indicators").select("slug, name, unit, category").eq("slug", driverSlug).maybeSingle(),
    db.from("indicators").select("slug, name, unit, category").eq("is_active", true),
    db.from("sectors").select("slug, name, description"),
    db.from("companies").select("slug, name, description, sectors(slug)"),
  ]);

  if (!driver) {
    console.error(`No indicator with slug "${driverSlug}".`);
    process.exit(1);
  }

  const user = buildDraftingPrompt({
    driverLabel: driver.name as string,
    driverSlug,
    driverType: "indicator",
    indicators: (indicators.data ?? []).filter((i) => i.slug !== driverSlug) as never,
    sectors: (sectors.data ?? []) as never,
    companies: (companies.data ?? []).map((c) => {
      const embedded = c.sectors as unknown;
      const sector = (Array.isArray(embedded) ? embedded[0] : embedded) as { slug: string } | null;
      return { slug: c.slug, name: c.name, description: c.description, sector: sector?.slug ?? "?" };
    }) as never,
    want,
  });

  if (dryRun) {
    console.log("=== SYSTEM ===\n" + DRAFTING_SYSTEM_PROMPT);
    console.log("\n=== USER ===\n" + user);
    console.log(`\n(prompt hash ${hashPrompt(DRAFTING_SYSTEM_PROMPT, user)}, ${user.length} chars)`);
    return;
  }

  const client = anthropicClient({ apiKey: apiKey! });
  console.log(`drafting from ${driverSlug} via ${client.provider}/${client.model}…`);

  const raw = await client.completeJson(DRAFTING_SYSTEM_PROMPT, user);
  const parsed = draftResponseSchema.safeParse(raw);

  if (!parsed.success) {
    console.error("Model output did not match the schema:");
    for (const issue of parsed.error.issues.slice(0, 10)) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const result = await writeDraftBatch(db, {
    scopeNote: `Edges & exposures from ${driver.name as string}`,
    provider: client.provider,
    model: client.model,
    promptHash: hashPrompt(DRAFTING_SYSTEM_PROMPT, user),
    edges: parsed.data.edges,
    exposures: parsed.data.exposures,
  });

  console.log(`batch ${result.batchId}`);
  console.log(`  ${result.edgesWritten} edges, ${result.exposuresWritten} exposures queued for review`);
  if (result.skipped.length > 0) {
    console.log(`  ${result.skipped.length} dropped:`);
    for (const s of result.skipped.slice(0, 10)) console.log(`    ${s.item} — ${s.reason}`);
  }
  console.log(`\nReview at /admin/graph/${result.batchId}`);
}

main().catch((e: unknown) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
