/**
 * Plain-language rendering of graph relationships.
 *
 * Pure and centralised on purpose. A reviewer judging 1,200 items should never
 * have to decode `polarity: -1` — and the same wording has to reappear on
 * signal cards later, so the vocabulary is defined once rather than reinvented
 * per screen.
 *
 * Deliberately descriptive, never evaluative (D3). An edge says a driver
 * *pushes* a target up or down; an exposure says a driver *works against* or
 * *in favour of* a company. Neither says anything about a share price.
 */

export type Band = {
  /** One word a non-technical reader can act on. */
  label: string;
  /** What the number actually measures. */
  hint: string;
  /** 0–1, for the meter fill. */
  fraction: number;
};

/**
 * How much of the target's movement this one driver explains.
 *
 * Bands are wide on purpose. Most genuine economic edges sit between 0.2 and
 * 0.5, and pretending to distinguish 0.34 from 0.38 would be false precision.
 */
export function strengthBand(value: number): Band {
  const fraction = clamp(value);
  if (fraction >= 0.8) return { label: "Dominant", hint: "explains most of the target's movement", fraction };
  if (fraction >= 0.6) return { label: "Strong", hint: "a major part of the target's movement", fraction };
  if (fraction >= 0.4) return { label: "Moderate", hint: "a meaningful part of the movement", fraction };
  if (fraction >= 0.2) return { label: "Modest", hint: "a small but real part of the movement", fraction };
  return { label: "Minimal", hint: "barely moves the target", fraction };
}

/** How sure we are the link is real and pointing the right way. */
export function confidenceBand(value: number): Band {
  const fraction = clamp(value);
  if (fraction >= 0.8) return { label: "Very sure", hint: "well-established, hard to argue with", fraction };
  if (fraction >= 0.6) return { label: "Fairly sure", hint: "solid, some room for doubt", fraction };
  if (fraction >= 0.35) return { label: "Unsure", hint: "plausible but thinly evidenced", fraction };
  return { label: "Speculative", hint: "little more than a hypothesis", fraction };
}

/** Exposure size, for company rows. */
export function magnitudeBand(value: string): Band {
  switch (value) {
    case "high":
      return { label: "High", hint: "a large share of their economics", fraction: 0.9 };
    case "medium":
      return { label: "Medium", hint: "a noticeable share of their economics", fraction: 0.55 };
    default:
      return { label: "Low", hint: "a minor share of their economics", fraction: 0.2 };
  }
}

/**
 * Transmission time in words.
 *
 * "14 days" is precise and slow to read; "about 2 weeks" is what a reviewer
 * actually judges against. Both are shown — the phrase to think with, the
 * number to correct.
 */
export function describeLag(days: number): string {
  if (days <= 0) return "immediately";
  if (days === 1) return "next day";
  if (days <= 10) return `about ${days} days`;
  if (days <= 21) return `about ${Math.round(days / 7)} weeks`;
  if (days <= 45) return "about a month";
  if (days <= 400) {
    const months = Math.round(days / 30);
    return months === 1 ? "about a month" : `about ${months} months`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? "about a year" : `about ${years} years`;
}

export type RelationshipPhrase = {
  /** e.g. "Brent crude oil" */
  driver: string;
  /** e.g. "Aviation" */
  target: string;
  /** Verb clause BEFORE the target, e.g. "pushes" or "works against". */
  verb: string;
  /** Emphasised word AFTER the target, e.g. "DOWN". Empty where the verb carries it. */
  qualifier: string;
  /** "up" | "down" — drives arrow and colour. */
  direction: "up" | "down";
};

/**
 * The sentence at the top of a review card.
 *
 * Always framed as a CONDITIONAL: "When X rises…". The graph never claims the
 * driver will rise — that is the detector's job, from observed data. Reviewers
 * kept reading polarity as a forecast, and this phrasing is what stops that.
 */
export function describeEdge(driver: string, target: string, polarity: -1 | 1): RelationshipPhrase {
  return {
    driver,
    target,
    verb: "pushes",
    qualifier: polarity === 1 ? "UP" : "DOWN",
    direction: polarity === 1 ? "up" : "down",
  };
}

export function describeExposure(
  driver: string,
  company: string,
  direction: -1 | 1,
): RelationshipPhrase {
  return {
    driver,
    target: company,
    verb: direction === 1 ? "works in favour of" : "works against",
    qualifier: "",
    direction: direction === 1 ? "up" : "down",
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
