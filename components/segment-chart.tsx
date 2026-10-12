"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useDict, useLang } from "@/components/lang-provider"
import { axisFormatter, linearTicks, logTicks, type Axis } from "@/lib/ticks"
import { formatNumber, seriesShape } from "@/lib/viz"

/**
 * One pair of axes holding measured points (with error bars) and the model
 * curve calculated on the same grid.
 *
 * Recharts needs every series in one array of rows, so points are merged on the
 * x value: each dataset contributes `d<slot>`/`e<slot>` (measurement, error) and
 * each model curve a `m<slot>` column.
 *
 * Both axes get explicit round ticks (lib/ticks.ts): left to itself recharts
 * puts them on the data values or on arbitrary fractions of the range.
 */

export interface ChartSeries {
  label: string
  points: { x: number; y: number; error?: number }[]
  curve: { x: number; y: number }[]
}

interface Props {
  series: ChartSeries[]
  xLabel: string
  yLabel: string
  logX: boolean
  logY: boolean
  /** Fixed height in px; otherwise the parent's height (set it with CSS). */
  height?: number
  showLegend?: boolean
  /** What the chart shows, for screen readers (the SVG is one image). */
  ariaLabel?: string
}

interface Row {
  x: number
  [key: string]: number | undefined
}

function axisFor(values: number[], log: boolean): Axis | null {
  const usable = log ? values.filter((v) => v > 0) : values
  if (usable.length === 0) return null
  let lo = Infinity
  let hi = -Infinity
  for (const v of usable) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return log ? logTicks(lo, hi) : linearTicks(lo, hi, 6)
}

export function SegmentChart({
  series,
  xLabel,
  yLabel,
  logX,
  logY,
  height,
  showLegend = true,
  ariaLabel,
}: Props) {
  const lang = useLang()
  const t = useDict().workspace
  const rows = useMemo<Row[]>(() => {
    const byX = new Map<number, Row>()
    const at = (x: number) => {
      let row = byX.get(x)
      if (!row) {
        row = { x }
        byX.set(x, row)
      }
      return row
    }

    series.forEach((entry, slot) => {
      for (const point of entry.points) {
        if (!Number.isFinite(point.y) || !Number.isFinite(point.x)) continue
        if (logY && point.y <= 0) continue
        if (logX && point.x <= 0) continue
        const row = at(point.x)
        row[`d${slot}`] = point.y
        if (point.error !== undefined && point.error > 0) {
          row[`e${slot}`] = point.error
        }
      }
      for (const point of entry.curve) {
        if (!Number.isFinite(point.y) || !Number.isFinite(point.x)) continue
        if (logY && point.y <= 0) continue
        if (logX && point.x <= 0) continue
        at(point.x)[`m${slot}`] = point.y
      }
    })

    return [...byX.values()].sort((a, b) => a.x - b.x)
  }, [series, logX, logY])

  const { xAxis, yAxis } = useMemo(() => {
    const xs = rows.map((r) => r.x)
    const ys: number[] = []
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value !== "number") continue
        if (key.startsWith("d") || key.startsWith("m")) {
          ys.push(value)
          // Keep error bars inside the frame (on a log axis only the upper
          // end: the lower one can reach zero).
          const error = key.startsWith("d") ? row[`e${key.slice(1)}`] : undefined
          if (typeof error === "number") {
            ys.push(value + error)
            if (!logY) ys.push(value - error)
          }
        }
      }
    }
    return { xAxis: axisFor(xs, logX), yAxis: axisFor(ys, logY) }
  }, [rows, logX, logY])

  const frame = height ? { height } : undefined

  if (rows.length === 0 || !xAxis || !yAxis) {
    return (
      <div
        className="flex h-full min-h-[12rem] items-center justify-center text-sm text-muted-foreground"
        style={frame}
      >
        {t.nothingToPlot}
      </div>
    )
  }

  return (
    <div role="img" aria-label={ariaLabel ?? `${yLabel} / ${xLabel}`} className="h-full w-full" style={frame}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
          <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            scale={logX ? "log" : "linear"}
            domain={xAxis.domain}
            ticks={xAxis.ticks}
            allowDataOverflow
            tickFormatter={axisFormatter(xAxis, logX, lang)}
            stroke="var(--viz-axis)"
            tick={{ fill: "var(--viz-text-muted)", fontSize: 11 }}
            label={{
              value: xLabel,
              position: "insideBottom",
              offset: -16,
              fill: "var(--viz-text)",
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            scale={logY ? "log" : "linear"}
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            allowDataOverflow
            tickFormatter={axisFormatter(yAxis, logY, lang)}
            stroke="var(--viz-axis)"
            tick={{ fill: "var(--viz-text-muted)", fontSize: 11 }}
            width={64}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              fill: "var(--viz-text)",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--viz-surface)",
              border: "1px solid var(--viz-grid)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(value) => `${xLabel}: ${formatNumber(Number(value))}`}
            formatter={(value: number, name: string) => [formatNumber(value), name]}
          />
          {showLegend && series.length > 1 && (
            <Legend
              verticalAlign="top"
              height={32}
              wrapperStyle={{ fontSize: 12, color: "var(--viz-text)" }}
            />
          )}

          {series.map((entry, slot) => (
            <Scatter
              key={`points-${slot}`}
              dataKey={`d${slot}`}
              name={entry.label}
              fill={`var(--viz-series-${slot + 1})`}
              shape={seriesShape(slot)}
              isAnimationActive={false}
            >
              <ErrorBar
                dataKey={`e${slot}`}
                stroke={`var(--viz-series-${slot + 1})`}
                strokeWidth={1}
                width={0}
              />
            </Scatter>
          ))}

          {series.map((entry, slot) => (
            <Line
              key={`curve-${slot}`}
              type="monotone"
              dataKey={`m${slot}`}
              name={`${entry.label} (${t.model})`}
              stroke={`var(--viz-series-${slot + 1})`}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
