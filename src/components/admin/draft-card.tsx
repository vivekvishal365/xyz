import type { Draft } from "@/lib/graph/review";
import {
  confidenceBand,
  describeEdge,
  describeExposure,
  describeLag,
  magnitudeBand,
  strengthBand,
  type Band,
} from "@/lib/graph/format";
import { NodePanel } from "./node-panel";
import { cn } from "@/lib/utils";

export type CardEdits = {
  strength?: number;
  lagDays?: number;
  confidence?: number;
  polarity?: -1 | 1;
  magnitude?: string;
  text?: string;
};

/**
 * One item, framed as a sentence rather than a row of numbers.
 *
 * The card previously led with `polarity: −1`, which reviewers read as "this
 * is going down" — a forecast the graph never makes. Every edge is
 * CONDITIONAL, so the headline is now "When X rises → …". The driver's own
 * direction comes from observed data elsewhere and is not being judged here.
 *
 * Each control also states the question it answers. "Strength" and
 * "confidence" are easy to conflate, and a reviewer who is guessing at what a
 * field means is a reviewer producing noise.
 */
export function DraftCard({
  draft,
  edits,
  editingText,
  textAreaRef,
  onTextChange,
  confidenceMode,
}: {
  draft: Draft;
  edits: CardEdits;
  editingText: boolean;
  textAreaRef: React.RefObject<HTMLTextAreaElement | null>;
  onTextChange: (value: string) => void;
  confidenceMode: boolean;
}) {
  const isEdge = draft.kind === "edge";
  const driverNode = isEdge ? draft.from : draft.driver;
  const targetNode = isEdge ? draft.to : draft.company;

  const polarity = edits.polarity ?? (isEdge ? draft.polarity : draft.direction);
  const confidence = edits.confidence ?? draft.confidence;
  const text = edits.text ?? (isEdge ? draft.mechanism : draft.rationale);
  const changed = Object.keys(edits).length > 0;

  const phrase = isEdge
    ? describeEdge(driverNode.name, targetNode.name, polarity)
    : describeExposure(driverNode.name, targetNode.name, polarity);

  const goesUp = phrase.direction === "up";

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

      {/* The claim, in one sentence. */}
      <div className="border-b border-rule px-4 py-3.5">
        <p className="text-balance text-lg leading-snug">
          <span className="text-ink-3">When </span>
          <span className="font-semibold">{phrase.driver}</span>
          <span className="text-ink-3"> rises</span>
          <span className="text-ink-3">, it {phrase.verb} </span>
          <span className="font-semibold">{phrase.target}</span>
          {phrase.qualifier ? (
            <>
              {" "}
              <span
                className={cn("font-semibold", goesUp ? "text-sev-low" : "text-sev-high")}
              >
                {phrase.qualifier}
              </span>
            </>
          ) : null}
          <span className={cn("ml-1.5 font-mono", goesUp ? "text-sev-low" : "text-sev-high")}>
            {goesUp ? "▲" : "▼"}
          </span>
        </p>
        <p className="mt-1.5 font-mono text-[10px] text-ink-3">
          Conditional — nothing here says {phrase.driver} <em>will</em> rise. Press{" "}
          <kbd className="rounded bg-surface-2 px-1">p</kbd> to flip the direction.
        </p>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-2 px-3 py-3 sm:grid-cols-[1fr_auto_1fr]">
        <NodePanel node={driverNode} role="Driver" accent />
        <div className="flex items-center justify-center px-1">
          <span
            className={cn("font-mono text-sm", goesUp ? "text-sev-low" : "text-sev-high")}
            aria-hidden
          >
            →
          </span>
        </div>
        <NodePanel node={targetNode} role={isEdge ? "Affects" : "Company"} />
      </div>

      <div className="border-t border-rule px-3 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
          {isEdge ? "Why — the transmission channel" : "Why — the exposure"} · press m to edit
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

      <div className="grid grid-cols-1 gap-3 border-t border-rule px-3 py-3 sm:grid-cols-3">
        {isEdge ? (
          <Meter
            question="How much?"
            band={strengthBand(edits.strength ?? draft.strength)}
            value={(edits.strength ?? draft.strength).toFixed(2)}
            keys="1–9, 0"
            changed={edits.strength !== undefined}
          />
        ) : (
          <Meter
            question="How much?"
            band={magnitudeBand(edits.magnitude ?? draft.magnitude)}
            value={edits.magnitude ?? draft.magnitude}
            keys="d"
            changed={edits.magnitude !== undefined}
          />
        )}

        {isEdge ? (
          <Fact
            question="How fast?"
            headline={describeLag(edits.lagDays ?? draft.lagDays)}
            detail={`${edits.lagDays ?? draft.lagDays} days until it shows up`}
            keys="[ ] · { }"
            changed={edits.lagDays !== undefined}
          />
        ) : (
          <Fact
            question="Applies to"
            headline={targetNode.subtitle ?? "Company"}
            detail="the company's own economics"
            keys=""
            changed={false}
          />
        )}

        <Meter
          question="How sure?"
          band={confidenceBand(confidence)}
          value={confidence.toFixed(2)}
          keys={confidenceMode ? "press a digit…" : "c + digit"}
          changed={edits.confidence !== undefined}
          active={confidenceMode}
        />
      </div>
    </div>
  );
}

function Meter({
  question,
  band,
  value,
  keys,
  changed,
  active,
}: {
  question: string;
  band: Band;
  value: string;
  keys: string;
  changed: boolean;
  active?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
        {question} <span className="text-ink-3/70">{keys}</span>
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold",
          (active || changed) && "text-accent-ink",
        )}
      >
        {band.label}
        <span className="ml-1.5 font-mono text-xs font-normal text-ink-3">{value}</span>
        {changed ? <span className="ml-0.5 font-mono text-xs text-accent-ink">*</span> : null}
      </p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-surface-2">
        <div
          className={cn("h-full", active || changed ? "bg-accent-ink" : "bg-accent")}
          style={{ width: `${Math.round(band.fraction * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] leading-snug text-ink-3">{band.hint}</p>
    </div>
  );
}

function Fact({
  question,
  headline,
  detail,
  keys,
  changed,
}: {
  question: string;
  headline: string;
  detail: string;
  keys: string;
  changed: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
        {question} <span className="text-ink-3/70">{keys}</span>
      </p>
      <p className={cn("mt-0.5 text-sm font-semibold", changed && "text-accent-ink")}>
        {headline}
        {changed ? <span className="ml-0.5 font-mono text-xs">*</span> : null}
      </p>
      <div className="mt-1 h-1 w-full rounded bg-surface-2" />
      <p className="mt-1 text-[10px] leading-snug text-ink-3">{detail}</p>
    </div>
  );
}
