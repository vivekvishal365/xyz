/**
 * Sector and company seed.
 *
 * Edges need endpoints. This is a starter set sized for reviewing the graph
 * mechanism end to end, not the full ~150-company target from D4 — coverage
 * grows once the drafting-and-review loop is proven.
 *
 * Companies are chosen for *driver diversity* rather than market cap: each one
 * should have an obvious, checkable exposure to something the pipeline already
 * ingests (crude, USD/INR, rates, copper, wheat, rainfall). A company whose
 * drivers we cannot observe produces edges nobody can verify.
 */

export type SectorSeed = {
  slug: string;
  name: string;
  parent?: string;
  description: string;
};

export type CompanySeed = {
  slug: string;
  name: string;
  sector: string;
  description: string;
};

export const SECTORS: readonly SectorSeed[] = [
  { slug: "energy", name: "Energy", description: "Oil, gas, refining and marketing." },
  { slug: "oil-gas-refining", name: "Oil & Gas Refining", parent: "energy", description: "Crude refiners and fuel marketers." },
  { slug: "oil-gas-upstream", name: "Oil & Gas Upstream", parent: "energy", description: "Crude and gas producers." },
  { slug: "materials", name: "Materials", description: "Metals, cement, chemicals." },
  { slug: "steel", name: "Steel", parent: "materials", description: "Integrated and secondary steel producers." },
  { slug: "cement", name: "Cement", parent: "materials", description: "Cement manufacturers; coal and power intensive." },
  { slug: "metals-nonferrous", name: "Non-ferrous Metals", parent: "materials", description: "Aluminium, copper, zinc." },
  { slug: "chemicals", name: "Chemicals", parent: "materials", description: "Commodity and speciality chemicals." },
  { slug: "paints", name: "Paints", parent: "materials", description: "Decorative and industrial coatings; crude-derivative inputs." },
  { slug: "industrials", name: "Industrials", description: "Capital goods, construction, transport." },
  { slug: "aviation", name: "Aviation", parent: "industrials", description: "Passenger airlines; fuel is the dominant cost." },
  { slug: "logistics", name: "Logistics", parent: "industrials", description: "Freight, shipping, ports, road transport." },
  { slug: "consumer", name: "Consumer", description: "Staples and discretionary." },
  { slug: "fmcg", name: "FMCG", parent: "consumer", description: "Packaged foods and household goods." },
  { slug: "automobiles", name: "Automobiles", parent: "consumer", description: "Passenger and commercial vehicles, two-wheelers." },
  { slug: "auto-components", name: "Auto Components", parent: "consumer", description: "Tyres and parts suppliers." },
  { slug: "financials", name: "Financials", description: "Banks, NBFCs, insurance." },
  { slug: "banks", name: "Banks", parent: "financials", description: "Scheduled commercial banks." },
  { slug: "nbfc", name: "NBFCs", parent: "financials", description: "Non-bank lenders; wholesale funding sensitive." },
  { slug: "technology", name: "Technology", description: "IT services and software." },
  { slug: "it-services", name: "IT Services", parent: "technology", description: "Export-led services; revenue largely USD." },
  { slug: "pharma", name: "Pharmaceuticals", description: "Formulations and APIs; large export share." },
  { slug: "utilities", name: "Utilities", description: "Power generation, transmission, distribution." },
  { slug: "agriculture", name: "Agriculture & Agri-inputs", description: "Fertiliser, agrochemicals, sugar; monsoon sensitive." },
  { slug: "realty", name: "Real Estate", description: "Residential and commercial developers; rate sensitive." },
];

export const COMPANIES: readonly CompanySeed[] = [
  // Energy — crude both ways: refiners gain on cracks, marketers absorb.
  { slug: "reliance-industries", name: "Reliance Industries", sector: "oil-gas-refining", description: "Refining and petrochemicals, telecom and retail." },
  { slug: "indian-oil", name: "Indian Oil Corporation", sector: "oil-gas-refining", description: "State refiner and fuel marketer." },
  { slug: "bharat-petroleum", name: "Bharat Petroleum", sector: "oil-gas-refining", description: "State refiner and fuel marketer." },
  { slug: "hindustan-petroleum", name: "Hindustan Petroleum", sector: "oil-gas-refining", description: "State refiner and fuel marketer." },
  { slug: "ongc", name: "Oil & Natural Gas Corporation", sector: "oil-gas-upstream", description: "State upstream crude and gas producer." },
  { slug: "oil-india", name: "Oil India", sector: "oil-gas-upstream", description: "Upstream crude and gas producer." },

  // Aviation — fuel and USD leases dominate the cost base.
  { slug: "interglobe-aviation", name: "InterGlobe Aviation (IndiGo)", sector: "aviation", description: "India's largest passenger airline." },
  { slug: "spicejet", name: "SpiceJet", sector: "aviation", description: "Low-cost passenger airline." },

  // Paints and chemicals — crude derivatives as inputs.
  { slug: "asian-paints", name: "Asian Paints", sector: "paints", description: "Decorative paints; crude-derivative inputs." },
  { slug: "berger-paints", name: "Berger Paints India", sector: "paints", description: "Decorative and industrial paints." },
  { slug: "pidilite", name: "Pidilite Industries", sector: "chemicals", description: "Adhesives and construction chemicals." },
  { slug: "srf", name: "SRF", sector: "chemicals", description: "Speciality chemicals, packaging films." },
  { slug: "upl", name: "UPL", sector: "chemicals", description: "Agrochemicals; global crop-protection exposure." },

  // Steel, metals, cement — commodity price and coal/power intensity.
  { slug: "tata-steel", name: "Tata Steel", sector: "steel", description: "Integrated steel producer." },
  { slug: "jsw-steel", name: "JSW Steel", sector: "steel", description: "Integrated steel producer." },
  { slug: "sail", name: "Steel Authority of India", sector: "steel", description: "State integrated steel producer." },
  { slug: "hindalco", name: "Hindalco Industries", sector: "metals-nonferrous", description: "Aluminium and copper; Novelis abroad." },
  { slug: "vedanta", name: "Vedanta", sector: "metals-nonferrous", description: "Diversified metals, oil and gas." },
  { slug: "hindustan-zinc", name: "Hindustan Zinc", sector: "metals-nonferrous", description: "Zinc, lead, silver." },
  { slug: "ultratech-cement", name: "UltraTech Cement", sector: "cement", description: "Largest Indian cement producer." },
  { slug: "ambuja-cements", name: "Ambuja Cements", sector: "cement", description: "Cement producer." },
  { slug: "shree-cement", name: "Shree Cement", sector: "cement", description: "Cement producer; high power intensity." },

  // Autos and components.
  { slug: "maruti-suzuki", name: "Maruti Suzuki India", sector: "automobiles", description: "Largest passenger-vehicle maker." },
  { slug: "tata-motors", name: "Tata Motors", sector: "automobiles", description: "Commercial and passenger vehicles; JLR abroad." },
  { slug: "mahindra-mahindra", name: "Mahindra & Mahindra", sector: "automobiles", description: "SUVs, tractors, farm equipment." },
  { slug: "bajaj-auto", name: "Bajaj Auto", sector: "automobiles", description: "Two- and three-wheelers; large export share." },
  { slug: "hero-motocorp", name: "Hero MotoCorp", sector: "automobiles", description: "Two-wheelers; rural demand sensitive." },
  { slug: "eicher-motors", name: "Eicher Motors", sector: "automobiles", description: "Royal Enfield motorcycles, commercial vehicles." },
  { slug: "mrf", name: "MRF", sector: "auto-components", description: "Tyres; natural and synthetic rubber inputs." },
  { slug: "apollo-tyres", name: "Apollo Tyres", sector: "auto-components", description: "Tyres; crude-derivative and rubber inputs." },
  { slug: "balkrishna-industries", name: "Balkrishna Industries", sector: "auto-components", description: "Off-highway tyres; export led." },

  // FMCG — rural demand, agri inputs, palm oil.
  { slug: "hindustan-unilever", name: "Hindustan Unilever", sector: "fmcg", description: "Packaged household and personal care." },
  { slug: "itc", name: "ITC", sector: "fmcg", description: "Cigarettes, packaged foods, paper, hotels." },
  { slug: "nestle-india", name: "Nestlé India", sector: "fmcg", description: "Packaged foods and beverages." },
  { slug: "britannia", name: "Britannia Industries", sector: "fmcg", description: "Biscuits and dairy; wheat and palm oil inputs." },
  { slug: "dabur", name: "Dabur India", sector: "fmcg", description: "Ayurvedic and consumer products; rural skew." },
  { slug: "marico", name: "Marico", sector: "fmcg", description: "Edible oils and personal care; copra and palm inputs." },

  // Financials — rate and credit sensitive.
  { slug: "hdfc-bank", name: "HDFC Bank", sector: "banks", description: "Largest private-sector bank." },
  { slug: "icici-bank", name: "ICICI Bank", sector: "banks", description: "Private-sector bank." },
  { slug: "state-bank-of-india", name: "State Bank of India", sector: "banks", description: "Largest public-sector bank." },
  { slug: "axis-bank", name: "Axis Bank", sector: "banks", description: "Private-sector bank." },
  { slug: "kotak-mahindra-bank", name: "Kotak Mahindra Bank", sector: "banks", description: "Private-sector bank." },
  { slug: "bajaj-finance", name: "Bajaj Finance", sector: "nbfc", description: "Consumer and SME lender; wholesale funded." },
  { slug: "shriram-finance", name: "Shriram Finance", sector: "nbfc", description: "Commercial-vehicle and SME lender." },

  // IT — USD revenue, so the rupee is a direct driver.
  { slug: "tcs", name: "Tata Consultancy Services", sector: "it-services", description: "IT services; revenue largely in USD." },
  { slug: "infosys", name: "Infosys", sector: "it-services", description: "IT services; revenue largely in USD." },
  { slug: "hcl-technologies", name: "HCL Technologies", sector: "it-services", description: "IT services and products." },
  { slug: "wipro", name: "Wipro", sector: "it-services", description: "IT services." },
  { slug: "tech-mahindra", name: "Tech Mahindra", sector: "it-services", description: "IT services; telecom vertical skew." },

  // Pharma — export led, USD sensitive.
  { slug: "sun-pharmaceutical", name: "Sun Pharmaceutical Industries", sector: "pharma", description: "Formulations; large US generics business." },
  { slug: "dr-reddys", name: "Dr. Reddy's Laboratories", sector: "pharma", description: "Generics; US and Europe exposure." },
  { slug: "cipla", name: "Cipla", sector: "pharma", description: "Formulations; India and US markets." },
  { slug: "divis-laboratories", name: "Divi's Laboratories", sector: "pharma", description: "API and custom synthesis; export led." },

  // Utilities, agri, realty, logistics.
  { slug: "ntpc", name: "NTPC", sector: "utilities", description: "Largest power generator; coal intensive." },
  { slug: "power-grid", name: "Power Grid Corporation", sector: "utilities", description: "Transmission utility; regulated returns." },
  { slug: "tata-power", name: "Tata Power", sector: "utilities", description: "Generation, transmission, renewables." },
  { slug: "coromandel-international", name: "Coromandel International", sector: "agriculture", description: "Fertiliser and crop protection; monsoon sensitive." },
  { slug: "chambal-fertilisers", name: "Chambal Fertilisers", sector: "agriculture", description: "Urea and complex fertilisers; gas input." },
  { slug: "balrampur-chini", name: "Balrampur Chini Mills", sector: "agriculture", description: "Sugar and ethanol; cane and rainfall sensitive." },
  { slug: "dlf", name: "DLF", sector: "realty", description: "Residential and commercial developer." },
  { slug: "godrej-properties", name: "Godrej Properties", sector: "realty", description: "Residential developer; rate sensitive." },
  { slug: "adani-ports", name: "Adani Ports & SEZ", sector: "logistics", description: "Port operator; trade-volume sensitive." },
  { slug: "container-corporation", name: "Container Corporation of India", sector: "logistics", description: "Rail container freight; trade sensitive." },
];
