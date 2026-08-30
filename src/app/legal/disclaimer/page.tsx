import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Disclaimer" };

/**
 * D3 — the non-advisory posture, stated plainly.
 *
 * NOTE FOR REVIEW: this is a plain-language statement of the product's own
 * position, not vetted legal copy. Indian securities counsel still needs to
 * review it, and the company-level features in Phase 5 are gated on that
 * review. See docs/00-decisions.md.
 */
export default function DisclaimerPage() {
  return (
    <main className="mx-auto max-w-[68ch] px-5 py-12 md:py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">SignalX</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Disclaimer</h1>

      <div className="mt-8 flex flex-col gap-5 leading-relaxed text-ink-2">
        <p>
          <strong className="text-ink">SignalX is an economic intelligence tool.</strong> It
          monitors public economic, financial, commodity, weather and policy data, detects
          meaningful changes, and explains what those changes could affect and why.
        </p>

        <p>
          <strong className="text-ink">It is not investment advice.</strong> Nothing on SignalX is
          a recommendation to buy, sell or hold any security, and nothing here is tailored to your
          financial situation, objectives or risk tolerance. SignalX does not provide personalised
          investment advice and is not a registered investment adviser or research analyst.
        </p>

        <p>
          <strong className="text-ink">What we describe, and what we do not.</strong> SignalX
          describes <em>exposure</em> — which inputs a company or sector depends on, in which
          direction, and why, drawn from public disclosures. It does not forecast share prices,
          earnings or returns, and it does not rate securities.
        </p>

        <p>
          <strong className="text-ink">Estimates are estimates.</strong> Where SignalX shows an
          expected value for an economic indicator, that figure is produced by our own statistical
          model and labelled a SignalX estimate. It is not an analyst consensus. The method and
          the model&apos;s historical error are shown alongside it.
        </p>

        <p>
          <strong className="text-ink">Probabilities are not predictions.</strong> Confidence and
          probability scores describe the strength of the evidence behind a scenario, not a promise
          about the future. Signals can be wrong, late, or reversed by events, and SignalX tracks
          its own record openly rather than quietly.
        </p>

        <p>
          <strong className="text-ink">Data comes from third parties.</strong> Every figure is
          attributed to its source with the time it was retrieved. Source data can be delayed,
          revised or incorrect. Market data is end-of-day and delayed.
        </p>

        <p>
          <strong className="text-ink">Decisions are yours.</strong> Consider your own
          circumstances and consult a qualified, registered financial adviser before acting on
          anything you read here.
        </p>
      </div>

      <p className="mt-10 text-sm">
        <Link
          href="/home"
          className="text-accent-ink underline underline-offset-2 hover:no-underline"
        >
          Back to SignalX
        </Link>
      </p>
    </main>
  );
}
