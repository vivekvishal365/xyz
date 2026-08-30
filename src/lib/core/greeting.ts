/**
 * PRD §10 — "Good Morning, Vivek".
 *
 * Pure and timezone-explicit so it can be unit-tested and so the greeting is
 * correct for a user in IST regardless of where the server runs.
 */

export type PartOfDay = "morning" | "afternoon" | "evening";

export function partOfDay(now: Date, timeZone = "Asia/Kolkata"): PartOfDay {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone,
    }).format(now),
  );

  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function greeting(now: Date, name?: string | null, timeZone = "Asia/Kolkata"): string {
  const part = partOfDay(now, timeZone);
  const label = part === "morning" ? "Good morning" : part === "afternoon" ? "Good afternoon" : "Good evening";
  const trimmed = name?.trim();
  return trimmed ? `${label}, ${trimmed}` : label;
}

export function formatAppDate(now: Date, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(now);
}
