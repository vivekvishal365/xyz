"use client";

import { useEffect, useRef, useState } from "react";
import type { Provenance } from "@/lib/indicators/detail";

/**
 * PRD §26 — source transparency.
 *
 * The spec asks for source name, publication time, dataset, original value and
 * retrieved time. This adds the request URL, content hash and revision number,
 * because "traceable" should mean a reader can go and check the number
 * themselves, not merely be told where it came from.
 *
 * Publication time is shown as "not stated by the provider" when it is missing,
 * rather than falling back to the retrieval time. They are different facts, and
 * conflating them is precisely the point-in-time error the schema avoids.
 */
export function SourceDrawer({ provenance }: { provenance: Provenance }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-rule px-2.5 py-1 font-mono text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        Source
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Source provenance"
            className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-rule bg-surface p-5"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                  Provenance
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">
                  {provenance.sourceName}
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-rule px-2 py-1 font-mono text-[11px] text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                Close
              </button>
            </div>

            <dl className="flex flex-col gap-3 text-sm">
              <Field label="Original value">
                <span className="font-mono">
                  {provenance.originalValue.toLocaleString("en-IN", {
                    maximumFractionDigits: 6,
                  })}
                </span>
              </Field>
              <Field label="Period">
                <span className="font-mono">
                  {provenance.periodStart} → {provenance.periodEnd}
                </span>
              </Field>
              <Field label="Dataset">
                <span className="font-mono">{provenance.datasetCode ?? "—"}</span>
              </Field>
              <Field label="Published by source">
                {provenance.releasedAt ? (
                  <span className="font-mono">{formatTimestamp(provenance.releasedAt)}</span>
                ) : (
                  <span className="text-ink-3">not stated by the provider</span>
                )}
              </Field>
              <Field label="Retrieved by SignalX">
                <span className="font-mono">
                  {provenance.retrievedAt ? formatTimestamp(provenance.retrievedAt) : "—"}
                </span>
              </Field>
              <Field label="Revision">
                <span className="font-mono">
                  {provenance.revision}
                  {provenance.revision > 1 ? " (this figure has been revised)" : " (first print)"}
                </span>
              </Field>
              <Field label="Source reliability">
                <span className="font-mono">{provenance.reliability.toFixed(2)}</span>
              </Field>
              {provenance.contentHash ? (
                <Field label="Payload hash">
                  <code className="break-all font-mono text-[11px] text-ink-3">
                    {provenance.contentHash}
                  </code>
                </Field>
              ) : null}
              {provenance.requestUrl ? (
                <Field label="Request">
                  <code className="break-all font-mono text-[11px] text-ink-3">
                    {provenance.requestUrl}
                  </code>
                </Field>
              ) : null}
              {provenance.licenceNote ? (
                <Field label="Licence">
                  <span className="text-ink-2">{provenance.licenceNote}</span>
                </Field>
              ) : null}
            </dl>

            {provenance.sourceUrl ? (
              <a
                href={provenance.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 self-start text-sm text-accent-ink underline underline-offset-2 hover:no-underline"
              >
                Open {provenance.sourceSlug} ↗
              </a>
            ) : null}

            <p className="mt-6 border-t border-rule pt-4 text-xs leading-relaxed text-ink-3">
              SignalX stores the provider&apos;s untouched response and hashes it before parsing.
              Every figure shown traces back to one of those stored payloads.
            </p>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-rule pb-3 last:border-0">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date) + " IST";
}
