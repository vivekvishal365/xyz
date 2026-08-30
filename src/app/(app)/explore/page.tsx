import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <>
      <PageHeader
        eyebrow="Ask"
        title="Explore"
        lede="Questions answered from the data, with the evidence attached."
      />
      <EmptyState
        phase="Phase 5"
        title="Not available yet"
        body="Explore answers from the database through tool-calls against SignalX's own API — never from model memory, and never from the open web. Every claim resolves to a stored observation or document. It needs real data behind it first."
      />
    </>
  );
}
