/**
 * Runs the ingestion pipeline for every active indicator.
 *
 *   npx tsx scripts/ingest.ts [--adapter fred] [--from 2015-01-01] [--slug X]
 *
 * Manual driver for what Inngest will schedule.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listActiveIndicators } from "../src/lib/db/repositories";
import { ingestIndicator } from "../src/lib/ingest/pipeline";
import type { AdapterDeps } from "../src/lib/ingest/types";

config({ path: ".env.local", quiet: true });

const db: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const FROM = arg("from") ?? "2015-01-01";
const TO = new Date().toISOString().slice(0, 10);

const API_KEY_BY_ADAPTER: Record<string, string | undefined> = {
  fred: process.env.FRED_API_KEY,
  open_meteo: undefined,
};

async function main() {
  const adapterFilter = arg("adapter");
  const slugFilter = arg("slug");

  let indicators = await listActiveIndicators(db, adapterFilter ? { adapter: adapterFilter } : {});
  if (slugFilter) indicators = indicators.filter((i) => i.slug === slugFilter);

  console.log(`ingesting ${indicators.length} indicators (${FROM} to ${TO})\n`);

  let totalInserted = 0;
  let totalRevised = 0;
  let failures = 0;
  const trusted: string[] = [];
  const untrusted: string[] = [];

  for (const indicator of indicators) {
    const deps: AdapterDeps = {
      fetch: globalThis.fetch,
      now: () => new Date(),
      apiKey: API_KEY_BY_ADAPTER[indicator.adapter],
    };

    const result = await ingestIndicator(db, indicator, { from: FROM, to: TO }, deps);

    totalInserted += result.applied.inserted;
    totalRevised += result.applied.revised;
    if (result.status === "failed") failures += 1;

    const f = result.forecast;
    const forecastText = f
      ? f.isTrusted
        ? `est ${f.expected?.toFixed(2)} via ${f.method} (mae ${f.mae?.toFixed(3)})`
        : `no estimate — ${f.reason ?? "untrusted"}`
      : "-";

    if (f?.isTrusted) trusted.push(indicator.slug);
    else if (result.status === "ok") untrusted.push(indicator.slug);

    console.log(
      `  ${result.status === "ok" ? "ok  " : "FAIL"} ${indicator.slug.padEnd(30)} ` +
        `+${String(result.applied.inserted).padStart(5)} ~${result.applied.revised} ` +
        `=${String(result.applied.unchanged).padStart(5)}  ${forecastText}` +
        (result.error ? `  ${result.error.slice(0, 80)}` : ""),
    );
    if (result.rejected > 0) console.log(`        ${result.rejected} rejected`);
  }

  console.log(
    `\ninserted ${totalInserted}, revised ${totalRevised}, failures ${failures}` +
      `\ntrusted estimates: ${trusted.length}/${indicators.length}`,
  );
  if (untrusted.length) console.log(`no estimate: ${untrusted.join(", ")}`);
}

main().catch((e: unknown) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
