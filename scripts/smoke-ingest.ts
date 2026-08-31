/**
 * Manual smoke test: runs the real ingestion spine against the live
 * Open-Meteo API. Not part of `npm test` — it makes a network call.
 *
 *   npx tsx scripts/smoke-ingest.ts
 */
import { openMeteoAdapter } from "../src/lib/ingest/adapters/open-meteo";
import { normalize, toSeries } from "../src/lib/ingest/normalize";
import { forecastIndicator } from "../src/lib/engine/forecast";
import { describeExpectation, measureSurprise } from "../src/lib/engine/forecast/surprise";
import type { SeriesSpec } from "../src/lib/ingest/types";

const spec: SeriesSpec = {
  indicatorKey: "in.rainfall.mumbai.daily",
  sourceSeriesCode: "mumbai_precip",
  periodType: "day",
  unit: "mm",
  config: { latitude: 19.076, longitude: 72.8777, daily: "precipitation_sum" },
};

async function main() {
  const deps = { fetch: globalThis.fetch, now: () => new Date() };

  const payload = await openMeteoAdapter.fetch(spec, { from: "2022-01-01", to: "2024-12-31" }, deps);
  console.log("HTTP", payload.httpStatus, "| bytes", payload.body.length, "| hash", payload.contentHash.slice(0, 12));

  const { observations, warnings } = openMeteoAdapter.parse(payload, spec);
  console.log("parsed:", observations.length, "| warnings:", warnings.length);
  console.log("first:", JSON.stringify(observations[0]));
  console.log("last: ", JSON.stringify(observations.at(-1)));

  const norm = normalize(observations, spec, {
    sourceId: "open_meteo",
    ingestRunId: "smoke",
    contentHash: payload.contentHash,
    observedAt: new Date(),
  });
  console.log("normalized:", norm.observations.length, "| rejected:", norm.rejected.length);
  if (norm.rejected[0]) console.log("  reason:", norm.rejected[0].reason);

  const series = toSeries(norm.observations);
  const forecast = forecastIndicator({
    periodEnds: series.periodEnds,
    values: series.values,
    periodType: "day",
  });

  console.log("\n--- forecast ---");
  console.log("trusted:", forecast.isTrusted, "| method:", forecast.method);
  console.log("reason:", forecast.reason);
  console.log("expected:", forecast.expected, "| mae:", forecast.mae, "| for:", forecast.forPeriodEnd);
  for (const e of forecast.evaluations) {
    console.log(
      `  ${e.method.padEnd(21)} n=${String(e.n).padStart(4)} mae=${e.mae?.toFixed(3) ?? "-"} naive=${e.naiveMae?.toFixed(3) ?? "-"} skill=${e.relativeSkill?.toFixed(3) ?? "-"} trusted=${e.isTrusted} ${e.untrustedReason ?? ""}`,
    );
  }

  console.log("\nlabel:", describeExpectation("model"));
  if (forecast.expected !== null) {
    const s = measureSurprise(forecast.expected + 25, forecast.expected, forecast.mae);
    console.log("surprise on a +25mm miss:", s ? `${s.score.toFixed(2)}x MAE -> ${s.significance}` : "null (no usable MAE)");
  }
}

main().catch((error: unknown) => {
  console.error("FAILED:", error);
  process.exitCode = 1;
});
