/**
 * Pilot draft batch, so the review queue has real content to work through.
 *
 *   npm run graph:pilot
 *
 * These proposals were drafted by Claude Opus 5 in a Claude Code session rather
 * than through the API job in `draft-graph.ts` — the batch records that
 * honestly. It is the same step of the same process (an LLM proposing offline,
 * a human disposing), and it goes through the identical writer, so the rows are
 * indistinguishable downstream.
 *
 * They are deliberately mixed in quality. Several are marginal or arguably
 * wrong, because a review queue that only contains good proposals tests the
 * approve key and nothing else — and the reject path is where the drafting
 * prompt actually gets fixed.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  draftResponseSchema,
  DRAFTING_SYSTEM_PROMPT,
  hashPrompt,
  writeDraftBatch,
} from "../src/lib/graph/drafting";

config({ path: ".env.local", quiet: true });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const CRUDE = "brent-crude-daily";
const INR = "india-usd-inr";
const RATE = "india-10y-bond-yield";

const proposals = {
  edges: [
    // --- Crude oil: the PRD's own worked example (§2). -------------------
    { fromType: "indicator", fromSlug: CRUDE, toType: "sector", toSlug: "aviation", polarity: -1, strength: 0.72, lagDays: 14, confidence: 0.86,
      mechanism: "Aviation turbine fuel is priced off crude and is the single largest line in an Indian airline's cost base, so a crude rise compresses margins within weeks.",
      evidenceNote: "ATF is commonly around a third of Indian carriers' operating cost." },
    { fromType: "indicator", fromSlug: CRUDE, toType: "sector", toSlug: "paints", polarity: -1, strength: 0.55, lagDays: 60, confidence: 0.78,
      mechanism: "Paint formulations depend on crude derivatives such as titanium dioxide carriers, resins and solvents, so input costs follow crude with a supply-contract lag." },
    { fromType: "indicator", fromSlug: CRUDE, toType: "sector", toSlug: "oil-gas-upstream", polarity: 1, strength: 0.8, lagDays: 1, confidence: 0.9,
      mechanism: "Upstream producers sell crude at prevailing prices, so realisations move almost mechanically with the benchmark." },
    { fromType: "indicator", fromSlug: CRUDE, toType: "sector", toSlug: "auto-components", polarity: -1, strength: 0.4, lagDays: 45, confidence: 0.66,
      mechanism: "Synthetic rubber and carbon black are crude derivatives and are the dominant raw materials in tyre manufacturing." },
    { fromType: "indicator", fromSlug: CRUDE, toType: "sector", toSlug: "logistics", polarity: -1, strength: 0.45, lagDays: 21, confidence: 0.72,
      mechanism: "Diesel is the main variable cost in road freight, and operators can only pass it on with a lag where contracts are fixed." },
    { fromType: "indicator", fromSlug: CRUDE, toType: "indicator", toSlug: INR, polarity: 1, strength: 0.35, lagDays: 30, confidence: 0.6,
      mechanism: "India imports most of its crude, so a sustained price rise widens the trade deficit and adds pressure on the rupee." },
    // Marginal on purpose: plausible channel, weak and heavily mediated.
    { fromType: "indicator", fromSlug: CRUDE, toType: "sector", toSlug: "fmcg", polarity: -1, strength: 0.25, lagDays: 90, confidence: 0.45,
      mechanism: "Packaging and distribution costs are crude-linked, though they are a small share of FMCG cost and are usually passed through." },
    // Wrong on purpose: this is correlation dressed as causation.
    { fromType: "indicator", fromSlug: CRUDE, toType: "sector", toSlug: "it-services", polarity: -1, strength: 0.3, lagDays: 30, confidence: 0.4,
      mechanism: "Higher crude tends to coincide with risk-off sentiment which can weigh on IT services demand." },

    // --- USD/INR ---------------------------------------------------------
    { fromType: "indicator", fromSlug: INR, toType: "sector", toSlug: "it-services", polarity: 1, strength: 0.6, lagDays: 30, confidence: 0.85,
      mechanism: "Indian IT services bill largely in dollars while costs are in rupees, so a weaker rupee lifts reported revenue and margin." },
    { fromType: "indicator", fromSlug: INR, toType: "sector", toSlug: "pharma", polarity: 1, strength: 0.45, lagDays: 45, confidence: 0.74,
      mechanism: "Formulation exporters earn a large share of revenue abroad, so rupee depreciation raises rupee realisations." },
    { fromType: "indicator", fromSlug: INR, toType: "sector", toSlug: "aviation", polarity: -1, strength: 0.5, lagDays: 30, confidence: 0.8,
      mechanism: "Fuel is dollar-denominated and aircraft leases are usually dollar contracts, so a weaker rupee raises both for a rupee-earning airline." },
    { fromType: "indicator", fromSlug: INR, toType: "sector", toSlug: "oil-gas-refining", polarity: -1, strength: 0.4, lagDays: 21, confidence: 0.68,
      mechanism: "Refiners buy dollar-priced crude, so a weaker rupee raises input cost faster than administered retail prices adjust." },

    // --- Rates -----------------------------------------------------------
    { fromType: "indicator", fromSlug: RATE, toType: "sector", toSlug: "realty", polarity: -1, strength: 0.6, lagDays: 120, confidence: 0.8,
      mechanism: "Home-loan rates track benchmark yields, and higher EMIs reduce affordability and slow residential absorption." },
    { fromType: "indicator", fromSlug: RATE, toType: "sector", toSlug: "nbfc", polarity: -1, strength: 0.65, lagDays: 90, confidence: 0.82,
      mechanism: "NBFCs fund themselves in wholesale markets, so higher yields raise their cost of funds faster than they can reprice loan books." },
    { fromType: "indicator", fromSlug: RATE, toType: "sector", toSlug: "automobiles", polarity: -1, strength: 0.4, lagDays: 120, confidence: 0.7,
      mechanism: "Most Indian vehicle purchases are financed, so higher rates raise monthly instalments and defer discretionary purchases." },
    { fromType: "indicator", fromSlug: RATE, toType: "sector", toSlug: "banks", polarity: 1, strength: 0.3, lagDays: 90, confidence: 0.55,
      mechanism: "Banks with floating-rate assets repricing faster than deposits see margins widen when yields rise, though the effect reverses as deposits catch up." },

    // --- Rainfall --------------------------------------------------------
    { fromType: "indicator", fromSlug: "india-rainfall-mumbai", toType: "sector", toSlug: "agriculture", polarity: 1, strength: 0.3, lagDays: 90, confidence: 0.4,
      mechanism: "Rainfall drives sowing and yields, though a single-city gauge is a weak proxy for the national monsoon that actually matters." },
    // Wrong on purpose: a city gauge says nothing about a national sector.
    { fromType: "indicator", fromSlug: "india-rainfall-delhi", toType: "sector", toSlug: "fmcg", polarity: 1, strength: 0.35, lagDays: 120, confidence: 0.45,
      mechanism: "A good monsoon lifts rural incomes and therefore FMCG volumes." },

    // --- Copper and wheat ------------------------------------------------
    { fromType: "indicator", fromSlug: "global-copper-price", toType: "sector", toSlug: "metals-nonferrous", polarity: 1, strength: 0.75, lagDays: 1, confidence: 0.88,
      mechanism: "Domestic non-ferrous producers realise prices benchmarked to global exchanges, so realisations track the international price directly." },
    { fromType: "indicator", fromSlug: "global-wheat-price", toType: "sector", toSlug: "fmcg", polarity: -1, strength: 0.35, lagDays: 90, confidence: 0.6,
      mechanism: "Wheat is the primary input for biscuit and packaged-flour makers, so global prices feed procurement cost where imports set the margin." },
    { fromType: "indicator", fromSlug: "us-10y-treasury", toType: "indicator", toSlug: INR, polarity: 1, strength: 0.45, lagDays: 14, confidence: 0.7,
      mechanism: "Higher US yields narrow the carry advantage of holding Indian assets, prompting portfolio outflows that weaken the rupee." },
  ],

  exposures: [
    { companySlug: "interglobe-aviation", driverType: "indicator", driverSlug: CRUDE, direction: -1, magnitude: "high", confidence: 0.88,
      rationale: "Aviation turbine fuel is the largest single line in the cost base, and fares adjust more slowly than fuel prices move.",
      sourceNote: "Annual report cost breakdown" },
    { companySlug: "spicejet", driverType: "indicator", driverSlug: CRUDE, direction: -1, magnitude: "high", confidence: 0.85,
      rationale: "Same fuel-cost exposure as any Indian carrier, with less balance-sheet room to absorb a spike." },
    { companySlug: "asian-paints", driverType: "indicator", driverSlug: CRUDE, direction: -1, magnitude: "high", confidence: 0.8,
      rationale: "Crude-derivative monomers, resins and solvents make up a large share of raw material cost." },
    { companySlug: "berger-paints", driverType: "indicator", driverSlug: CRUDE, direction: -1, magnitude: "high", confidence: 0.78,
      rationale: "Same crude-derivative input base as the wider decorative paints category." },
    { companySlug: "mrf", driverType: "indicator", driverSlug: CRUDE, direction: -1, magnitude: "medium", confidence: 0.72,
      rationale: "Synthetic rubber and carbon black are crude derivatives and a major share of tyre raw material cost." },
    { companySlug: "apollo-tyres", driverType: "indicator", driverSlug: CRUDE, direction: -1, magnitude: "medium", confidence: 0.72,
      rationale: "Crude-derivative inputs dominate the raw material basket alongside natural rubber." },
    { companySlug: "ongc", driverType: "indicator", driverSlug: CRUDE, direction: 1, magnitude: "high", confidence: 0.9,
      rationale: "Upstream crude realisations move with the benchmark, subject to any government windfall levy." },
    { companySlug: "oil-india", driverType: "indicator", driverSlug: CRUDE, direction: 1, magnitude: "high", confidence: 0.88,
      rationale: "Upstream producer whose realisations track international crude prices." },
    { companySlug: "reliance-industries", driverType: "indicator", driverSlug: CRUDE, direction: 1, magnitude: "medium", confidence: 0.55,
      rationale: "Refining margins can widen with crude volatility while petrochemical inputs get more expensive, so net exposure is genuinely two-sided and depends on the crack spread." },
    { companySlug: "indian-oil", driverType: "indicator", driverSlug: CRUDE, direction: -1, magnitude: "medium", confidence: 0.6,
      rationale: "A state marketer absorbs part of a crude rise when retail prices are held, so higher crude compresses marketing margins." },

    { companySlug: "tcs", driverType: "indicator", driverSlug: INR, direction: 1, magnitude: "high", confidence: 0.85,
      rationale: "The large majority of revenue is billed in dollars against a rupee cost base, so depreciation lifts reported margin." },
    { companySlug: "infosys", driverType: "indicator", driverSlug: INR, direction: 1, magnitude: "high", confidence: 0.85,
      rationale: "Dollar-denominated revenue against rupee costs gives a direct translation benefit when the rupee weakens." },
    { companySlug: "wipro", driverType: "indicator", driverSlug: INR, direction: 1, magnitude: "high", confidence: 0.82,
      rationale: "Export-led services revenue in dollars against a predominantly rupee cost base." },
    { companySlug: "sun-pharmaceutical", driverType: "indicator", driverSlug: INR, direction: 1, magnitude: "medium", confidence: 0.7,
      rationale: "A large US generics business means a meaningful share of revenue is dollar-denominated." },
    { companySlug: "divis-laboratories", driverType: "indicator", driverSlug: INR, direction: 1, magnitude: "high", confidence: 0.76,
      rationale: "Almost entirely export-led API and custom synthesis revenue, invoiced in foreign currency." },

    { companySlug: "bajaj-finance", driverType: "indicator", driverSlug: RATE, direction: -1, magnitude: "high", confidence: 0.8,
      rationale: "Wholesale-funded lender whose cost of funds reprices faster than its consumer loan book." },
    { companySlug: "shriram-finance", driverType: "indicator", driverSlug: RATE, direction: -1, magnitude: "high", confidence: 0.78,
      rationale: "Borrowing costs track benchmark yields while vehicle loan yields are slower to reprice." },
    { companySlug: "dlf", driverType: "indicator", driverSlug: RATE, direction: -1, magnitude: "medium", confidence: 0.7,
      rationale: "Residential demand is mortgage-financed, so higher rates reduce affordability and slow absorption." },
    { companySlug: "maruti-suzuki", driverType: "indicator", driverSlug: RATE, direction: -1, magnitude: "medium", confidence: 0.65,
      rationale: "Most passenger vehicle purchases are financed, so higher instalments defer discretionary demand." },

    { companySlug: "hindalco", driverType: "indicator", driverSlug: "global-copper-price", direction: 1, magnitude: "high", confidence: 0.82,
      rationale: "Copper is a core product line and realisations are benchmarked to global exchange prices." },
    { companySlug: "hindustan-zinc", driverType: "indicator", driverSlug: "global-copper-price", direction: 1, magnitude: "low", confidence: 0.35,
      rationale: "Base-metal prices tend to move together, though zinc and lead are the actual products here rather than copper." },
    { companySlug: "britannia", driverType: "indicator", driverSlug: "global-wheat-price", direction: -1, magnitude: "high", confidence: 0.75,
      rationale: "Wheat flour is the primary raw material for the biscuit portfolio." },
    { companySlug: "balrampur-chini", driverType: "indicator", driverSlug: "india-rainfall-mumbai", direction: 1, magnitude: "low", confidence: 0.3,
      rationale: "Cane yields depend on rainfall, but a Mumbai gauge is a poor proxy for the UP cane belt where the mills actually are." },
    { companySlug: "ntpc", driverType: "indicator", driverSlug: CRUDE, direction: -1, magnitude: "low", confidence: 0.25,
      rationale: "Generation is overwhelmingly coal-fired, so crude has little direct bearing on the cost base." },
  ],
};

async function main() {
  const parsed = draftResponseSchema.safeParse(proposals);
  if (!parsed.success) {
    console.error("Pilot proposals failed their own schema:");
    for (const issue of parsed.error.issues.slice(0, 10)) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const result = await writeDraftBatch(db, {
    scopeNote: "Pilot — crude, rupee, rates, commodities",
    provider: "anthropic",
    model: "claude-opus-5 (drafted in-session, not via API)",
    promptHash: hashPrompt(DRAFTING_SYSTEM_PROMPT, "pilot-batch-v1"),
    edges: parsed.data.edges,
    exposures: parsed.data.exposures,
  });

  console.log(`batch ${result.batchId}`);
  console.log(`  ${result.edgesWritten} edges, ${result.exposuresWritten} exposures queued`);
  if (result.skipped.length > 0) {
    console.log(`  ${result.skipped.length} dropped:`);
    for (const s of result.skipped) console.log(`    ${s.item} — ${s.reason}`);
  }
  console.log(`\nReview at /admin/graph/${result.batchId}`);
}

main().catch((e: unknown) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
