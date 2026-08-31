/**
 * Seeds countries, sources and the indicator catalogue.
 *
 *   npx tsx scripts/seed.ts
 *
 * Idempotent — every write is an upsert keyed on a natural key, so re-running
 * updates the catalogue in place rather than duplicating it.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CATALOGUE } from "../src/lib/ingest/catalogue";
import { listAdapters } from "../src/lib/ingest/registry";
import { FREQUENCY_BY_PERIOD_TYPE } from "../src/lib/db/types";
import { upsertIndicator, upsertSource } from "../src/lib/db/repositories";

config({ path: ".env.local", quiet: true });

const db: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const SOURCE_CATEGORY: Record<string, string> = { fred: "official", open_meteo: "weather" };
const SOURCE_LICENCE: Record<string, string> = {
  fred: "Public domain / free with attribution. Redistribution permitted.",
  open_meteo: "CC-BY-4.0 (ERA5 via Open-Meteo). Attribution required in the UI.",
};

async function hasAdapterConfigColumn(): Promise<boolean> {
  const { error } = await db.from("indicators").select("adapter_config").limit(1);
  return !error;
}

async function main() {
  // Countries
  const countries = [
    { iso2: "IN", name: "India", currency: "INR" },
    { iso2: "US", name: "United States", currency: "USD" },
  ];
  const { error: countryError } = await db
    .from("countries")
    .upsert(countries, { onConflict: "iso2" });
  if (countryError) throw new Error(`countries: ${countryError.message}`);

  const { data: countryRows } = await db.from("countries").select("id, iso2");
  const countryId = new Map((countryRows ?? []).map((c) => [c.iso2 as string, c.id as string]));
  console.log(`countries: ${countries.length}`);

  // Sources, one per registered adapter
  const sourceId = new Map<string, string>();
  for (const adapter of listAdapters()) {
    const row = await upsertSource(db, {
      slug: adapter.id,
      name: adapter.sourceName,
      url: adapter.sourceUrl,
      category: SOURCE_CATEGORY[adapter.id] ?? "official",
      reliability: adapter.reliability,
      licenceNote: SOURCE_LICENCE[adapter.id],
    });
    sourceId.set(adapter.id, row.id);
    console.log(`source: ${adapter.id} (reliability ${adapter.reliability})`);
  }

  const withAdapterConfig = await hasAdapterConfigColumn();
  if (!withAdapterConfig) {
    console.log(
      "\n! indicators.adapter_config is missing — migration 0002 not applied.\n" +
        "  Seeding FRED indicators only; weather indicators need that column.\n",
    );
  }

  // Indicators
  let seeded = 0;
  let skipped = 0;
  for (const entry of CATALOGUE) {
    const needsConfig = entry.adapterConfig !== undefined;
    if (needsConfig && !withAdapterConfig) {
      console.log(`  skip  ${entry.slug.padEnd(30)} needs adapter_config`);
      skipped += 1;
      continue;
    }

    const source = sourceId.get(entry.adapter);
    if (!source) throw new Error(`no source row for adapter ${entry.adapter}`);

    await upsertIndicator(db, {
      slug: entry.slug,
      name: entry.name,
      category: entry.category,
      country_id: entry.country ? (countryId.get(entry.country) ?? null) : null,
      unit: entry.unit,
      frequency: FREQUENCY_BY_PERIOD_TYPE[entry.periodType],
      seasonality: entry.seasonality,
      higher_is: entry.higherIs,
      source_id: source,
      adapter: entry.adapter,
      source_series_code: entry.sourceSeriesCode,
      transform: entry.note ? { note: entry.note } : null,
      ...(withAdapterConfig ? { adapter_config: entry.adapterConfig ?? {} } : {}),
      detection_config: entry.detectionConfig ?? {},
      release_lag_days: entry.releaseLagDays,
      is_active: entry.isActive ?? true,
    } as never);

    const flag = entry.isActive === false ? "  (inactive)" : "";
    console.log(`  seed  ${entry.slug.padEnd(30)} ${entry.adapter.padEnd(11)}${entry.sourceSeriesCode}${flag}`);
    seeded += 1;
  }

  console.log(`\nseeded ${seeded} indicators, skipped ${skipped}`);
  const inactive = CATALOGUE.filter((e) => e.isActive === false);
  if (inactive.length) {
    console.log("\ninactive (known gaps):");
    for (const e of inactive) console.log(`  ${e.slug}: ${e.note}`);
  }
}

main().catch((e: unknown) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
