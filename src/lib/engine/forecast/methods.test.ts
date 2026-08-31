import { describe, expect, it } from "vitest";
import { drift, forecastWith, minimumHistoryFor, naive, seasonalNaive, seasonalNaiveDrift } from "./methods";

describe("naive", () => {
  it("carries the last value forward", () => {
    expect(naive([1, 2, 3])).toBe(3);
  });

  it("returns null on empty history rather than a fallback number", () => {
    expect(naive([])).toBeNull();
  });
});

describe("seasonalNaive", () => {
  it("returns the value one full season back", () => {
    // 12 months; forecast for month 13 should equal month 1.
    const history = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    expect(seasonalNaive(history, 12)).toBe(10);
  });

  it("returns null when history is shorter than a season", () => {
    expect(seasonalNaive([1, 2, 3], 12)).toBeNull();
  });

  it("refuses a season length below 2", () => {
    // Season length 1 would silently make this identical to the naive baseline
    // it is supposed to be measured against.
    expect(seasonalNaive([1, 2, 3], 1)).toBeNull();
    expect(seasonalNaive([1, 2, 3], 0)).toBeNull();
  });
});

describe("drift", () => {
  it("extends the line from first to last by one period", () => {
    // 0 -> 10 over 5 steps is +2 per period; next is 12.
    expect(drift([0, 2, 4, 6, 8, 10])).toBe(12);
  });

  it("handles a downward trend", () => {
    expect(drift([10, 8, 6, 4])).toBeCloseTo(2, 10);
  });

  it("returns the last value when the series is flat", () => {
    expect(drift([5, 5, 5, 5])).toBe(5);
  });

  it("needs at least two points", () => {
    expect(drift([1])).toBeNull();
  });
});

describe("seasonalNaiveDrift", () => {
  it("adds the year-over-year trend to the seasonal value", () => {
    // Two identical seasons except +12 in the second: same month next year
    // should be another +12 on top of the last season's value.
    const seasonOne = [10, 20, 30, 40];
    const seasonTwo = [22, 32, 42, 52];
    expect(seasonalNaiveDrift([...seasonOne, ...seasonTwo], 4)).toBe(34);
  });

  it("equals plain seasonal naive when there is no year-over-year change", () => {
    const season = [10, 20, 30, 40];
    expect(seasonalNaiveDrift([...season, ...season], 4)).toBe(10);
  });

  it("needs two full seasons", () => {
    expect(seasonalNaiveDrift([10, 20, 30, 40, 50], 4)).toBeNull();
  });
});

describe("forecastWith", () => {
  it("returns null for seasonal methods when there is no season length", () => {
    // Yearly series have no within-year season.
    expect(forecastWith("seasonal_naive", [1, 2, 3], null)).toBeNull();
    expect(forecastWith("seasonal_naive_drift", [1, 2, 3], null)).toBeNull();
    expect(forecastWith("naive", [1, 2, 3], null)).toBe(3);
  });
});

describe("minimumHistoryFor", () => {
  it("reports what each method needs", () => {
    expect(minimumHistoryFor("naive", 12)).toBe(1);
    expect(minimumHistoryFor("drift", 12)).toBe(2);
    expect(minimumHistoryFor("seasonal_naive", 12)).toBe(12);
    expect(minimumHistoryFor("seasonal_naive_drift", 12)).toBe(24);
    expect(minimumHistoryFor("seasonal_naive", null)).toBeNull();
  });
});
