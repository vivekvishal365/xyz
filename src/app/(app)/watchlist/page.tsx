import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <>
      <PageHeader
        eyebrow="Following"
        title="Watchlist"
        lede="Companies, sectors, indicators and commodities you're tracking."
      />
      <EmptyState
        phase="Phase 5"
        title="Nothing to follow yet"
        body="Once companies, sectors and indicators exist in the database you'll be able to follow them here, and receive alerts when something meaningful changes — significance-gated, not every minor movement."
      />
    </>
  );
}
