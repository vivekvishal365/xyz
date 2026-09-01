"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Draft, EdgeEdits, ExposureEdits } from "@/lib/graph/review";
import {
  approveAction,
  finishBatchAction,
  rejectAction,
  undoAction,
} from "@/app/(app)/admin/graph/actions";
import { NodePanel } from "./node-panel";
import { cn } from "@/lib/utils";

/**
 * The review queue (D9).
 *
 * Optimised for one number: seconds per item. ~1,200 items at 90 seconds is
 * 30 hours, so every avoided round trip is worth roughly 20 minutes in
 * aggregate. Three consequences shape this component:
 *
 *  1. The whole batch is already in memory. Advancing is a state change, never
 *     a fetch, so the keyboard flow never stalls.
 *  2. Writes are optimistic and fire-and-forget. A failure surfaces in a banner
 *     rather than blocking the next decision; nothing is lost because the row
 *     simply stays `draft` and reappears next sitting.
 *  3. Edits and approval are a single write — most drafts are directionally
 *     right with a wrong strength or lag, and making the common case two round
 *     trips would double its cost.
 */

type Decision = { index: number; kind: "approved" | "rejected" };
type Edits = { strength?: number; lagDays?: number; confidence?: number; polarity?: -1 | 1; magnitude?: string; text?: string };

const MAGNITUDES = ["low", "medium", "high"] as const;

export function ReviewQueue({
  drafts,
  batchId,
  batchLabel,
  alreadyDecided,
}: {
  drafts: Draft[];
  batchId: string;
  batchLabel: string;
  alreadyDecided: number;
}) {
  const router = useRouter();

  const [index, setIndex] = useState(0);
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [confidenceMode, setConfidenceMode] = useState(false);
  /**
   * Transient note when a key does not apply to this item kind — digits set
   * strength, which only edges have. Silently swallowing the keystroke leaves
   * the reviewer unsure whether anything happened, which is how a stray press
   * turns into a misremembered decision.
   */
  const [ignoredKey, setIgnoredKey] = useState<string | null>(null);

  // Pace is measured at decision time, in the event handler. Reading the clock
  // during render (or from an effect) is impure and makes the component
  // non-deterministic; the handler is the one place a clock read is honest.
  const [firstDecisionAt, setFirstDecisionAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const rejectInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const current = drafts[index];
  const done = index >= drafts.length;

  const currentEdits = useMemo<Edits>(
    () => (current ? (edits[current.id] ?? {}) : {}),
    [current, edits],
  );

  const setEdit = useCallback(
    (patch: Edits) => {
      if (!current) return;
      setEdits((prev) => ({ ...prev, [current.id]: { ...(prev[current.id] ?? {}), ...patch } }));
    },
    [current],
  );

  const advance = useCallback(() => {
    setIgnoredKey(null);
    setRejecting(false);
    setRejectReason("");
    setConfidenceMode(false);
    setEditingText(false);
    setIndex((i) => i + 1);
  }, []);

  const recordError = useCallback((message: string) => {
    setErrors((prev) => [...prev.slice(-4), message]);
  }, []);

  /** Stamp the pace clock. Called from the decision handlers only. */
  const markDecision = useCallback(() => {
    const now = Date.now();
    setFirstDecisionAt((prev) => prev ?? now);
    setElapsedSeconds(firstDecisionAt === null ? 0 : (now - firstDecisionAt) / 1000);
  }, [firstDecisionAt]);

  const approve = useCallback(() => {
    if (!current) return;
    const e = currentEdits;

    const payload: EdgeEdits | ExposureEdits =
      current.kind === "edge"
        ? {
            ...(e.polarity !== undefined ? { polarity: e.polarity } : {}),
            ...(e.strength !== undefined ? { strength: e.strength } : {}),
            ...(e.lagDays !== undefined ? { lagDays: e.lagDays } : {}),
            ...(e.confidence !== undefined ? { confidence: e.confidence } : {}),
            ...(e.text !== undefined ? { mechanism: e.text } : {}),
          }
        : {
            ...(e.polarity !== undefined ? { direction: e.polarity } : {}),
            ...(e.magnitude !== undefined ? { magnitude: e.magnitude } : {}),
            ...(e.confidence !== undefined ? { confidence: e.confidence } : {}),
            ...(e.text !== undefined ? { rationale: e.text } : {}),
          };

    const captured = { kind: current.kind, id: current.id, index };
    markDecision();
    setDecisions((prev) => [...prev, { index, kind: "approved" }]);
    advance();

    void approveAction(captured.kind, captured.id, payload).then((result) => {
      if (!result.ok) recordError(`approve failed: ${result.error}`);
    });
  }, [current, currentEdits, index, advance, recordError, markDecision]);

  const reject = useCallback(
    (reason: string) => {
      if (!current) return;
      const captured = { kind: current.kind, id: current.id };
      markDecision();
      setDecisions((prev) => [...prev, { index, kind: "rejected" }]);
      advance();

      void rejectAction(captured.kind, captured.id, reason || "no reason given").then((result) => {
        if (!result.ok) recordError(`reject failed: ${result.error}`);
      });
    },
    [current, index, advance, recordError, markDecision],
  );

  const undo = useCallback(() => {
    const last = decisions.at(-1);
    if (!last) return;
    const draft = drafts[last.index];
    if (!draft) return;

    setDecisions((prev) => prev.slice(0, -1));
    setIndex(last.index);
    setRejecting(false);
    setRejectReason("");

    void undoAction(draft.kind, draft.id).then((result) => {
      if (!result.ok) recordError(`undo failed: ${result.error}`);
    });
  }, [decisions, drafts, recordError]);

  const finish = useCallback(() => {
    void finishBatchAction(batchId).then(() => router.refresh());
  }, [batchId, router]);

  // Persist batch counters when the sitting ends, rather than after every
  // decision — 1,200 revalidations would make the flow stutter.
  useEffect(() => {
    if (done && decisions.length > 0) finish();
  }, [done, decisions.length, finish]);

  useEffect(() => {
    if (rejecting) rejectInput.current?.focus();
  }, [rejecting]);

  useEffect(() => {
    if (editingText) textArea.current?.focus();
  }, [editingText]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      // While typing, only Escape and Enter mean anything.
      if (typing) {
        if (event.key === "Escape") {
          event.preventDefault();
          setRejecting(false);
          setEditingText(false);
          setConfidenceMode(false);
        }
        if (event.key === "Enter" && rejecting) {
          event.preventDefault();
          reject(rejectReason);
        }
        if (event.key === "Enter" && editingText && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          setEditingText(false);
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!current) return;

      const k = event.key;

      // `c` then a digit sets confidence — two keystrokes, no form.
      if (confidenceMode) {
        if (/^[0-9]$/.test(k)) {
          event.preventDefault();
          setEdit({ confidence: k === "0" ? 1 : Number(k) / 10 });
          setConfidenceMode(false);
          return;
        }
        setConfidenceMode(false);
      }

      switch (k) {
        case "a":
        case "Enter":
          event.preventDefault();
          approve();
          break;
        case "x":
          event.preventDefault();
          setRejecting(true);
          break;
        case "s":
        case "ArrowRight":
          event.preventDefault();
          advance();
          break;
        case "ArrowLeft":
          event.preventDefault();
          setIndex((i) => Math.max(0, i - 1));
          break;
        case "u":
          event.preventDefault();
          undo();
          break;
        case "p":
          event.preventDefault();
          setEdit({
            polarity: (currentEdits.polarity ??
              (current.kind === "edge" ? current.polarity : current.direction)) === 1 ? -1 : 1,
          });
          break;
        case "c":
          event.preventDefault();
          setConfidenceMode(true);
          break;
        case "m":
          event.preventDefault();
          setEditingText(true);
          break;
        case "[":
        case "]":
        case "{":
        case "}": {
          event.preventDefault();
          if (current.kind !== "edge") {
            setIgnoredKey(`${k} adjusts lag, which only edges have`);
            break;
          }
          const step = k === "{" || k === "}" ? 7 : 1;
          const sign = k === "[" || k === "{" ? -1 : 1;
          setIgnoredKey(null);
          setEdit({ lagDays: Math.max(0, (currentEdits.lagDays ?? current.lagDays) + sign * step) });
          break;
        }
        case "d":
          event.preventDefault();
          if (current.kind !== "exposure") {
            setIgnoredKey("d cycles magnitude, which only exposures have");
            break;
          }
          setIgnoredKey(null);
          setEdit({
            magnitude:
              MAGNITUDES[
                (MAGNITUDES.indexOf((currentEdits.magnitude ?? current.magnitude) as "low") + 1) % 3
              ],
          });
          break;
        case "?":
          event.preventDefault();
          setShowHelp((v) => !v);
          break;
        default:
          if (/^[0-9]$/.test(k)) {
            event.preventDefault();
            if (current.kind !== "edge") {
              setIgnoredKey(`${k} sets strength, which only edges have — use c then a digit for confidence`);
              break;
            }
            setIgnoredKey(null);
            setEdit({ strength: k === "0" ? 1 : Number(k) / 10 });
          }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    current, currentEdits, approve, reject, advance, undo, setEdit,
    rejecting, rejectReason, editingText, confidenceMode,
  ]);

  const approved = decisions.filter((d) => d.kind === "approved").length;
  const rejected = decisions.filter((d) => d.kind === "rejected").length;

  // Derived from stored numbers only — no clock read during render.
  const pace = useMemo(() => {
    if (decisions.length < 3 || elapsedSeconds <= 0) return null;
    const perItem = elapsedSeconds / (decisions.length - 1);
    const remaining = Math.max(0, drafts.length - index);
    return { perItem, minutesLeft: Math.round((perItem * remaining) / 60) };
  }, [decisions.length, elapsedSeconds, drafts.length, index]);


  if (drafts.length === 0) {
    return (
      <div className="rounded border border-dashed border-rule bg-surface px-5 py-10 text-center">
        <p className="text-sm font-semibold">Nothing pending in this batch</p>
        <p className="mt-1 text-xs text-ink-2">
          {alreadyDecided > 0
            ? `${alreadyDecided} item(s) already decided.`
            : "Run the drafting job to populate it."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <ProgressBar
        index={index}
        total={drafts.length}
        approved={approved}
        rejected={rejected}
        alreadyDecided={alreadyDecided}
        pace={pace}
        batchLabel={batchLabel}
      />

      {errors.length > 0 ? (
        <div role="alert" className="mb-3 rounded border border-sev-high/40 bg-sev-high-bg px-3 py-2">
          <p className="font-mono text-[11px] uppercase text-sev-high">Write errors</p>
          <ul className="mt-1 space-y-0.5 text-xs text-sev-high">
            {errors.map((error, i) => (
              <li key={`${error}-${i}`}>{error}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-sev-high">
            Those rows stay in <code>draft</code> and will reappear next sitting.
          </p>
        </div>
      ) : null}

      {done ? (
        <div className="rounded border border-rule bg-surface px-5 py-10 text-center">
          <p className="text-lg font-semibold tracking-tight">Batch complete</p>
          <p className="mt-1 text-sm text-ink-2">
            {approved} approved · {rejected} rejected · {drafts.length - approved - rejected} skipped
          </p>
          <p className="mt-3 text-xs text-ink-3">
            Skipped items stay in <code>draft</code> and come back next time.
          </p>
          <button
            type="button"
            onClick={() => setIndex(0)}
            className="mt-4 rounded border border-rule px-3 py-1.5 text-xs hover:bg-surface-2"
          >
            Back to the start
          </button>
        </div>
      ) : current ? (
        <DraftCard
          draft={current}
          edits={currentEdits}
          editingText={editingText}
          textAreaRef={textArea}
          onTextChange={(value) => setEdit({ text: value })}
          confidenceMode={confidenceMode}
        />
      ) : null}

      {ignoredKey && !done ? (
        <p role="status" className="mt-2 font-mono text-[11px] text-sev-med">
          {ignoredKey}
        </p>
      ) : null}

      {rejecting ? (
        <div className="mt-3 rounded border border-sev-high/40 bg-surface px-3 py-2.5">
          <label
            htmlFor="reject-reason"
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-sev-high"
          >
            Reject — why?
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="reject-reason"
              ref={rejectInput}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="mechanism is wrong / not a real linkage / duplicate"
              className="flex-1 rounded border border-rule bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus-visible:border-accent"
            />
            <button
              type="button"
              onClick={() => reject(rejectReason)}
              className="rounded bg-sev-high px-3 py-1.5 text-xs font-medium text-white"
            >
              Reject ⏎
            </button>
          </div>
          <p className="mt-1 font-mono text-[10px] text-ink-3">
            The reason is stored on the row — it is how a drafting prompt gets fixed.
          </p>
        </div>
      ) : null}

      <KeyboardLegend kind={current?.kind ?? "edge"} show={showHelp} onToggle={() => setShowHelp((v) => !v)} />
    </div>
  );
}

function ProgressBar({
  index, total, approved, rejected, alreadyDecided, pace, batchLabel,
}: {
  index: number;
  total: number;
  approved: number;
  rejected: number;
  alreadyDecided: number;
  pace: { perItem: number; minutesLeft: number } | null;
  batchLabel: string;
}) {
  const pct = total === 0 ? 100 : Math.round((Math.min(index, total) / total) * 100);

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">{batchLabel}</p>
        <p className="font-mono text-xs tabular-nums text-ink-2">
          <span className="text-ink">{Math.min(index + 1, total)}</span> / {total}
          <span className="text-ink-3"> · </span>
          <span className="text-sev-low">{approved} approved</span>
          <span className="text-ink-3"> · </span>
          <span className="text-sev-high">{rejected} rejected</span>
          {alreadyDecided > 0 ? <span className="text-ink-3"> · {alreadyDecided} earlier</span> : null}
          {/* The finish line, in the unit that actually matters. */}
          {pace ? (
            <span className="text-ink-3">
              {" · "}
              {pace.perItem.toFixed(0)}s/item · ~{pace.minutesLeft}m left
            </span>
          ) : null}
        </p>
      </div>
      <div className="h-1 w-full overflow-hidden rounded bg-surface-2">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DraftCard({
  draft, edits, editingText, textAreaRef, onTextChange, confidenceMode,
}: {
  draft: Draft;
  edits: Edits;
  editingText: boolean;
  textAreaRef: React.RefObject<HTMLTextAreaElement | null>;
  onTextChange: (value: string) => void;
  confidenceMode: boolean;
}) {
  const isEdge = draft.kind === "edge";
  const from = isEdge ? draft.from : draft.driver;
  const to = isEdge ? draft.to : draft.company;

  const polarity = edits.polarity ?? (isEdge ? draft.polarity : draft.direction);
  const confidence = edits.confidence ?? draft.confidence;
  const text = edits.text ?? (isEdge ? draft.mechanism : draft.rationale);
  const changed = Object.keys(edits).length > 0;

  return (
    <div className="rounded border border-rule bg-surface">
      <div className="flex items-center justify-between border-b border-rule px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          {isEdge ? "Causal edge" : "Company exposure"} · proposed by {draft.proposedBy}
        </span>
        {changed ? (
          <span className="rounded bg-accent-bg px-1.5 py-0.5 font-mono text-[10px] text-accent-ink">
            edited
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-2 px-3 py-3 sm:grid-cols-[1fr_auto_1fr]">
        <NodePanel node={from} role={isEdge ? "Driver" : "Driver"} accent />
        <div className="flex items-center justify-center px-1">
          <span
            className={cn(
              "font-mono text-lg",
              polarity === 1 ? "text-sev-low" : "text-sev-high",
            )}
            title={polarity === 1 ? "same direction" : "inverse"}
          >
            {polarity === 1 ? "→ +" : "→ −"}
          </span>
        </div>
        <NodePanel node={to} role={isEdge ? "Affects" : "Company"} />
      </div>

      <div className="border-t border-rule px-3 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
          {isEdge ? "Mechanism" : "Rationale"} — press m to edit
        </p>
        {editingText ? (
          <textarea
            ref={textAreaRef}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-accent bg-surface-2 px-2 py-1.5 text-sm outline-none"
          />
        ) : (
          <p className="mt-1 text-sm leading-relaxed">{text}</p>
        )}
        {isEdge && draft.evidenceNote ? (
          <p className="mt-1.5 text-[11px] text-ink-3">Evidence: {draft.evidenceNote}</p>
        ) : null}
        {!isEdge && draft.sourceNote ? (
          <p className="mt-1.5 text-[11px] text-ink-3">Source: {draft.sourceNote}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-rule px-3 py-2.5">
        {isEdge ? (
          <>
            <Dial label="Strength" hint="1–9, 0" value={(edits.strength ?? draft.strength).toFixed(2)} changed={edits.strength !== undefined} />
            <Dial label="Lag (days)" hint="[ ] { }" value={String(edits.lagDays ?? draft.lagDays)} changed={edits.lagDays !== undefined} />
          </>
        ) : (
          <Dial label="Magnitude" hint="d" value={edits.magnitude ?? draft.magnitude} changed={edits.magnitude !== undefined} />
        )}
        <Dial
          label="Confidence"
          hint={confidenceMode ? "press a digit…" : "c + digit"}
          value={confidence.toFixed(2)}
          changed={edits.confidence !== undefined}
          active={confidenceMode}
        />
        <Dial label="Polarity" hint="p" value={polarity === 1 ? "+1" : "−1"} changed={edits.polarity !== undefined} />
      </div>
    </div>
  );
}

function Dial({
  label, value, hint, changed, active,
}: {
  label: string;
  value: string;
  hint: string;
  changed: boolean;
  active?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
        {label} <span className="text-ink-3/70">{hint}</span>
      </p>
      <p
        className={cn(
          "font-mono text-base tabular-nums",
          active && "text-accent-ink",
          changed && "text-accent-ink",
        )}
      >
        {value}
        {changed ? " *" : ""}
      </p>
    </div>
  );
}

function KeyboardLegend({
  kind, show, onToggle,
}: {
  kind: "edge" | "exposure";
  show: boolean;
  onToggle: () => void;
}) {
  const keys: [string, string][] = [
    ["a / ⏎", "approve (with edits)"],
    ["x", "reject, then type a reason"],
    ["s / →", "skip"],
    ["←", "back"],
    ["u", "undo last decision"],
    ["p", "flip polarity"],
    ["c + digit", "confidence"],
    ["m", "edit text (Esc to exit)"],
    ...(kind === "edge"
      ? ([
          ["1–9, 0", "strength 0.1–1.0"],
          ["[ ]", "lag ∓1 day"],
          ["{ }", "lag ∓7 days"],
        ] as [string, string][])
      : ([["d", "cycle magnitude"]] as [string, string][])),
    ["?", "toggle this help"],
  ];

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        className="font-mono text-[11px] text-ink-3 hover:text-ink-2"
      >
        {show ? "hide" : "show"} keyboard shortcuts (?)
      </button>
      {show ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-rule bg-surface px-3 py-2.5 sm:grid-cols-3">
          {keys.map(([k, description]) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink">
                {k}
              </dt>
              <dd className="text-[11px] text-ink-2">{description}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
