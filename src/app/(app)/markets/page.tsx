import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Markets" };

export default function MarketsPage() {
  return (
    <>
      <PageHeader
        eyebrow="End of day"
        title="Markets"
        lede="Today's close, and what moved it."
      />
      <EmptyState
        phase="Phase 1"
        title="No market data connected"
        body="Market data comes from a licensed end-of-day vendor (decision D2) — vendor selection is in progress. Everything shown here will be labelled delayed, and each driver will link to the signal behind it."
      />
    </>
  );
}
