import { describe, expect, it } from "vitest";
import {
  confidenceBand,
  describeEdge,
  describeExposure,
  describeLag,
  magnitudeBand,
  strengthBand,
} from "./format";

describe("describeEdge", () => {
  it("always frames the relationship as conditional, never as a forecast", () => {
    // Reviewers read "-1" as "this is going down". The card says "When X
    // rises…" precisely so the driver's own direction is never implied.
    const down = describeEdge("Brent crude oil", "Aviation", -1);
    expect(`${down.verb} ${down.target} ${down.qualifier}`).toBe("pushes Aviation DOWN");
    expect(down.direction).toBe("down");

    const up = describeEdge("USD/INR exchange rate", "IT Services", 1);
    expect(`${up.verb} ${up.target} ${up.qualifier}`).toBe("pushes IT Services UP");
    expect(up.direction).toBe("up");
  });
});

describe("describeExposure", () => {
  it("describes exposure without evaluating the company (D3)", () => {
    const against = describeExposure("Brent crude oil", "Apollo Tyres", -1);
    expect(`${against.verb} ${against.target}`).toBe("works against Apollo Tyres");
    // Nothing about share prices, earnings or investment merit.
    expect(against.verb).not.toMatch(/buy|sell|fall|rise|stock|price|earnings/i);

    expect(describeExposure("USD/INR", "TCS", 1).verb).toBe("works in favour of");
  });
});

describe("describeLag", () => {
  it("reads as a human would say it", () => {
    expect(describeLag(0)).toBe("immediately");
    expect(describeLag(1)).toBe("next day");
    expect(describeLag(4)).toBe("about 4 days");
    expect(describeLag(14)).toBe("about 2 weeks");
    expect(describeLag(30)).toBe("about a month");
    expect(describeLag(90)).toBe("about 3 months");
    expect(describeLag(120)).toBe("about 4 months");
    expect(describeLag(730)).toBe("about 2 years");
  });

  it("treats negative lag as immediate rather than emitting nonsense", () => {
    expect(describeLag(-5)).toBe("immediately");
  });
});

describe("strengthBand", () => {
  it("labels the range a reviewer actually works in", () => {
    // Most real edges land 0.2-0.5, so those bands carry the useful detail.
    expect(strengthBand(0.1).label).toBe("Minimal");
    expect(strengthBand(0.25).label).toBe("Modest");
    expect(strengthBand(0.45).label).toBe("Moderate");
    expect(strengthBand(0.72).label).toBe("Strong");
    expect(strengthBand(0.9).label).toBe("Dominant");
  });

  it("clamps out-of-range values instead of overflowing the meter", () => {
    expect(strengthBand(2).fraction).toBe(1);
    expect(strengthBand(-1).fraction).toBe(0);
    expect(strengthBand(Number.NaN).fraction).toBe(0);
  });
});

describe("confidenceBand", () => {
  it("separates 'how sure' from 'how big'", () => {
    expect(confidenceBand(0.2).label).toBe("Speculative");
    expect(confidenceBand(0.45).label).toBe("Unsure");
    expect(confidenceBand(0.7).label).toBe("Fairly sure");
    expect(confidenceBand(0.86).label).toBe("Very sure");
  });

  it("is independent of strength — a link can be big but uncertain", () => {
    expect(strengthBand(0.8).label).toBe("Dominant");
    expect(confidenceBand(0.3).label).toBe("Speculative");
  });
});

describe("magnitudeBand", () => {
  it("maps the three stored values", () => {
    expect(magnitudeBand("high").label).toBe("High");
    expect(magnitudeBand("medium").label).toBe("Medium");
    expect(magnitudeBand("low").label).toBe("Low");
    expect(magnitudeBand("nonsense").label).toBe("Low");
  });
});
