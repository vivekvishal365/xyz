import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  "countries", "sources", "indicators", "ingest_runs", "raw_payloads",
  "indicator_observations", "observation_revisions", "expectation_models", "expectations",
];

async function main() {
  console.log("project:", url.replace(/https:\/\/([^.]+)\./, "https://***."));
  for (const t of TABLES) {
    const { error, count } = await db.from(t).select("*", { count: "exact", head: true });
    console.log(`  ${t.padEnd(26)} ${error ? "MISSING — " + error.message.slice(0, 60) : `ok (${count} rows)`}`);
  }
}
main().catch((e: unknown) => { console.error(e); process.exitCode = 1; });
