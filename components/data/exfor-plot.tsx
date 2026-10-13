"use client"

import { useMemo, useRef, useState } from "react"

import { useWidth } from "@/components/rates/chart-kit"
import { energy, sig } from "@/lib/data/format"
import { fill } from "@/lib/data/fill"
import type { DataExpertStrings } from "@/lib/i18n"
import type { Lang } from "@/lib/locale"
import { axisFormatter, linearTicks, logTicks } from "@/lib/ticks"

/** One dataset ready to draw: E_cm (MeV), value in the plot's quantity, its uncertainty. */
export interface PlotSeries {
  id: string
  label: string
  partial: boolean
  E: number[]
  y: number[]
  dy: (number | null)[]
}

export interface PlotCurve {
  label: string
  E: number[]
  y: number[]
}

/**
 * The data of the selected datasets, S-factor or cross section against
 * E_cm, every point with its error bar. One colour for the data (they are
 * many; a dataset is identified by pointing at it, here or in the table, and
 * then drawn in the first series colour), the evaluation's R-matrix curve in
 * the second, the Gamow window as a band.
 */
export function ExforPlot({
  series,
  curves,
  window: w,
  quantity,
  logX,
  logY,
  highlight,
  onHighlight,
  strings,
  lang,
  svgRef,
}: {
  series: PlotSeries[]
  curves: PlotCurve[]
  window: { lo: number; hi: number; E0: number; label: string } | null
  quantity: "S" | "sigma"
  logX: boolean
  logY: boolean
  highlight: string | null
  onHighlight: (id: string | null) => void
  strings: DataExpertStrings
  lang: Lang
  svgRef?: React.Ref<SVGSVGElement>
}) {
  const t = strings.plot
  const [ref, width, k] = useWidth<HTMLDivElement>(760)
  const [tip, setTip] = useState<{ x: number; y: number; s: PlotSeries; i: number } | null>(null)
  const height = Math.max(300, Math.min(460, width * 0.62))
  const m = { l: width < 480 ? 54 : 64, r: 14, t: 14, b: 44 }
  const pw = width - m.l - m.r
  const ph = height - m.t - m.b

  const axes = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    for (const s of series)
      for (let i = 0; i < s.E.length; i++) {
        if (logX && !(s.E[i] > 0)) continue
        if (logY && !(s.y[i] > 0)) continue
        xs.push(s.E[i])
        ys.push(s.y[i])
      }
    for (const c of curves) {
      const ex = xs.length ? [Math.min(...xs), Math.max(...xs)] : [-Infinity, Infinity]
      for (let i = 0; i < c.E.length; i++) if (c.E[i] >= ex[0] && c.E[i] <= ex[1] && (!logY || c.y[i] > 0)) ys.push(c.y[i])
    }
    if (!xs.length) return null
    let x0 = Math.min(...xs)
    let x1 = Math.max(...xs)
    if (w && logX) {
      x0 = Math.min(x0, w.lo / 1000)
    }
    const sorted = [...ys].sort((a, b) => a - b)
    // robust y range: ignore the outer 0.5 % so one wild point does not flatten the rest
    const lo = sorted[Math.floor(sorted.length * 0.005)]
    const hi = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.995) - 1)]
    const xa = logX ? logTicks(x0, x1) : linearTicks(0, x1)
    const ya = logY ? logTicks(lo, hi) : linearTicks(Math.min(0, lo), hi * 1.05)
    return { xa, ya }
  }, [series, curves, logX, logY, w])

  const svgLocal = useRef<SVGSVGElement | null>(null)

  if (!axes) {
    return (
      <div ref={ref} className="flex min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t.nothing}
      </div>
    )
  }
  const { xa, ya } = axes
  const sx = (v: number) =>
    logX
      ? m.l + ((Math.log10(v) - Math.log10(xa.domain[0])) / (Math.log10(xa.domain[1]) - Math.log10(xa.domain[0]))) * pw
      : m.l + ((v - xa.domain[0]) / (xa.domain[1] - xa.domain[0])) * pw
  const sy = (v: number) =>
    logY
      ? m.t + ph - ((Math.log10(v) - Math.log10(ya.domain[0])) / (Math.log10(ya.domain[1]) - Math.log10(ya.domain[0]))) * ph
      : m.t + ph - ((v - ya.domain[0]) / (ya.domain[1] - ya.domain[0])) * ph
  const fx = axisFormatter(xa, logX, lang)
  const fy = axisFormatter(ya, logY, lang)
  const inX = (v: number) => (logX ? v > 0 : true) && v >= xa.domain[0] * (logX ? 0.999 : 1) && v <= xa.domain[1] * 1.001
  const yClamp = (v: number) => Math.max(m.t - 4, Math.min(m.t + ph + 4, sy(v)))
  const ok = (v: number) => (logY ? v > 0 : true) && Number.isFinite(v)

  const pathFor = (s: PlotSeries, r: number) => {
    let d = ""
    let bars = ""
    for (let i = 0; i < s.E.length; i++) {
      const E = s.E[i]
      const v = s.y[i]
      if (!inX(E) || !ok(v)) continue
      const X = sx(E)
      const Y = sy(v)
      if (Y < m.t - 2 || Y > m.t + ph + 2) continue
      d += s.partial ? `M${X - r} ${Y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0` : `M${X - r} ${Y - r}h${2 * r}v${2 * r}h${-2 * r}z`
      const e = s.dy[i]
      if (e && e > 0) {
        const top = yClamp(v + e)
        const bot = ok(v - e) ? yClamp(v - e) : m.t + ph
        bars += `M${X} ${top}V${bot}`
      }
    }
    return { d, bars }
  }

  const drawn = series.map((s) => ({ s, ...pathFor(s, s.id === highlight ? 3 : 2) }))
  const hl = drawn.find((x) => x.s.id === highlight)

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const box = ev.currentTarget.getBoundingClientRect()
    const px = (ev.clientX - box.left) / k
    const py = (ev.clientY - box.top) / k
    let best: { d: number; s: PlotSeries; i: number } | null = null
    for (const s of series)
      for (let i = 0; i < s.E.length; i++) {
        if (!inX(s.E[i]) || !ok(s.y[i])) continue
        const dx = sx(s.E[i]) - px
        const dy = sy(s.y[i]) - py
        const d2 = dx * dx + dy * dy
        if (d2 < 144 && (!best || d2 < best.d)) best = { d: d2, s, i }
      }
    if (best) {
      setTip({ x: px, y: py, s: best.s, i: best.i })
      if (best.s.id !== highlight) onHighlight(best.s.id)
    } else if (tip) setTip(null)
  }

  return (
    <div ref={ref} className="relative w-full">
      <svg
        ref={(el) => {
          svgLocal.current = el
          if (typeof svgRef === "function") svgRef(el)
          else if (svgRef && typeof svgRef === "object") (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = el
        }}
        role="img"
        aria-label={fill(t.caption, { reaction: "", n: series.reduce((a, s) => a + s.E.length, 0), d: series.length })}
        width={width * k}
        height={height * k}
        viewBox={`0 0 ${width} ${height}`}
        className="block max-w-full touch-pan-y"
        onPointerMove={onMove}
        onPointerLeave={() => {
          setTip(null)
          onHighlight(null)
        }}
      >
        <rect x={m.l} y={m.t} width={pw} height={ph} fill="none" stroke="var(--viz-axis)" />
        {w && inX(Math.max(w.lo / 1000, xa.domain[0])) && (
          <g>
            <rect
              x={sx(Math.max(w.lo / 1000, xa.domain[0]))}
              y={m.t}
              width={Math.max(2, sx(Math.min(w.hi / 1000, xa.domain[1])) - sx(Math.max(w.lo / 1000, xa.domain[0])))}
              height={ph}
              fill="var(--viz-text)"
              fillOpacity={0.07}
            />
            <text x={sx(Math.max(w.lo / 1000, xa.domain[0])) + 4} y={m.t + 14} fontSize={11} fill="var(--viz-text-muted)">
              {w.label}
            </text>
          </g>
        )}
        {xa.ticks.map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={m.t} y2={m.t + ph} stroke="var(--viz-grid)" />
            <text x={sx(v)} y={m.t + ph + 16} textAnchor="middle" fontSize={11} fill="var(--viz-text-muted)">
              {fx(v)}
            </text>
          </g>
        ))}
        {ya.ticks.map((v) => (
          <g key={`y${v}`}>
            <line x1={m.l} x2={m.l + pw} y1={sy(v)} y2={sy(v)} stroke="var(--viz-grid)" />
            <text x={m.l - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--viz-text-muted)">
              {fy(v)}
            </text>
          </g>
        ))}
        <text x={m.l + pw / 2} y={height - 8} textAnchor="middle" fontSize={12} fill="var(--viz-text)">
          {t.eAxis}
        </text>
        <text transform={`translate(13 ${m.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--viz-text)">
          {quantity === "S" ? t.sAxis : t.sigmaAxis}
        </text>
        <g clipPath="url(#exfor-plot-clip)">
          <clipPath id="exfor-plot-clip">
            <rect x={m.l} y={m.t} width={pw} height={ph} />
          </clipPath>
          {drawn.map(({ s, d, bars }) =>
            s.id === highlight ? null : (
              <g key={s.id}>
                <path d={bars} stroke="var(--viz-text-muted)" strokeOpacity={0.45} strokeWidth={1} fill="none" />
                <path d={d} fill={s.partial ? "none" : "var(--viz-text-muted)"} fillOpacity={0.55} stroke="var(--viz-text-muted)" strokeOpacity={0.7} strokeWidth={s.partial ? 1 : 0} />
              </g>
            ),
          )}
          {curves.map((c, j) => {
            let d = ""
            for (let i = 0; i < c.E.length; i++) {
              if (!inX(c.E[i]) || !ok(c.y[i])) continue
              d += `${d ? "L" : "M"}${sx(c.E[i]).toFixed(1)} ${yClamp(c.y[i]).toFixed(1)}`
            }
            return <path key={j} d={d} fill="none" stroke="var(--viz-series-2)" strokeWidth={2} />
          })}
          {hl && (
            <g>
              <path d={hl.bars} stroke="var(--viz-series-1)" strokeWidth={1.4} fill="none" />
              <path d={hl.d} fill={hl.s.partial ? "var(--viz-surface)" : "var(--viz-series-1)"} stroke="var(--viz-series-1)" strokeWidth={hl.s.partial ? 1.4 : 0} />
            </g>
          )}
        </g>
      </svg>
      {tip && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 max-w-[18rem] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.max(0, Math.min(tip.x * k + 10, width * k - 230)), top: tip.y * k + 12 }}
        >
          <p className="font-medium">{tip.s.label}</p>
          <p className="tabular text-muted-foreground">
            E = {energy(tip.s.E[tip.i] * 1000, lang, 4)} · {sig(tip.s.y[tip.i], 3)}
            {tip.s.dy[tip.i] ? ` ± ${sig(tip.s.dy[tip.i] as number, 2)}` : ""} {quantity === "S" ? "MeV b" : "b"}
          </p>
        </div>
      )}
    </div>
  )
}
