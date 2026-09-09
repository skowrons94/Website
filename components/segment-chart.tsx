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

import { formatNumber, seriesColor, seriesShape } from "@/lib/viz"

/**
 * One pair of axes holding measured points (with error bars) and the model
 * curve calculated on the same grid.
 *
 * Recharts needs every series in one array of rows, so points are merged on the
 * x value: each dataset contributes `d<slot>`/`e<slot>` (measurement, error) and
 * each model curve a `m<slot>` column.
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
  height?: number
  showLegend?: boolean
}

interface Row {
  x: number
  [key: string]: number | undefined
}

export function SegmentChart({
  series,
  xLabel,
  yLabel,
  logX,
  logY,
  height = 420,
  showLegend = true,
}: Props) {
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
        if (logY && point.y <= 0) continue
        if (logX && point.x <= 0) continue
        const row = at(point.x)
        row[`d${slot}`] = point.y
        if (point.error !== undefined && point.error > 0) {
          row[`e${slot}`] = point.error
        }
      }
      for (const point of entry.curve) {
        if (logY && point.y <= 0) continue
        if (logX && point.x <= 0) continue
        at(point.x)[`m${slot}`] = point.y
      }
    })

    return [...byX.values()].sort((a, b) => a.x - b.x)
  }, [series, logX, logY])

  // Log axes need an explicit domain; recharts' "auto" produces a linear-ish
  // range that clips the decades a cross section actually spans.
  const yDomain = useMemo<[number | string, number | string]>(() => {
    if (!logY) return ["auto", "auto"]
    let lo = Infinity
    let hi = -Infinity
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (key === "x" || key.startsWith("e") || typeof value !== "number")
          continue
        if (value > 0) {
          lo = Math.min(lo, value)
          hi = Math.max(hi, value)
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return ["auto", "auto"]
    return [lo * 0.5, hi * 2]
  }, [rows, logY])

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Nothing to plot — a log axis hides non-positive values.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
        <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="3 3" />
        <XAxis
          dataKey="x"
          type="number"
          scale={logX ? "log" : "linear"}
          domain={logX ? ["auto", "auto"] : ["dataMin", "dataMax"]}
          tickFormatter={(value: number) => formatNumber(value)}
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
          domain={yDomain}
          tickFormatter={(value: number) => formatNumber(value)}
          stroke="var(--viz-axis)"
          tick={{ fill: "var(--viz-text-muted)", fontSize: 11 }}
          width={78}
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
            name={`${entry.label} (model)`}
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
  )
}
