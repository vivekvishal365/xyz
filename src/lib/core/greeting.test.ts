import { describe, expect, it } from "vitest";
import { formatAppDate, greeting, partOfDay } from "./greeting";

/**
 * These run in IST regardless of the machine's timezone — CI runs in UTC and
 * the product is India-first, so a test that passes only on the developer's
 * laptop is worse than no test.
 */
describe("partOfDay", () => {
  it("reads the hour in IST, not the host timezone", () => {
    // 01:00 UTC is 06:30 IST — morning in Delhi, still yesterday evening in UTC-6.
    expect(partOfDay(new Date("2026-08-31T01:00:00Z"))).toBe("morning");
    // 08:00 UTC is 13:30 IST.
    expect(partOfDay(new Date("2026-08-31T08:00:00Z"))).toBe("afternoon");
    // 14:00 UTC is 19:30 IST.
    expect(partOfDay(new Date("2026-08-31T14:00:00Z"))).toBe("evening");
  });

  it("treats midnight IST as morning", () => {
    // 18:30 UTC is 00:00 IST the next day.
    expect(partOfDay(new Date("2026-08-30T18:30:00Z"))).toBe("morning");
  });
});

describe("greeting", () => {
  it("includes the name when there is one", () => {
    expect(greeting(new Date("2026-08-31T01:00:00Z"), "Vivek")).toBe("Good morning, Vivek");
  });

  it("omits the name gracefully rather than greeting an empty string", () => {
    expect(greeting(new Date("2026-08-31T01:00:00Z"), null)).toBe("Good morning");
    expect(greeting(new Date("2026-08-31T01:00:00Z"), "   ")).toBe("Good morning");
  });
});

describe("formatAppDate", () => {
  it("formats in IST", () => {
    // 20:00 UTC on the 30th is already the 31st in India.
    expect(formatAppDate(new Date("2026-08-30T20:00:00Z"))).toBe("31 Aug 2026");
  });
});
