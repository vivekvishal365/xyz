import { describe, expect, it } from "vitest";
import {
  isContiguous,
  isIsoDate,
  nextPeriodStart,
  periodEndFor,
  periodsBetween,
  seasonLengthFor,
} from "./period";

describe("isIsoDate", () => {
  it("rejects dates that look valid but are not", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-2-01")).toBe(false);
    expect(isIsoDate("not-a-date")).toBe(false);
  });

  it("accepts real dates including leap days", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-08-31")).toBe(true);
  });
});

describe("periodEndFor", () => {
  it("handles month ends including February in a leap year", () => {
    expect(periodEndFor("2026-08-01", "month")).toBe("2026-08-31");
    expect(periodEndFor("2026-02-01", "month")).toBe("2026-02-28");
    expect(periodEndFor("2024-02-01", "month")).toBe("2024-02-29");
    expect(periodEndFor("2026-04-01", "month")).toBe("2026-04-30");
  });

  it("snaps quarters to the calendar quarter, not to the given month", () => {
    // FRED dates Q3 to 1 July; the quarter still ends 30 September.
    expect(periodEndFor("2026-07-01", "quarter")).toBe("2026-09-30");
    expect(periodEndFor("2026-01-01", "quarter")).toBe("2026-03-31");
    expect(periodEndFor("2026-10-01", "quarter")).toBe("2026-12-31");
  });

  it("handles years, weeks and days", () => {
    expect(periodEndFor("2026-01-01", "year")).toBe("2026-12-31");
    expect(periodEndFor("2026-08-31", "week")).toBe("2026-09-06");
    expect(periodEndFor("2026-08-31", "day")).toBe("2026-08-31");
  });
});

describe("nextPeriodStart", () => {
  it("rolls over month and year boundaries", () => {
    expect(nextPeriodStart("2026-08-31")).toBe("2026-09-01");
    expect(nextPeriodStart("2026-12-31")).toBe("2027-01-01");
    expect(nextPeriodStart("2024-02-29")).toBe("2024-03-01");
  });
});

describe("periodsBetween", () => {
  it("counts months across a year boundary", () => {
    expect(periodsBetween("2025-11-30", "2026-01-31", "month")).toBe(2);
    expect(periodsBetween("2026-01-31", "2025-11-30", "month")).toBe(-2);
  });

  it("counts quarters by calendar quarter", () => {
    expect(periodsBetween("2026-03-31", "2026-06-30", "quarter")).toBe(1);
    expect(periodsBetween("2025-12-31", "2026-12-31", "quarter")).toBe(4);
  });

  it("counts days and years", () => {
    expect(periodsBetween("2026-08-01", "2026-08-31", "day")).toBe(30);
    expect(periodsBetween("2020-12-31", "2026-12-31", "year")).toBe(6);
  });
});

describe("seasonLengthFor", () => {
  it("returns null for yearly series", () => {
    // A season length of 1 would quietly turn seasonal-naive into the very
    // baseline it is supposed to be measured against.
    expect(seasonLengthFor("year")).toBeNull();
    expect(seasonLengthFor("month")).toBe(12);
    expect(seasonLengthFor("quarter")).toBe(4);
  });
});

describe("isContiguous", () => {
  it("accepts an unbroken monthly run", () => {
    expect(isContiguous(["2026-01-31", "2026-02-28", "2026-03-31"], "month")).toBe(true);
  });

  it("catches a missing month", () => {
    // This is the case that would silently shift every seasonal lookup by one.
    expect(isContiguous(["2026-01-31", "2026-03-31", "2026-04-30"], "month")).toBe(false);
  });

  it("catches duplicates and reversed order", () => {
    expect(isContiguous(["2026-01-31", "2026-01-31"], "month")).toBe(false);
    expect(isContiguous(["2026-02-28", "2026-01-31"], "month")).toBe(false);
  });

  it("treats short series as trivially contiguous", () => {
    expect(isContiguous([], "month")).toBe(true);
    expect(isContiguous(["2026-01-31"], "month")).toBe(true);
  });
});
