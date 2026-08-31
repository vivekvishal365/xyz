/**
 * Applies a migration file to the linked Supabase project.
 *
 *   npx tsx scripts/apply-migration.ts supabase/migrations/<file>.sql
 *
 * Uses a direct Postgres connection rather than the REST client, because the
 * REST API cannot execute arbitrary DDL.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/apply-migration.ts <path-to.sql>");
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    "SUPABASE_DB_URL is not set.\n" +
      "Supabase dashboard -> Project Settings -> Database -> Connection string -> URI\n" +
      "(use the session pooler URI, and put it in .env.local)",
  );
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  const text = readFileSync(file!, "utf8");
  console.log(`applying ${file} (${text.length} bytes)`);
  await sql.unsafe(text);
  console.log("applied");
  await sql.end();
}

main().catch(async (error: unknown) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  await sql.end();
  process.exitCode = 1;
});
