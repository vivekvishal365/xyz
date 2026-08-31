/**
 * Prints what is actually in the database.
 *
 *   npm run db:summary
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const TABLES = [
  "countries",
  "sources",
  "indicators",
  "ingest_runs",
  "raw_payloads",
  "indicator_observations",
  "observation_revisions",
  "expectation_models",
  "expectations",
];

type ExpectationRow = {
  period_end: string;
  expected: number;
  error_mae: number | null;
  basis: string;
  indicators: { slug: string; unit: string } | null;
  expectation_models: { method: string } | null;
};

async function countRows(table: string): Promise<number> {
  const { count } = await db.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function main() {
  console.log("row counts");
  for (const table of TABLES) {
    console.log(`  ${table.padEnd(24)} ${String(await countRows(table)).padStart(7)}`);
  }

  const { count: trusted } = await db
    .from("expectation_models")
    .select("*", { count: "exact", head: true })
    .eq("is_trusted", true);
  console.log(`  ${"(trusted models)".padEnd(24)} ${String(trusted ?? 0).padStart(7)}`);

  console.log("\nSignalX estimates (D1) — each with the model error it is normalised by:");
  const { data } = await db
    .from("expectations")
    .select("period_end, expected, error_mae, basis, indicators(slug, unit), expectation_models(method)")
    .order("period_end", { ascending: false })
    .limit(10)
    .overrideTypes<ExpectationRow[]>();

  for (const row of data ?? []) {
    const slug = row.indicators?.slug ?? "?";
    const unit = row.indicators?.unit ?? "";
    const method = row.expectation_models?.method ?? "-";
    const mae = row.error_mae === null ? "  -" : Number(row.error_mae).toFixed(3);
    console.log(
      `  ${slug.padEnd(28)} ${Number(row.expected).toFixed(2).padStart(11)} ${unit.padEnd(9)}` +
        ` ±${mae.padStart(8)}  ${method.padEnd(6)} for ${row.period_end}  [${row.basis}]`,
    );
  }

  const { data: runs } = await db.from("ingest_runs").select("status").limit(500);
  const byStatus: Record<string, number> = {};
  for (const run of (runs ?? []) as { status: string }[]) {
    byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
  }
  console.log("\ningest runs by status:", byStatus);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

