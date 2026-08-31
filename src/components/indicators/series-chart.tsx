"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/indicators/detail";
import { cn } from "@/lib/utils";

/**
 * PRD §38: information-dense, no casino styling, no flashing. One line, one
 * accent colour, muted gridlines. The estimate is drawn as a distinct point
 * rather than an extension of the line — it is not an observation, and drawing
 * it as one would blur exactly the fact/interpretation boundary §27 requires.
 */

const RANGES = [
  { label: "1Y", days: 365 },
  { label: "5Y", days: 365 * 5 },
  { label: "Max", days: Number.POSITIVE_INFINITY },
] as const;

export function SeriesChart({
  series,
  unit,
  estimate,
}: {
  series: SeriesPoint[];
  unit: string;
  estimate: { value: number; periodEnd: string; errorMae: number | null } | null;
}) {
  const [rangeIndex, setRangeIndex] = useState(series.length > 400 ? 0 : 2);
  const range = RANGES[rangeIndex] ?? RANGES[2];

  const data = useMemo(() => {
    if (!Number.isFinite(range.days)) return series;

    // Windowed from the last OBSERVATION, not from today. A series that stopped
    // updating two months ago would otherwise render a mostly-empty chart, and
    // reading wall-clock time here would make the render impure — different
    // output on server and client, for no benefit.
    const end = series.at(-1);
    if (!end) return series;

    const cutoff = new Date(`${end.periodEnd}T00:00:00Z`).getTime() - range.days * 86_400_000;
    const filtered = series.filter((p) => new Date(`${p.periodEnd}T00:00:00Z`).getTime() >= cutoff);
    return filtered.length > 1 ? filtered : series;
  }, [series, range.days]);

  const decimals = useMemo(() => decimalsFor(data), [data]);

  const showEstimate = estimate !== null && Number.isFinite(estimate.value) && data.length > 0;

  /**
   * The estimate is for the period AFTER the last observation, so it gets its
   * own x position rather than being drawn on top of the final data point.
   * Sharing an x would place a forecast where an observation is, which is
   * exactly the fact/interpretation blur §27 asks us to avoid.
   *
   * The appended row has a null `value`, so the observed line stops at the last
   * real point instead of running through the forecast.
   */
  const chartData = useMemo(() => {
    if (!showEstimate) return data.map((point) => ({ ...point, estimate: null }));
    return [
      ...data.map((point) => ({ ...point, estimate: null as number | null })),
      { periodEnd: estimate.periodEnd, value: null as number | null, estimate: estimate.value },
    ];
  }, [data, showEstimate, estimate]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
          {data.length.toLocaleString("en-IN")} observations · {unit}
        </p>
        <div className="flex gap-1" role="group" aria-label="Chart range">
          {RANGES.map((option, index) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setRangeIndex(index)}
              aria-pressed={index === rangeIndex}
              className={cn(
                "rounded px-2 py-1 font-mono text-[11px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                index === rangeIndex
                  ? "bg-accent-bg text-accent-ink"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink-2",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[19rem] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--color-rule)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="periodEnd"
              tick={{ fill: "var(--color-ink-3)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-rule)" }}
              minTickGap={48}
              tickFormatter={formatAxisDate}
            />
            <YAxis
              tick={{ fill: "var(--color-ink-3)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => formatNumber(value, decimals)}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-ink-3)", strokeDasharray: "2 3" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-rule)",
                borderRadius: 3,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-ink-3)", fontSize: 11 }}
              formatter={(value, name) =>
                typeof value === "number"
                  ? [`${formatNumber(value, decimals)} ${unit}`, String(name)]
                  : // Skip the null series so the tooltip does not show an
                    // empty "estimate" row on every observed point.
                    []
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-accent)"
              strokeWidth={1.6}
              dot={false}
              activeDot={{ r: 3, fill: "var(--color-accent)" }}
              isAnimationActive={false}
              connectNulls={false}
              name="Observed"
            />
            {/* Hollow marker, visually distinct from the observed line. */}
            <Line
              dataKey="estimate"
              stroke="none"
              isAnimationActive={false}
              name="SignalX estimate"
              dot={{
                r: 3.5,
                fill: "var(--color-surface)",
                stroke: "var(--color-accent-ink)",
                strokeWidth: 1.6,
              }}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showEstimate ? (
        <p className="mt-2 font-mono text-[11px] text-ink-3">
          ○ SignalX estimate for {estimate.periodEnd}
          {estimate.errorMae !== null
            ? ` · ±${formatNumber(estimate.errorMae, decimals)} typical error`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Pick decimals from the data's own spread. A yield moving 0.04 needs three
 * decimals; a copper price at 13,542 needs none, and showing it to three is
 * false precision.
 */
function decimalsFor(data: SeriesPoint[]): number {
  if (data.length === 0) return 2;
  const values = data.map((d) => d.value);
  const spread = Math.max(...values) - Math.min(...values);
  if (spread === 0) return 2;
  if (spread >= 1000) return 0;
  if (spread >= 10) return 1;
  if (spread >= 1) return 2;
  return 3;
}

function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}
