"use client"

import { useRef, useState } from "react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import { DASHES, SERIES, SvgSci, decades, logScale, useWidth } from "./chart-kit"
import { pow10, sci, shortTime, YEAR_S } from "./format"

export interface EvolutionSeries {
  name: string
  label: string
  slot: number
  /** with the reader's changes */
  t: number[]
  X: number[]
  /** unchanged, dashed, when different */
  baseT?: number[]
  baseX?: number[]
}

const TIME_TICKS = [1e-3, 1, 60, 3600, 86400, YEAR_S, 1e3 * YEAR_S, 1e6 * YEAR_S, 1e9 * YEAR_S, 1e12 * YEAR_S]

/**
 * Mass fractions against time, log–log: one line per chosen nucleus in its
 * own colour (and dash), the unchanged burn as a thin faded line beside it.
 */
export function EvolutionChart({
  series,
  lang,
  label,
  xLabel,
  yLabel,
}: {
  series: EvolutionSeries[]
  lang: Lang
  label: string
  xLabel: string
  yLabel: string
}) {
  const [box, width] = useWidth<HTMLDivElement>()
  const narrow = width < 520
  const height = narrow ? 260 : 320
  // The nuclide names are drawn at the right end of their lines on every
  // width, so a phone keeps room for them too ("²⁶Al", 12 px).
  const m = { l: narrow ? 44 : 56, r: narrow ? 40 : 70, t: 14, b: 42 }
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  let tMin = Infinity
  let tMax = 0
  let yMax = 0
  let yMin = Infinity
  for (const s of series) {
    const all: [number[], number[]][] = [[s.t, s.X]]
    if (s.baseT && s.baseX) all.push([s.baseT, s.baseX])
    for (const [ts, xs] of all)
      ts.forEach((t, i) => {
        if (t > 0) {
          tMin = Math.min(tMin, t)
          tMax = Math.max(tMax, t)
        }
        if (xs[i] > yMax) yMax = xs[i]
        if (xs[i] > 0 && xs[i] < yMin) yMin = xs[i]
      })
  }
  if (!(tMax > 0) || !(yMax > 0)) return <div ref={box} />
  yMin = Math.max(yMin, yMax * 1e-14)
  const x = logScale(tMin, tMax, m.l, width - m.r, false)
  const y = logScale(yMin, yMax, height - m.b, m.t)
  const yt = decades(y.lo, y.hi, narrow ? 5 : 7)
  let xt = TIME_TICKS.filter((t) => t >= tMin && t <= tMax)
  if (xt.length > (narrow ? 4 : 7)) xt = xt.filter((_, i) => i % 2 === 0)

  const path = (ts: number[], xs: number[]) => {
    let d = ""
    let pen = false
    ts.forEach((t, i) => {
      const v = xs[i]
      if (!(t > 0) || !(v >= y.lo)) {
        pen = false
        return
      }
      d += `${pen ? "L" : "M"}${x.px(t).toFixed(1)},${y.px(Math.min(v, y.hi)).toFixed(1)}`
      pen = true
    })
    return d
  }

  const ends = series
    .map((s) => {
      let i = s.t.length - 1
      while (i > 0 && !(s.X[i] >= y.lo)) i--
      return { s, py: y.px(Math.min(Math.max(s.X[i], y.lo), y.hi)) }
    })
    .sort((a, b) => a.py - b.py)
  for (let i = 1; i < ends.length; i++) if (ends[i].py - ends[i - 1].py < 15) ends[i].py = ends[i - 1].py + 15

  const at = (s: EvolutionSeries, t: number) => {
    let best = 0
    for (let i = 0; i < s.t.length; i++)
      if (Math.abs(Math.log(s.t[i] / t)) < Math.abs(Math.log(s.t[best] / t))) best = i
    return s.X[best]
  }

  return (
    <div ref={box} className="relative">
      <svg
        ref={svgRef}
        role="img"
        aria-label={label}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block touch-pan-y select-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerMove={(e) => {
          const rect = svgRef.current?.getBoundingClientRect()
          if (!rect) return
          const px = ((e.clientX - rect.left) / rect.width) * width
          setHover(px >= m.l && px <= width - m.r ? x.inv(px) : null)
        }}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          const step = (tMax / tMin) ** (1 / 40)
          const cur = hover ?? Math.sqrt(tMin * tMax)
          if (e.key === "ArrowRight") setHover(Math.min(tMax, cur * step))
          else if (e.key === "ArrowLeft") setHover(Math.max(tMin, cur / step))
          else if (e.key === "Escape") setHover(null)
          else return
          e.preventDefault()
        }}
      >
        {yt.map((e) => (
          <g key={e}>
            <line x1={m.l} x2={width - m.r} y1={y.px(10 ** e)} y2={y.px(10 ** e)} stroke="var(--viz-grid)" />
            <text x={m.l - 6} y={y.px(10 ** e)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-text-muted)">
              <SvgSci>{pow10(e)}</SvgSci>
            </text>
          </g>
        ))}
        {xt.map((t) => (
          <g key={t}>
            <line x1={x.px(t)} x2={x.px(t)} y1={m.t} y2={height - m.b} stroke="var(--viz-grid)" />
            <text x={x.px(t)} y={height - m.b + 16} textAnchor="middle" fontSize={11} fill="var(--viz-text-muted)">
              {shortTime(t, lang)}
            </text>
          </g>
        ))}
        <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke="var(--viz-axis)" />
        <text x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle" fontSize={12} fill="var(--viz-text-muted)">
          {xLabel}
        </text>
        <text
          transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={12}
          fill="var(--viz-text-muted)"
        >
          {yLabel}
        </text>
        {series.map((s) =>
          s.baseT && s.baseX ? (
            <path
              key={`b${s.name}`}
              d={path(s.baseT, s.baseX)}
              fill="none"
              stroke={SERIES[s.slot]}
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ) : null,
        )}
        {series.map((s) => (
          <path
            key={s.name}
            d={path(s.t, s.X)}
            fill="none"
            stroke={SERIES[s.slot]}
            strokeWidth={2}
            strokeDasharray={s.baseT ? undefined : DASHES[s.slot] || undefined}
            strokeLinejoin="round"
          />
        ))}
        {ends.map(({ s, py }) => (
          <text key={s.name} x={width - m.r + 6} y={py} dy="0.32em" fontSize={12} fill="var(--viz-text)">
            <SvgSci>{s.label}</SvgSci>
          </text>
        ))}
        {hover !== null && (
          <line x1={x.px(hover)} x2={x.px(hover)} y1={m.t} y2={height - m.b} stroke="var(--viz-text-muted)" />
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-4 z-10 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={x.px(hover) > width / 2 ? { right: width - x.px(hover) + 12 } : { left: x.px(hover) + 12 }}
        >
          <p className="font-medium">{shortTime(hover, lang)}</p>
          <ul className="mt-1 space-y-0.5">
            {series.map((s) => (
              <li key={s.name} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES[s.slot] }} />
                  <span>
                    <Sci>{s.label}</Sci>
                  </span>
                </span>
                <span className="tabular text-muted-foreground">{sci(at(s, hover), lang, 3)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
