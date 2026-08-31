/**
 * Confirms the schema and RPCs the pipeline depends on are present.
 *
 *   npx tsx scripts/db-check.ts
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
  "countries", "sources", "indicators", "ingest_runs", "raw_payloads",
  "indicator_observations", "observation_revisions", "expectation_models", "expectations",
];

async function main() {
  for (const table of TABLES) {
    const { error, count } = await db.from(table).select("*", { count: "exact", head: true });
    console.log(`  ${table.padEnd(26)} ${error ? "MISSING — " + error.message.slice(0, 60) : `ok (${count} rows)`}`);
  }

  const column = await db.from("indicators").select("adapter_config").limit(1);
  console.log(`  ${"indicators.adapter_config".padEnd(26)} ${column.error ? "MISSING" : "ok"}`);

  // Called with a batch of zero rows: exercises the function without writing.
  const rpc = await db.rpc("apply_observations", {
    p_indicator_id: "00000000-0000-0000-0000-000000000000",
    p_source_id: "00000000-0000-0000-0000-000000000000",
    p_raw_payload_id: null,
    p_rows: [],
  });
  const missing = rpc.error && /could not find|does not exist|schema cache/i.test(rpc.error.message);
  console.log(
    `  ${"apply_observations()".padEnd(26)} ` +
      (missing ? "MISSING" : rpc.error ? `present (${rpc.error.message.slice(0, 45)})` : `ok — ${JSON.stringify(rpc.data)}`),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
