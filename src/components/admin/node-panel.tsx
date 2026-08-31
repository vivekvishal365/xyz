import Link from "next/link";
import type { Route } from "next";
import type { ResolvedNode } from "@/lib/graph/nodes";

/**
 * One endpoint of a proposed edge, with enough context to judge it.
 *
 * Both endpoints render side by side so the reviewer never opens another tab —
 * that tab switch is the single most expensive interaction in the queue, and at
 * 1,200 items it is the difference between two weeks and six.
 */
export function NodePanel({
  node,
  role,
  accent,
}: {
  node: ResolvedNode;
  role: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded border px-3 py-2.5 ${
        accent ? "border-accent/40 bg-accent-bg/40" : "border-rule bg-surface-2"
      }`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        {role} · {node.type}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold" title={node.name}>
        {node.name}
      </p>
      {node.subtitle ? (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-2">{node.subtitle}</p>
      ) : null}

      {node.facts.length > 0 ? (
        <dl className="mt-1.5 flex flex-col gap-0.5">
          {node.facts.map((fact) => (
            <div key={fact.label} className="flex gap-1.5 text-[10px] leading-snug">
              <dt className="shrink-0 font-mono uppercase text-ink-3">{fact.label}</dt>
              <dd className="min-w-0 truncate text-ink-2" title={fact.value}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="mt-1.5 font-mono text-[10px] text-ink-3">{node.slug}</p>

      {node.href ? (
        <Link
          href={node.href as Route}
          target="_blank"
          className="mt-1 self-start font-mono text-[10px] text-accent-ink hover:underline"
        >
          open ↗
        </Link>
      ) : null}
    </div>
  );
}
