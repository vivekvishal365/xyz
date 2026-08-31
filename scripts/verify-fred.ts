/**
 * Verifies every FRED series in the catalogue against the live API.
 *
 *   npx tsx scripts/verify-fred.ts
 *
 * FRED discontinues series regularly. A seeded code that quietly returns
 * nothing is worse than one that errors: the indicator looks configured, and
 * simply never updates. This is the check that stops that reaching the seed.
 */
import { config } from "dotenv";
import { fredAdapter } from "../src/lib/ingest/adapters/fred";
import { normalize } from "../src/lib/ingest/normalize";
import { catalogueFor } from "../src/lib/ingest/catalogue";
import type { SeriesSpec } from "../src/lib/ingest/types";

config({ path: ".env.local", quiet: true });

const apiKey = process.env.FRED_API_KEY;
if (!apiKey) {
  console.error("FRED_API_KEY is not set in .env.local");
  process.exit(1);
}

const deps = { fetch: globalThis.fetch, now: () => new Date(), apiKey };
const FROM = "2015-01-01";
const TO = new Date().toISOString().slice(0, 10);

type Verdict = {
  slug: string;
  code: string;
  ok: boolean;
  observations: number;
  lastPeriod: string | null;
  lastValue: number | null;
  staleDays: number | null;
  warnings: number;
  rejected: number;
  /**
   * Staleness judged against the indicator own expected release lag, not a
   * single global cutoff — a daily FX series 60 days behind is broken, while a
   * quarterly GDP series 60 days behind is simply normal.
   */
  stale: boolean;
  note: string;
};

/** Generous but finite: twice the expected lag, plus a two-month grace. */
function staleThreshold(releaseLagDays: number | null): number {
  const lag = releaseLagDays ?? 30;
  return lag * 2 + 60;
}

async function probe(entry: ReturnType<typeof catalogueFor>[number]): Promise<Verdict> {
  const spec: SeriesSpec = {
    indicatorKey: entry.slug,
    sourceSeriesCode: entry.sourceSeriesCode,
    periodType: entry.periodType,
    unit: entry.unit,
  };

  const base: Verdict = {
    slug: entry.slug, code: entry.sourceSeriesCode, ok: false, observations: 0,
    lastPeriod: null, lastValue: null, staleDays: null, warnings: 0, rejected: 0, stale: false, note: "",
  };

  try {
    const payload = await fredAdapter.fetch(spec, { from: FROM, to: TO }, deps);

    // The stored URL must never carry the credential (§26, §39).
    if (payload.url.includes(apiKey!)) {
      return { ...base, note: "FAIL: api key leaked into stored payload URL" };
    }
    if (!/^[0-9a-f]{64}$/.test(payload.contentHash)) {
      return { ...base, note: "FAIL: content hash malformed" };
    }

    const parsed = fredAdapter.parse(payload, spec);
    const norm = normalize(parsed.observations, spec, {
      sourceId: "fred", ingestRunId: "verify", contentHash: payload.contentHash,
      observedAt: new Date(),
    });

    const last = norm.observations.at(-1);
    const staleDays = last
      ? Math.round((Date.now() - new Date(`${last.periodEnd}T00:00:00Z`).getTime()) / 86_400_000)
      : null;

    return {
      ...base,
      ok: norm.observations.length > 0 && norm.rejected.length === 0,
      observations: norm.observations.length,
      lastPeriod: last?.periodEnd ?? null,
      lastValue: last?.value ?? null,
      staleDays,
      warnings: parsed.warnings.length,
      rejected: norm.rejected.length,
      stale: staleDays !== null && staleDays > staleThreshold(entry.releaseLagDays),
      note: norm.rejected[0]?.reason ?? "",
    };
  } catch (error) {
    return { ...base, note: error instanceof Error ? error.message.slice(0, 90) : String(error) };
  }
}

async function main() {
  const entries = catalogueFor("fred");
  console.log(`probing ${entries.length} FRED series (${FROM} to ${TO})\n`);

  const results: Verdict[] = [];
  for (const entry of entries) {
    results.push(await probe(entry));
  }

  const header = "  slug".padEnd(32) + "code".padEnd(20) + "obs".padStart(6) + "  last".padEnd(14) + "stale".padStart(7) + "  status";
  console.log(header);
  console.log("  " + "-".repeat(header.length));

  for (const r of results) {
    const status = r.ok ? (r.stale ? "STALE" : "ok") : "FAIL";
    console.log(
      "  " + r.slug.padEnd(30) + r.code.padEnd(20) +
      String(r.observations).padStart(6) + "  " + (r.lastPeriod ?? "-").padEnd(12) +
      String(r.staleDays ?? "-").padStart(7) + "  " + status + (r.note ? " — " + r.note : ""),
    );
  }

  const ok = results.filter((r) => r.ok);
  const stale = ok.filter((r) => r.stale);
  console.log(`\n${ok.length}/${results.length} usable, ${stale.length} stale (>400 days old)`);
  if (stale.length) console.log("stale:", stale.map((s) => s.slug).join(", "));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.log("failed:", failed.map((f) => f.slug).join(", "));
}

main().catch((e: unknown) => { console.error(e); process.exitCode = 1; });
