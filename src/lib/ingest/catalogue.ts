import type { PeriodType } from "./types";

/**
 * The baseline indicator catalogue.
 *
 * India first, plus the global factors that move India (§8). This is the seed
 * for the ~50-100 indicator target; Phase 1 establishes the pattern with a
 * smaller, verified set.
 *
 * **Every FRED series code here has been confirmed against the live API** by
 * `scripts/verify-fred.ts`. FRED discontinues series regularly, and a seeded
 * code that silently returns nothing is an indicator that looks configured but
 * never updates — the worst kind of failure, because nothing errors.
 */

export type CatalogueEntry = {
  slug: string;
  name: string;
  /** macro | trade | commodity | production | weather | market | consumer | policy */
  category: string;
  /** ISO2, or null for global series. */
  country: string | null;
  unit: string;
  adapter: "fred" | "open_meteo";
  sourceSeriesCode: string;
  periodType: PeriodType;
  seasonality: "none" | "monthly" | "quarterly";
  /** Which direction is bad for India — drives arrow colour, not a judgement. */
  higherIs: "good" | "bad" | "neutral";
  releaseLagDays: number | null;
  adapterConfig?: Record<string, unknown>;
  detectionConfig?: Record<string, unknown>;
  /**
   * Seeded but not ingested. Used for a known gap we want visible in the
   * registry rather than silently absent — see india-cpi.
   */
  isActive?: boolean;
  /** Why an entry is inactive, or anything a future reader needs to know. */
  note?: string;
};

/** Global commodity and rate series — the "global factors affecting India" half of §8. */
const GLOBAL: CatalogueEntry[] = [
  {
    slug: "brent-crude-daily",
    name: "Brent crude oil",
    category: "commodity",
    country: null,
    unit: "USD/bbl",
    adapter: "fred",
    sourceSeriesCode: "DCOILBRENTEU",
    periodType: "day",
    seasonality: "none",
    // India imports the large majority of its crude, so higher is bad here.
    higherIs: "bad",
    releaseLagDays: 4,
  },
  {
    slug: "wti-crude-daily",
    name: "WTI crude oil",
    category: "commodity",
    country: null,
    unit: "USD/bbl",
    adapter: "fred",
    sourceSeriesCode: "DCOILWTICO",
    periodType: "day",
    seasonality: "none",
    higherIs: "bad",
    releaseLagDays: 4,
  },
  {
    slug: "global-copper-price",
    name: "Copper price",
    category: "commodity",
    country: null,
    unit: "USD/mt",
    adapter: "fred",
    sourceSeriesCode: "PCOPPUSDM",
    periodType: "month",
    seasonality: "none",
    higherIs: "neutral",
    releaseLagDays: 20,
  },
  {
    slug: "global-wheat-price",
    name: "Wheat price",
    category: "commodity",
    country: null,
    unit: "USD/mt",
    adapter: "fred",
    sourceSeriesCode: "PWHEAMTUSDM",
    periodType: "month",
    seasonality: "none",
    higherIs: "bad",
    releaseLagDays: 20,
  },
  {
    slug: "us-10y-treasury",
    name: "US 10-year Treasury yield",
    category: "market",
    country: "US",
    unit: "percent",
    adapter: "fred",
    sourceSeriesCode: "DGS10",
    periodType: "day",
    seasonality: "none",
    // Rising US yields tend to pull capital out of Indian markets.
    higherIs: "bad",
    releaseLagDays: 1,
  },
  {
    slug: "us-2y-treasury",
    name: "US 2-year Treasury yield",
    category: "market",
    country: "US",
    unit: "percent",
    adapter: "fred",
    sourceSeriesCode: "DGS2",
    periodType: "day",
    seasonality: "none",
    higherIs: "neutral",
    releaseLagDays: 1,
  },
  {
    slug: "us-fed-funds-rate",
    name: "US federal funds rate",
    category: "policy",
    country: "US",
    unit: "percent",
    adapter: "fred",
    sourceSeriesCode: "FEDFUNDS",
    periodType: "month",
    seasonality: "none",
    higherIs: "bad",
    releaseLagDays: 5,
  },
  {
    slug: "us-cpi",
    name: "US CPI (all items)",
    category: "macro",
    country: "US",
    unit: "index",
    adapter: "fred",
    sourceSeriesCode: "CPIAUCSL",
    periodType: "month",
    seasonality: "monthly",
    higherIs: "bad",
    releaseLagDays: 12,
  },
  {
    slug: "us-unemployment",
    name: "US unemployment rate",
    category: "macro",
    country: "US",
    unit: "percent",
    adapter: "fred",
    sourceSeriesCode: "UNRATE",
    periodType: "month",
    seasonality: "monthly",
    higherIs: "bad",
    releaseLagDays: 5,
  },
  {
    slug: "usd-broad-index",
    name: "US dollar index (broad)",
    category: "market",
    country: null,
    unit: "index",
    adapter: "fred",
    sourceSeriesCode: "DTWEXBGS",
    periodType: "day",
    seasonality: "none",
    higherIs: "bad",
    releaseLagDays: 4,
  },
  {
    slug: "vix",
    name: "CBOE volatility index",
    category: "market",
    country: "US",
    unit: "index",
    adapter: "fred",
    sourceSeriesCode: "VIXCLS",
    periodType: "day",
    seasonality: "none",
    higherIs: "bad",
    releaseLagDays: 1,
  },
];

/** India-specific series available through FRED. */
const INDIA: CatalogueEntry[] = [
  {
    slug: "india-usd-inr",
    name: "USD/INR exchange rate",
    category: "market",
    country: "IN",
    unit: "INR/USD",
    adapter: "fred",
    sourceSeriesCode: "DEXINUS",
    periodType: "day",
    seasonality: "none",
    // A weaker rupee raises the cost of India's imports.
    higherIs: "bad",
    releaseLagDays: 4,
  },
  {
    // SEEDED INACTIVE — see note. Kept in the registry so the gap is visible
    // rather than silently absent.
    slug: "india-cpi",
    name: "India CPI (all items)",
    category: "macro",
    country: "IN",
    unit: "index",
    adapter: "fred",
    sourceSeriesCode: "INDCPIALLMINMEI",
    periodType: "month",
    seasonality: "monthly",
    higherIs: "bad",
    releaseLagDays: 45,
    isActive: false,
    note:
      "FRED's India CPI stopped updating in March 2025 — every monthly variant " +
      "(INDCPIALLMINMEI, CPALTT01INM659N) ends there, because the OECD feed behind " +
      "them stopped. This is the single most important indicator in the product and " +
      "FRED cannot supply it. Needs MOSPI directly or a vendor. See docs/03-data-sources.md.",
  },
  {
    slug: "india-10y-bond-yield",
    name: "India 10-year government bond yield",
    category: "market",
    country: "IN",
    unit: "percent",
    adapter: "fred",
    sourceSeriesCode: "INDIRLTLT01STM",
    periodType: "month",
    seasonality: "none",
    higherIs: "bad",
    releaseLagDays: 60,
  },
  {
    slug: "india-call-money-rate",
    name: "India call money / interbank rate",
    category: "policy",
    country: "IN",
    unit: "percent",
    adapter: "fred",
    sourceSeriesCode: "IRSTCI01INM156N",
    periodType: "month",
    seasonality: "none",
    // The closest live proxy on FRED for the RBI policy stance.
    higherIs: "bad",
    releaseLagDays: 60,
  },
  {
    slug: "india-3m-interbank-rate",
    name: "India 3-month interbank rate",
    category: "market",
    country: "IN",
    unit: "percent",
    adapter: "fred",
    sourceSeriesCode: "INDIR3TIB01STM",
    periodType: "month",
    seasonality: "none",
    higherIs: "bad",
    releaseLagDays: 60,
  },
  {
    slug: "india-reer",
    name: "India real effective exchange rate",
    category: "market",
    country: "IN",
    unit: "index",
    adapter: "fred",
    sourceSeriesCode: "RBINBIS",
    periodType: "month",
    seasonality: "none",
    higherIs: "neutral",
    releaseLagDays: 45,
  },
  {
    slug: "india-real-gdp",
    name: "India real GDP",
    category: "macro",
    country: "IN",
    unit: "index",
    adapter: "fred",
    sourceSeriesCode: "INDGDPRQPSMEI",
    periodType: "quarter",
    seasonality: "quarterly",
    higherIs: "good",
    releaseLagDays: 90,
  },
  {
    slug: "india-industrial-production",
    name: "India industrial production (YoY)",
    category: "production",
    country: "IN",
    unit: "percent",
    adapter: "fred",
    sourceSeriesCode: "INDPRINTO01GYSAM",
    periodType: "month",
    seasonality: "monthly",
    higherIs: "good",
    releaseLagDays: 90,
  },
];

/**
 * Rainfall for the three metros, from Open-Meteo's ERA5 archive.
 *
 * A placeholder for what actually matters — district-level rainfall departure
 * from the long-period average — which needs a climatology we compute ourselves
 * because IMD publishes no usable API for its normals. Point readings are the
 * first step towards that, not the destination.
 */
const WEATHER: CatalogueEntry[] = [
  {
    slug: "india-rainfall-mumbai",
    name: "Mumbai daily rainfall",
    category: "weather",
    country: "IN",
    unit: "mm",
    adapter: "open_meteo",
    sourceSeriesCode: "mumbai_precipitation",
    periodType: "day",
    seasonality: "none",
    higherIs: "neutral",
    releaseLagDays: 6,
    adapterConfig: { latitude: 19.076, longitude: 72.8777, daily: "precipitation_sum" },
  },
  {
    slug: "india-rainfall-delhi",
    name: "Delhi daily rainfall",
    category: "weather",
    country: "IN",
    unit: "mm",
    adapter: "open_meteo",
    sourceSeriesCode: "delhi_precipitation",
    periodType: "day",
    seasonality: "none",
    higherIs: "neutral",
    releaseLagDays: 6,
    adapterConfig: { latitude: 28.6139, longitude: 77.209, daily: "precipitation_sum" },
  },
  {
    slug: "india-rainfall-chennai",
    name: "Chennai daily rainfall",
    category: "weather",
    country: "IN",
    unit: "mm",
    adapter: "open_meteo",
    sourceSeriesCode: "chennai_precipitation",
    periodType: "day",
    seasonality: "none",
    higherIs: "neutral",
    releaseLagDays: 6,
    adapterConfig: { latitude: 13.0827, longitude: 80.2707, daily: "precipitation_sum" },
  },
];

export const CATALOGUE: readonly CatalogueEntry[] = [...INDIA, ...GLOBAL, ...WEATHER];

export function catalogueFor(adapter: "fred" | "open_meteo"): CatalogueEntry[] {
  return CATALOGUE.filter((entry) => entry.adapter === adapter);
}
