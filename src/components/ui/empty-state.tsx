/**
 * Honest empty state.
 *
 * Phase 0 has no pipeline, so these screens hold nothing. They say so plainly
 * and name the phase that fills them, rather than showing placeholder signals —
 * fake data in a product whose entire promise is source transparency (§26) is a
 * bad habit to start with.
 */
export function EmptyState({
  title,
  body,
  phase,
}: {
  title: string;
  body: string;
  phase: string;
}) {
  return (
    <div className="rounded border border-dashed border-rule bg-surface px-5 py-8 md:px-7 md:py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.11em] text-ink-3">{phase}</p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}
