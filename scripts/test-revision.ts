/**
 * Verifies the revision path in apply_observations() against the live DB.
 *
 * Perturbs one stored observation, re-runs ingest for that indicator, and
 * checks the provider's real value comes back as a REVISION rather than an
 * overwrite — old row retired, revision 2 inserted, revision recorded.
 *
 *   npx tsx scripts/test-revision.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getIndicatorBySlug } from "../src/lib/db/repositories";
import { ingestIndicator } from "../src/lib/ingest/pipeline";

config({ path: ".env.local", quiet: true });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const SLUG = "us-fed-funds-rate";

async function main() {
  const indicator = await getIndicatorBySlug(db, SLUG);
  if (!indicator) throw new Error(`no indicator ${SLUG}`);

  const { data: before } = await db
    .from("indicator_observations")
    .select("id, period_end, value, revision, is_current")
    .eq("indicator_id", indicator.id).eq("is_current", true)
    .order("period_end", { ascending: false }).limit(1).single();

  const target = before!;
  const realValue = Number(target.value);
  const perturbed = realValue + 1.5;

  console.log(`target period ${target.period_end}: real value ${realValue}, revision ${target.revision}`);
  console.log(`perturbing stored value to ${perturbed} so the provider's number reads as a revision\n`);

  await db.from("indicator_observations").update({ value: perturbed }).eq("id", target.id);

  const result = await ingestIndicator(
    db, indicator, { from: "2015-01-01", to: new Date().toISOString().slice(0, 10) },
    { fetch: globalThis.fetch, now: () => new Date(), apiKey: process.env.FRED_API_KEY },
  );

  console.log("applied:", result.applied, "| status:", result.status);
  if (result.error) console.log("error:", result.error);

  const { data: rows } = await db
    .from("indicator_observations")
    .select("id, period_end, value, revision, is_current")
    .eq("indicator_id", indicator.id).eq("period_end", target.period_end)
    .order("revision");

  console.log("\nrows for that period:");
  for (const r of rows ?? []) {
    console.log(`  rev ${r.revision}  value ${r.value}  current=${r.is_current}`);
  }

  const { data: revs } = await db
    .from("observation_revisions").select("previous_value, new_value, revised_at")
    .eq("indicator_id", indicator.id).eq("period_end", target.period_end);
  console.log("\nobservation_revisions rows:", revs?.length ?? 0);
  for (const r of revs ?? []) console.log(`  ${r.previous_value} -> ${r.new_value}`);

  const currents = (rows ?? []).filter((r) => r.is_current);
  const ok =
    result.applied.revised === 1 &&
    currents.length === 1 &&
    Number(currents[0]!.value) === realValue &&
    currents[0]!.revision === target.revision + 1 &&
    (revs?.length ?? 0) === 1;

  console.log(`\n${ok ? "PASS" : "FAIL"} — exactly one current row, at the provider's real value, prior print preserved`);

  // Clean up: retire the revision, restore the original as current.
  await db.from("indicator_observations").delete().eq("id", currents[0]!.id).neq("revision", 1);
  await db.from("indicator_observations").update({ is_current: true, value: realValue }).eq("id", target.id);
  await db.from("observation_revisions").delete().eq("indicator_id", indicator.id).eq("period_end", target.period_end);
  console.log("cleaned up");
}

main().catch((e: unknown) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exitCode = 1; });
