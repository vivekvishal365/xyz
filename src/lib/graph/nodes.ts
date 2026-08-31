import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Node resolution for the causal graph.
 *
 * `causal_edges` references nodes polymorphically (`from_type` + `from_id`),
 * which keeps the schema simple but means the UI cannot join its way to a name.
 * This resolves a mixed batch of node references in one pass per type, so the
 * review queue can show both endpoints in full without N queries per item.
 *
 * Showing the endpoints properly is the whole point of the "context-rich"
 * requirement: a reviewer who has to open another tab to remember what
 * `india-reer` is will not sustain 90 seconds per item.
 */

export type NodeType = "indicator" | "sector" | "company" | "commodity" | "market" | "theme" | "country";

export type ResolvedNode = {
  type: NodeType;
  id: string;
  slug: string;
  name: string;
  /** One line of orienting context: unit and category, or a sector, or a description. */
  subtitle: string | null;
  /** Extra facts worth seeing while judging an edge. */
  facts: { label: string; value: string }[];
  /** Where to read more, when a page exists. */
  href: string | null;
};

const TABLE_BY_TYPE: Partial<Record<NodeType, string>> = {
  indicator: "indicators",
  sector: "sectors",
  company: "companies",
};

export async function resolveNodes(
  db: SupabaseClient,
  refs: readonly { type: string; id: string }[],
): Promise<Map<string, ResolvedNode>> {
  const resolved = new Map<string, ResolvedNode>();

  const byType = new Map<string, Set<string>>();
  for (const ref of refs) {
    const bucket = byType.get(ref.type) ?? new Set<string>();
    bucket.add(ref.id);
    byType.set(ref.type, bucket);
  }

  for (const [type, ids] of byType) {
    const table = TABLE_BY_TYPE[type as NodeType];
    if (!table) continue;
    const idList = [...ids];

    if (type === "indicator") {
      const { data } = await db
        .from("indicators")
        .select("id, slug, name, unit, category, frequency, is_active")
        .in("id", idList);

      for (const row of data ?? []) {
        resolved.set(key(type, row.id as string), {
          type: "indicator",
          id: row.id as string,
          slug: row.slug as string,
          name: row.name as string,
          subtitle: `${row.category} · ${row.unit}`,
          facts: [
            { label: "Frequency", value: String(row.frequency) },
            { label: "Unit", value: String(row.unit) },
            ...(row.is_active ? [] : [{ label: "Status", value: "not ingested" }]),
          ],
          href: `/indicators/${row.slug as string}`,
        });
      }
    }

    if (type === "sector") {
      const { data } = await db
        .from("sectors")
        .select("id, slug, name, description, parent_id")
        .in("id", idList);

      for (const row of data ?? []) {
        resolved.set(key(type, row.id as string), {
          type: "sector",
          id: row.id as string,
          slug: row.slug as string,
          name: row.name as string,
          subtitle: (row.description as string | null) ?? "Sector",
          facts: [],
          href: null,
        });
      }
    }

    if (type === "company") {
      const { data } = await db
        .from("companies")
        .select("id, slug, name, description, sectors(name)")
        .in("id", idList);

      for (const row of data ?? []) {
        const embedded = row.sectors as unknown;
        const sector = (Array.isArray(embedded) ? embedded[0] : embedded) as
          | { name: string }
          | null
          | undefined;

        resolved.set(key(type, row.id as string), {
          type: "company",
          id: row.id as string,
          slug: row.slug as string,
          name: row.name as string,
          subtitle: sector?.name ?? "Company",
          facts: [{ label: "Business", value: (row.description as string | null) ?? "—" }],
          href: null,
        });
      }
    }
  }

  return resolved;
}

export function key(type: string, id: string): string {
  return `${type}:${id}`;
}

/** Placeholder for a node whose row has gone missing — never silently blank. */
export function unknownNode(type: string, id: string): ResolvedNode {
  return {
    type: type as NodeType,
    id,
    slug: id,
    name: `Unknown ${type}`,
    subtitle: `No row found for ${id}`,
    facts: [],
    href: null,
  };
}
