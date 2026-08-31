import type { EstimateDetail } from "@/lib/indicators/detail";
import type { Surprise } from "@/lib/engine/forecast/surprise";
import { describeExpectation } from "@/lib/engine/forecast/surprise";

/**
 * The SignalX estimate, D1's rules made visible.
 *
 * Three things this must never do: call itself "Expected" (that reads as
 * analyst consensus, which it is not), show a number without its measured
 * error, or hide the fact that there is no estimate. The last case is the one
 * worth designing properly — "no estimate" is a real, defensible outcome and it
 * gets the same space as a number, with the evidence for the refusal.
 */
export function EstimatePanel({
  estimate,
  surprise,
  unit,
}: {
  estimate: EstimateDetail | null;
  surprise: Surprise | null;
  unit: string;
}) {
  const hasEstimate = estimate !== null && Number.isFinite(estimate.expected);

  return (
    <section className="rounded border border-rule bg-surface">
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
          {describeExpectation("model")}
        </h2>
        {hasEstimate ? (
          <span className="font-mono text-[11px] text-ink-3">for {estimate.forPeriodEnd}</span>
        ) : null}
      </header>

      <div className="px-4 py-4">
        {hasEstimate ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums tracking-tight">
                {estimate.expected.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              <span className="text-sm text-ink-3">{unit}</span>
            </div>

            {estimate.errorMae !== null ? (
              <p className="mt-1.5 font-mono text-xs text-ink-2">
                ± {estimate.errorMae.toLocaleString("en-IN", { maximumFractionDigits: 3 })} typical
                error · {estimate.method}
              </p>
            ) : null}

            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              Produced by a SignalX statistical model, not an analyst consensus. The figure is the{" "}
              {estimate.method} baseline over this indicator&apos;s own history, and the error is
              that model&apos;s mean absolute error in backtest.
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold tracking-tight">No estimate</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
              No model beat carrying the last value forward on this series, so SignalX publishes
              nothing rather than a figure it cannot stand behind.
            </p>
          </>
        )}

        {surprise ? <SurpriseRow surprise={surprise} unit={unit} /> : null}
      </div>

      {estimate && estimate.models.length > 0 ? (
        <div className="border-t border-rule px-4 py-3">
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            Model comparison
          </h3>
          {/*
            Three columns, not four. The panel is ~20rem wide and a fourth
            column pushed `n` off-screen behind a scrollbar, which is a good way
            to hide evidence — so the sample size moves under the method name
            instead.
          */}
          <ul className="flex flex-col gap-2">
            {estimate.models.map((model) => {
              const selected = model.method === estimate.method;
              const isBaseline = model.method === "naive";

              return (
                <li
                  key={model.method}
                  className="flex items-baseline justify-between gap-3 border-t border-rule pt-2 first:border-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <p
                      className={`truncate font-mono text-xs ${selected ? "text-accent-ink" : "text-ink-2"}`}
                    >
                      {model.method}
                      {selected ? " ●" : ""}
                    </p>
                    <p className="font-mono text-[10px] text-ink-3">
                      {model.untrustedReason
                        ? model.untrustedReason
                        : `${model.n ?? "—"} points evaluated`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right font-mono text-xs tabular-nums">
                    <p>{model.mae === null ? "—" : model.mae.toFixed(3)}</p>
                    <p className="text-[10px]">
                      {isBaseline ? (
                        <span className="text-ink-3">baseline</span>
                      ) : model.relativeSkill === null ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span className={model.relativeSkill > 0 ? "text-sev-low" : "text-ink-3"}>
                          {model.relativeSkill > 0 ? "+" : ""}
                          {(model.relativeSkill * 100).toFixed(1)}% vs base
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
            Every method is scored over the same window by rolling-origin backtest, with no future
            data reaching any forecast. A method is only usable if it beats carrying the last value
            forward.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SurpriseRow({ surprise, unit }: { surprise: Surprise; unit: string }) {
  const tone =
    surprise.significance === "none"
      ? "text-ink-2"
      : surprise.significance === "notable"
        ? "text-sev-med"
        : "text-sev-high";

  return (
    <div className="mt-4 border-t border-rule pt-3">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">Surprise</h3>
      <p className={`mt-1 text-sm ${tone}`}>
        <span className="font-mono tabular-nums">
          {surprise.delta > 0 ? "+" : ""}
          {surprise.delta.toLocaleString("en-IN", { maximumFractionDigits: 3 })} {unit}
        </span>{" "}
        · {Math.abs(surprise.score).toFixed(1)}× typical error ·{" "}
        <span className="uppercase">{surprise.significance}</span>
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
        Measured in multiples of the model&apos;s own error rather than raw {unit}, so a routine
        miss does not read as news.
      </p>
    </div>
  );
}
