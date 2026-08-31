import { describe, expect, it } from "vitest";
import {
  describeExpectation,
  measureSurprise,
  MODEL_BASIS_CONFIDENCE_CAP,
  surpriseConfidence,
} from "./surprise";

describe("measureSurprise", () => {
  it("normalises by the model's own error, not raw units", () => {
    // The same 0.4pp miss means very different things depending on how wrong
    // the model usually is. This is the whole point of D1's surprise rule.
    const noisyModel = measureSurprise(5.4, 5.0, 0.4);
    const preciseModel = measureSurprise(5.4, 5.0, 0.05);

    expect(noisyModel!.delta).toBeCloseTo(0.4, 10);
    expect(preciseModel!.delta).toBeCloseTo(0.4, 10);

    expect(noisyModel!.score).toBeCloseTo(1, 10);
    expect(preciseModel!.score).toBeCloseTo(8, 10);

    // Identical raw miss, opposite verdicts.
    expect(noisyModel!.significance).toBe("none");
    expect(preciseModel!.significance).toBe("major");
  });

  it("bands by MAE multiples", () => {
    expect(measureSurprise(11.4, 10, 1)!.significance).toBe("none");
    expect(measureSurprise(11.6, 10, 1)!.significance).toBe("notable");
    expect(measureSurprise(12.6, 10, 1)!.significance).toBe("significant");
    expect(measureSurprise(14.5, 10, 1)!.significance).toBe("major");
  });

  it("records direction", () => {
    expect(measureSurprise(11, 10, 1)!.direction).toBe(1);
    expect(measureSurprise(9, 10, 1)!.direction).toBe(-1);
    expect(measureSurprise(10, 10, 1)!.direction).toBe(0);
  });

  it("refuses to produce a surprise without a measured model error", () => {
    // No MAE means no way to know whether this miss is unusual. Guessing here
    // is exactly how a naive baseline manufactures twelve surprises a year.
    expect(measureSurprise(5.4, 5.0, null)).toBeNull();
    expect(measureSurprise(5.4, 5.0, 0)).toBeNull();
    expect(measureSurprise(5.4, 5.0, -1)).toBeNull();
  });

  it("rejects non-finite inputs", () => {
    expect(measureSurprise(Number.NaN, 5, 1)).toBeNull();
    expect(measureSurprise(5, Number.POSITIVE_INFINITY, 1)).toBeNull();
  });
});

describe("surpriseConfidence", () => {
  it("discounts model-based surprises below consensus-based ones", () => {
    // D1 accepted this trade explicitly; this is where the discount is applied
    // rather than merely described in a document.
    const surprise = measureSurprise(14, 10, 1)!;

    const model = surpriseConfidence(surprise, "model");
    const consensus = surpriseConfidence(surprise, "consensus");

    expect(model).toBeLessThan(consensus);
    expect(model).toBeCloseTo(consensus * MODEL_BASIS_CONFIDENCE_CAP, 10);
  });

  it("saturates rather than growing without bound", () => {
    const huge = measureSurprise(1000, 10, 1)!;
    expect(surpriseConfidence(huge, "consensus")).toBe(1);
    expect(surpriseConfidence(huge, "model")).toBe(MODEL_BASIS_CONFIDENCE_CAP);
  });
});

describe("describeExpectation", () => {
  it("never returns a bare \"Expected\"", () => {
    // D1: the word alone reads as analyst consensus, which this is not.
    expect(describeExpectation("model")).toBe("SignalX estimate");
    expect(describeExpectation("model")).not.toMatch(/^Expected$/i);
    expect(describeExpectation("consensus")).toBe("Analyst consensus");
  });
});
