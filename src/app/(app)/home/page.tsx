import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth/server";
import { greeting, formatAppDate } from "@/lib/core/greeting";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const user = await getAppUser();

  const now = new Date();
  const displayName =
    user?.displayName?.split(" ")[0] ?? user?.email.split("@")[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow={`India Intelligence · ${formatAppDate(now)}`}
        title={greeting(now, displayName)}
        lede="What matters right now."
      />

      <div className="flex flex-col gap-4">
        <EmptyState
          phase="Phase 3"
          title="Market environment scores"
          body="Inflation risk, growth momentum, market risk, currency risk and commodity pressure. These are computed from live signals rather than entered by hand, so they stay empty until the signal engine runs."
        />
        <EmptyState
          phase="Phase 3"
          title="Top signals"
          body="The highest-priority signals, ranked by impact × probability × confidence × novelty. Nothing appears here until the ingestion spine and the causal graph are in place."
        />
      </div>
    </>
  );
}
