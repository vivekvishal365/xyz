import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin index.
 *
 * This route did not exist — only /admin/graph and /admin/health did — so
 * /admin fell through to the proxy's protected-prefix check and looked like an
 * auth failure when it was really a missing page.
 */
export default async function AdminPage() {
  const db = createServiceClient();

  const [pendingEdges, pendingExposures, indicators, observations] = await Promise.all([
    db.from("causal_edges").select("*", { count: "exact", head: true }).eq("status", "draft"),
    db.from("exposures").select("*", { count: "exact", head: true }).eq("status", "draft"),
    db.from("indicators").select("*", { count: "exact", head: true }).eq("is_active", true),
    db.from("indicator_observations").select("*", { count: "exact", head: true }).eq("is_current", true),
  ]);

  const pending = (pendingEdges.count ?? 0) + (pendingExposures.count ?? 0);

  const cards = [
    {
      href: "/admin/graph" as const,
      title: "Graph curation",
      body: "Review AI-drafted causal edges and company exposures. Keyboard-first.",
      metric: pending > 0 ? `${pending} pending` : "nothing pending",
      accent: pending > 0,
    },
    {
      href: "/admin/health" as const,
      title: "Pipeline health",
      body: "Per-indicator freshness, ingest runs, and the apply_observations check.",
      metric: `${indicators.count ?? 0} active indicators`,
      accent: false,
    },
    {
      href: "/indicators" as const,
      title: "Indicator registry",
      body: "Every tracked series, its estimate, and its source provenance.",
      metric: `${(observations.count ?? 0).toLocaleString("en-IN")} observations`,
      accent: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Internal"
        title="Admin"
        lede="Curation and operations. Not part of the user-facing product."
      />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="flex h-full flex-col rounded border border-rule bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="text-sm font-semibold">{card.title}</span>
              <span className="mt-1 flex-1 text-xs leading-relaxed text-ink-2">{card.body}</span>
              <span
                className={`mt-2.5 font-mono text-[11px] ${card.accent ? "text-accent-ink" : "text-ink-3"}`}
              >
                {card.metric}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
