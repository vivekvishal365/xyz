import Link from "next/link";

/**
 * D3 — the non-advisory disclaimer.
 *
 * Ships in Phase 0 rather than at launch, per docs/00-decisions.md: it should
 * exist before the first user sees a single number. This is the visible half of
 * the posture; the enforcing half is the `ai/compliance` gate in Phase 4.
 */
export function DisclaimerBar() {
  return (
    <footer className="border-t border-rule px-4 py-4 text-xs leading-relaxed text-ink-3 md:px-8">
      <p className="max-w-[70ch]">
        SignalX provides economic intelligence and scenario analysis. It is not investment
        advice, and nothing here is a recommendation to buy or sell any security.{" "}
        <Link
          href="/legal/disclaimer"
          className="text-accent-ink underline underline-offset-2 hover:no-underline"
        >
          Read the full disclaimer
        </Link>
        .
      </p>
    </footer>
  );
}
