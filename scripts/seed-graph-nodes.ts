/**
 * Seeds sectors and companies — the endpoints causal edges point at.
 *
 *   npm run db:seed:nodes
 *
 * Idempotent; upserts on slug.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { COMPANIES, SECTORS } from "../src/lib/graph/catalogue";

config({ path: ".env.local", quiet: true });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: countries } = await db.from("countries").select("id, iso2");
  const india = (countries ?? []).find((c) => c.iso2 === "IN")?.id ?? null;

  // Parents first, so parent_id resolves.
  const roots = SECTORS.filter((s) => !s.parent);
  const children = SECTORS.filter((s) => s.parent);

  for (const sector of roots) {
    const { error } = await db.from("sectors").upsert(
      { slug: sector.slug, name: sector.name, description: sector.description, country_id: india, parent_id: null },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`sector ${sector.slug}: ${error.message}`);
  }

  const { data: sectorRows } = await db.from("sectors").select("id, slug");
  const sectorId = new Map((sectorRows ?? []).map((s) => [s.slug as string, s.id as string]));

  for (const sector of children) {
    const parent = sectorId.get(sector.parent!);
    const { error } = await db.from("sectors").upsert(
      { slug: sector.slug, name: sector.name, description: sector.description, country_id: india, parent_id: parent ?? null },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`sector ${sector.slug}: ${error.message}`);
  }

  const { data: allSectors } = await db.from("sectors").select("id, slug");
  const finalSectorId = new Map((allSectors ?? []).map((s) => [s.slug as string, s.id as string]));
  console.log(`sectors: ${finalSectorId.size}`);

  let seeded = 0;
  for (const company of COMPANIES) {
    const sector = finalSectorId.get(company.sector);
    if (!sector) throw new Error(`company ${company.slug} references unknown sector ${company.sector}`);
    const { error } = await db.from("companies").upsert(
      { slug: company.slug, name: company.name, description: company.description, sector_id: sector, country_id: india, is_active: true },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`company ${company.slug}: ${error.message}`);
    seeded += 1;
  }
  console.log(`companies: ${seeded}`);
}

main().catch((e: unknown) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
