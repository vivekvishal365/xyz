import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Signals" };

export default function SignalsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Feed"
        title="Signals"
        lede="Detected changes, connected to what they could affect."
      />
      <EmptyState
        phase="Phase 3"
        title="No signals yet"
        body="The signal engine detects changes, qualifies which ones matter, traverses the causal graph and scores the result. It needs the ingestion spine (Phase 1) and the approved causal graph (Phase 2) before it can produce anything."
      />
    </>
  );
}
