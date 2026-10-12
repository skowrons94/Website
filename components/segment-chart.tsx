"use client"

import { memo, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react"

import { useLang } from "@/components/lang-context"
import { useEvalDict } from "@/components/eval-dict"
import { Sci } from "@/components/sci"
import { numberText, type PlotPoint } from "@/lib/eval-plot"
import { axisFormatter, linearTicks, logTicks, type Axis } from "@/lib/ticks"
import { seriesShape } from "@/lib/viz"

/**
 * One pair of axes: measured points with error bars, the model on top of
 * them, and optionally the model as it was before an edit (a faint dashed
 * line) and shaded x bands (the Gamow window).
 *
 * Drawn as plain SVG rather than through a chart library, because what a
 * reader needs from it is specific: the model line above dense markers, a
 * domain fitted to the data rather than to whole decades, a tooltip beside the
 * cursor that names the point, its uncertainty and its pull, brush-zoom with a
 * double-click reset, and an SVG that can be saved as it is.
 *
 * Colour: the measured points carry the series hue (≤ 3, lib/viz.ts) and are
 * drawn above the lines with a thin surface-coloured halo; the model is drawn
 * in ink (one line per distinct calculation, told apart by dash when there are
 * several). A curve-only series (an extrapolation) is drawn in its hue.
 */

export interface ChartSeries {
  label: string
  /** Colour slot, 0–2. */
  slot?: number
  points: PlotPoint[]
  curve: { x: number; y: number }[]
  /** The model before the current edit, drawn faint behind. */
  original?: { x: number; y: number }[]
  /** The model beyond the data (below and above, a NaN between): dashed, lighter. */
  extension?: { x: number; y: number }[]
  /** Drawn faded: a curve about to be replaced (its parameters have changed). */
  faded?: boolean
  /** Dash pattern of the curve ("" solid); by default by series order. */
  dash?: string
}

export interface ChartBand {
  x0: number
  x1: number
  label: string
}

interface Props {
  series: ChartSeries[]
  xLabel: string
  yLabel: string
  logX: boolean
  logY: boolean
  /** Fixed height in px; otherwise the parent's height (set it with CSS). */
  height?: number
  /** What the chart shows, for screen readers (the SVG is one image). */
  ariaLabel?: string
  /** A line at y = 0 (residuals). */
  zeroLine?: boolean
  /** A short strip under another chart: no x-axis title, tighter margins. */
  compact?: boolean
  /** The visible x range (zoom); null or absent: fitted to everything. */
  xDomain?: [number, number] | null
  /** Called with a brushed range, or null on double-click (reset). */
  onXDomain?: (domain: [number, number] | null) => void
  /** A shared y range (small multiples); otherwise fitted to what is visible. */
  yDomain?: [number, number] | null
  bands?: ChartBand[]
  /** A labelled marker on the curve (S at the lowest energy). */
  marks?: { x: number; y: number; label: string }[]
  /** Units for the tooltip ("MeV", "°"; "keV b"). */
  xUnit?: string
  yUnit?: string
  /** Name of the x variable in the tooltip ("E", "θ"). */
  xName?: string
  /** Model curves in their series colour (curve-only charts). */
  colouredCurves?: boolean
  /**
   * Fit the vertical scale to the measurements, the model lines widening it
   * only by a decade (a log axis) or half the span: a narrow resonance runs
   * off the top rather than flattening the data.
   */
  clampCurves?: boolean
  svgRef?: RefObject<SVGSVGElement | null>
}

const DASHES = ["", "7 4", "2 3"]

/** How the model beyond the data is drawn: dashed where the model is solid, its own dash otherwise, and lighter. */
export const EXTENSION_OPACITY = 0.6
export function extensionDash(dash: string): string {
  return dash || "5 4"
}

function fittedAxis(lo: number, hi: number, log: boolean, target: number): Axis {
  if (!(hi > lo)) {
    const pad = log ? lo * 0.5 : Math.abs(lo) * 0.1 || 1
    lo = lo - pad
    hi = hi + pad
  }
  if (log) {
    // A little room either side, but no snapping out to whole decades.
    const f = (hi / lo) ** 0.03
    const domain: [number, number] = [lo / f, hi * f]
    const within = (ts: number[]) => ts.filter((v) => v >= domain[0] && v <= domain[1])
    const multiples = (ms: number[]) => {
      const all: number[] = []
      for (let d = Math.floor(Math.log10(domain[0])); d <= Math.ceil(Math.log10(domain[1])); d++)
        for (const m of ms) all.push(Number((m * 10 ** d).toPrecision(3)))
      return within(all)
    }
    let ticks = within(logTicks(domain[0], domain[1]).ticks)
    if (ticks.length < 3) ticks = multiples([1, 2, 5])
    if (ticks.length < 3) {
      ticks = multiples([1, 2, 3, 4, 5, 6, 7, 8, 9])
      if (ticks.length > 6) ticks = ticks.filter((_, i) => i % 2 === 0)
    }
    return { domain, ticks }
  }
  const pad = (hi - lo) * 0.03
  const domain: [number, number] = [lo - pad, hi + pad]
  const eps = (hi - lo) * 1e-9
  const ticks = linearTicks(domain[0], domain[1], target).ticks.filter((v) => v >= domain[0] - eps && v <= domain[1] + eps)
  return { domain, ticks }
}

/** Keep at most two points per pixel column (its min and max). */
function decimate(points: { x: number; y: number }[], toPx: (x: number) => number, width: number) {
  if (points.length <= width * 3) return points
  const out: { x: number; y: number }[] = []
  let column = -Infinity
  let lo: { x: number; y: number } | null = null
  let hi: { x: number; y: number } | null = null
  const flush = () => {
    if (lo && hi) {
      if (lo === hi) out.push(lo)
      else if (lo.x <= hi.x) out.push(lo, hi)
      else out.push(hi, lo)
    }
  }
  for (const p of points) {
    if (!Number.isFinite(p.y)) {
      flush()
      lo = hi = null
      out.push(p)
      column = -Infinity
      continue
    }
    const c = Math.floor(toPx(p.x))
    if (c !== column || !lo || !hi) {
      flush()
      column = c
      lo = hi = p
    } else {
      if (p.y < lo.y) lo = p
      if (p.y > hi.y) hi = p
    }
  }
  flush()
  return out
}

function pathOf(
  points: { x: number; y: number }[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  logX: boolean,
  logY: boolean,
) {
  let d = ""
  let pen = false
  for (const p of points) {
    const ok = Number.isFinite(p.x) && Number.isFinite(p.y) && (!logX || p.x > 0) && (!logY || p.y > 0)
    if (!ok) {
      pen = false
      continue
    }
    d += `${pen ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`
    pen = true
  }
  return d
}

/** A marker; `halo` rings it with the surface colour so it stands out on a line. */
function Marker({ shape, x, y, r, fill, halo = false }: { shape: string; x: number; y: number; r: number; fill: string; halo?: boolean }) {
  const ring = halo ? { stroke: "var(--viz-surface)", strokeWidth: 2, paintOrder: "stroke" as const } : {}
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={fill} {...ring} />
  if (shape === "triangle")
    return <path d={`M${x},${y - r * 1.2}L${x + r * 1.1},${y + r * 0.8}L${x - r * 1.1},${y + r * 0.8}Z`} fill={fill} {...ring} />
  return <circle cx={x} cy={y} r={r} fill={fill} {...ring} />
}

interface Hover {
  px: number
  py: number
  series: number
  point?: PlotPoint
  curveAt?: { x: number; values: { label: string; y: number; slot: number }[] }
}

function SegmentChartImpl({
  series,
  xLabel,
  yLabel,
  logX,
  logY,
  height,
  ariaLabel,
  zeroLine = false,
  compact = false,
  xDomain,
  onXDomain,
  yDomain,
  bands = [],
  marks = [],
  xUnit = "MeV",
  yUnit = "",
  xName = "E",
  colouredCurves = false,
  clampCurves = false,
  svgRef,
}: Props) {
  const lang = useLang()
  const t = useEvalDict().workspace
  const clipId = `clip${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const box = useRef<HTMLDivElement>(null)
  // k: the reader's text scale (200% text: 2), so the axes' text grows
  // with it (WCAG 1.4.4); a narrow chart grows it less, to keep room for the data.
  const [size, setSize] = useState({ width: 0, height: height ?? 0, k: 1 })
  const [hover, setHover] = useState<Hover | null>(null)
  const [brush, setBrush] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const px = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const scale = Number.isFinite(px) && px > 16 ? Math.min(2, px / 16) : 1
      const k = Math.max(1, Math.min(scale, el.clientWidth / 260))
      setSize({ width: el.clientWidth, height: height ?? el.clientHeight, k })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  // A new selection or zoom invalidates whatever the tooltip pointed at.
  const identity = series.map((s) => s.label).join("|")
  useEffect(() => setHover(null), [identity, xDomain])

  const k = size.k
  const fs = (n: number) => Math.round(n * k * 10) / 10
  const margin = { top: 10, right: 14, bottom: compact ? 8 + 14 * k : 14 + 26 * k, left: 22 + 40 * k }
  const W = Math.max(0, size.width - margin.left - margin.right)
  const H = Math.max(0, size.height - margin.top - margin.bottom)

  const xAxis = useMemo<Axis | null>(() => {
    const okX = (x: number) => Number.isFinite(x) && (!logX || x > 0)
    const okY = (y: number) => Number.isFinite(y) && (!logY || y > 0)
    if (xDomain) return fittedAxis(xDomain[0], xDomain[1], logX, Math.max(3, Math.round((compact ? 5 : 6) / k)))
    let lo = Infinity
    let hi = -Infinity
    const take = (x: number) => {
      if (x < lo) lo = x
      if (x > hi) hi = x
    }
    // Fitted to the measurements when there are any (a model line may run
    // wider, over the range of every dataset of its kind); else to the curves.
    const anyPoints = series.some((s) => s.points.length > 0)
    for (const s of series) {
      for (const p of s.points) if (okX(p.x) && okY(p.y)) take(p.x)
      if (!anyPoints) for (const p of [...s.curve, ...(s.extension ?? [])]) if (okX(p.x) && okY(p.y)) take(p.x)
    }
    if (!Number.isFinite(lo)) return null
    return fittedAxis(lo, hi, logX, Math.max(3, Math.round(6 / k)))
  }, [series, logX, logY, xDomain, compact, k])

  const yAxis = useMemo<Axis | null>(() => {
    if (yDomain) return fittedAxis(yDomain[0], yDomain[1], logY, compact ? 3 : 5)
    if (!xAxis) return null
    const okY = (y: number) => Number.isFinite(y) && (!logY || y > 0)
    const [x0, x1] = xAxis.domain
    const inside = (x: number) => x >= x0 && x <= x1
    let lo = Infinity
    let hi = -Infinity
    const take = (y: number) => {
      if (!okY(y)) return
      if (y < lo) lo = y
      if (y > hi) hi = y
    }
    for (const s of series) {
      for (const p of s.points) {
        if (!inside(p.x) || !okY(p.y)) continue
        take(p.y)
        if (p.error) {
          take(p.y + p.error)
          if (!logY || p.y - p.error > 0) take(p.y - p.error)
        }
      }
    }
    // The model lines widen the scale; with clampCurves, where there are
    // measurements, only so far (see the prop).
    const known = clampCurves && Number.isFinite(lo)
    const reachLo = logY ? lo / 10 : lo - 0.5 * (hi - lo)
    const reachHi = logY ? hi * 10 : hi + 0.5 * (hi - lo)
    for (const s of series)
      for (const p of [...s.curve, ...(s.extension ?? [])])
        if (inside(p.x) && okY(p.y)) take(known ? Math.min(Math.max(p.y, reachLo), reachHi) : p.y)
    if (!Number.isFinite(lo)) return null
    if (zeroLine && !logY) {
      const m = Math.max(1, Math.abs(lo), Math.abs(hi))
      lo = -m
      hi = m
    }
    return fittedAxis(lo, hi, logY, compact ? 3 : 5)
  }, [series, xAxis, logY, zeroLine, yDomain, compact, clampCurves])

  const sx = useMemo(() => {
    if (!xAxis) return (x: number) => x
    const [a, b] = xAxis.domain
    if (logX) {
      const la = Math.log10(a)
      const lb = Math.log10(b)
      return (x: number) => ((Math.log10(x) - la) / (lb - la)) * W
    }
    return (x: number) => ((x - a) / (b - a)) * W
  }, [xAxis, logX, W])
  const sy = useMemo(() => {
    if (!yAxis) return (y: number) => y
    const [a, b] = yAxis.domain
    if (logY) {
      const la = Math.log10(a)
      const lb = Math.log10(b)
      return (y: number) => H - ((Math.log10(y) - la) / (lb - la)) * H
    }
    return (y: number) => H - ((y - a) / (b - a)) * H
  }, [yAxis, logY, H])

  const curves = useMemo(
    () =>
      series.map((s) => ({
        model: pathOf(decimate(s.curve, sx, W), sx, sy, logX, logY),
        original: s.original ? pathOf(decimate(s.original, sx, W), sx, sy, logX, logY) : "",
        extension: s.extension?.length ? pathOf(decimate(s.extension, sx, W), sx, sy, logX, logY) : "",
      })),
    [series, sx, sy, W, logX, logY],
  )
  // What the tooltip reads off a curve: the model and its extension, as one sorted line.
  const readable = useMemo(
    () =>
      series.map((s) =>
        s.extension?.length
          ? [...s.curve, ...s.extension].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x)
          : s.curve,
      ),
    [series],
  )

  if (!xAxis || !yAxis) {
    return (
      <div
        ref={box}
        className="flex h-full min-h-[10rem] items-center justify-center text-sm text-muted-foreground"
        style={height ? { height } : undefined}
      >
        {t.nothingToPlot}
      </div>
    )
  }

  const usableX = (x: number) => Number.isFinite(x) && (!logX || x > 0)
  const usableY = (y: number) => Number.isFinite(y) && (!logY || y > 0)
  const invX = (px: number) => {
    const [a, b] = xAxis.domain
    const f = px / W
    return logX ? 10 ** (Math.log10(a) + f * (Math.log10(b) - Math.log10(a))) : a + f * (b - a)
  }

  const total = series.reduce((n, s) => n + s.points.length, 0)
  const r = total > 40 || size.width < 500 || series.length > 1 ? 2.5 : 3
  const fmtX = axisFormatter(xAxis, logX, lang)
  const fmtY = axisFormatter(yAxis, logY, lang)

  const num = (v: number) => <Sci>{numberText(v, lang, 4)}</Sci>

  // -- pointer -------------------------------------------------------------------
  const local = (event: React.PointerEvent) => {
    const rect = (event.currentTarget as Element).getBoundingClientRect()
    return { px: event.clientX - rect.left, py: event.clientY - rect.top }
  }

  const find = (px: number, py: number): Hover | null => {
    let best: Hover | null = null
    let bestD = Infinity
    series.forEach((s, i) => {
      for (const p of s.points) {
        if (!usableX(p.x) || !usableY(p.y)) continue
        const dx = sx(p.x) - px
        const dy = sy(p.y) - py
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = { px: sx(p.x), py: sy(p.y), series: i, point: p }
        }
      }
    })
    if (best && bestD < 40 * 40) return best
    // Curves only (or far from every point): read the curves at this x.
    const x = invX(px)
    const values: { label: string; y: number; slot: number }[] = []
    series.forEach((s, i) => {
      const curve = readable[i]
      if (curve.length < 2 || s.points.length > 0) return
      let lo = 0
      let hi = curve.length - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (curve[mid].x <= x) lo = mid
        else hi = mid
      }
      const a = curve[lo]
      const b = curve[hi]
      if (x < a.x || x > b.x) return
      const y = b.x === a.x ? a.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y)
      if (Number.isFinite(y)) values.push({ label: s.label, y, slot: s.slot ?? i })
    })
    if (values.length === 0) return null
    return { px, py: usableY(values[0].y) ? sy(values[0].y) : py, series: -1, curveAt: { x, values } }
  }

  const onPointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    const { px, py } = local(event)
    if (brush && event.pointerType === "mouse") {
      setBrush({ from: brush.from, to: Math.max(0, Math.min(W, px)) })
      return
    }
    if (event.pointerType === "mouse") setHover(find(px, py))
  }
  const onPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    const { px, py } = local(event)
    if (event.pointerType !== "mouse") {
      // Touch: a tap shows the nearest point, the next tap dismisses it.
      setHover((current) => (current ? null : find(px, py)))
      return
    }
    if (onXDomain && event.button === 0) {
      ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
      setBrush({ from: px, to: px })
    }
  }
  const onPointerUp = (event: React.PointerEvent<SVGRectElement>) => {
    if (!brush) return
    const a = Math.min(brush.from, brush.to)
    const b = Math.max(brush.from, brush.to)
    setBrush(null)
    ;(event.currentTarget as Element).releasePointerCapture?.(event.pointerId)
    if (b - a > 6 && onXDomain) {
      onXDomain([invX(a), invX(b)])
      setHover(null)
    }
  }

  const swatch = (slot: number) => (
    <svg width="10" height="10" aria-hidden className="shrink-0">
      <Marker shape={seriesShape(slot)} x={5} y={5} r={3.5} fill={`var(--viz-series-${slot + 1})`} />
    </svg>
  )

  let tip: React.ReactNode = null
  if (hover?.point) {
    const s = series[hover.series]
    const p = hover.point
    const slot = s.slot ?? hover.series
    tip = (
      <>
        <div className="flex items-center gap-1.5 font-medium">
          {swatch(slot)}
          <span>{s.label}</span>
        </div>
        <div className="tabular-nums">
          {xName} = {num(p.x)} {xUnit}
        </div>
        <div className="tabular-nums">
          {t.tipData}: {num(p.y)}
          {p.error !== undefined && <> ± {num(Number(p.error.toPrecision(2)))}</>} {yUnit}
        </div>
        {p.model !== undefined && (
          <div className="tabular-nums text-muted-foreground">
            {t.model}: {num(p.model)} {yUnit}
          </div>
        )}
        {p.pull !== undefined && Number.isFinite(p.pull) && (
          <div className="tabular-nums text-muted-foreground">
            (d − m)/σ = {p.pull >= 0 ? "+" : ""}
            {num(Number(p.pull.toFixed(2)))}
          </div>
        )}
      </>
    )
  } else if (hover?.curveAt) {
    tip = (
      <>
        <div className="font-medium tabular-nums">
          {xName} = {num(hover.curveAt.x)} {xUnit}
        </div>
        {hover.curveAt.values.map((v) => (
          <div key={v.label} className="flex items-center gap-1.5 tabular-nums">
            <span
              className="inline-block h-0.5 w-3 shrink-0"
              style={{ background: colouredCurves ? `var(--viz-series-${v.slot + 1})` : "var(--viz-text)" }}
              aria-hidden
            />
            <span className="truncate">{v.label}</span>
            <span className="shrink-0">
              {num(v.y)} {yUnit}
            </span>
          </div>
        ))}
      </>
    )
  }

  // Beside the cursor, flipped to stay inside the box.
  let tipStyle: React.CSSProperties | undefined
  if (hover) {
    const x = margin.left + hover.px
    const y = margin.top + hover.py
    const flip = x + 16 + 230 > size.width
    tipStyle = {
      left: flip ? undefined : x + 14,
      right: flip ? size.width - x + 14 : undefined,
      top: Math.max(0, Math.min(y - 24, size.height - 112)),
    }
  }

  return (
    <div
      ref={box}
      role="img"
      aria-label={ariaLabel ?? `${yLabel} / ${xLabel}`}
      className="relative h-full w-full select-none"
      style={height ? { height } : undefined}
    >
      {size.width > 0 && size.height > 0 && (
        <svg
          ref={svgRef}
          width={size.width}
          height={size.height}
          className="block"
          onDoubleClick={() => onXDomain?.(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={-3} width={W} height={H + 6} />
            </clipPath>
          </defs>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {xAxis.ticks.map((v) => (
              <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={0} y2={H} stroke="var(--viz-grid)" strokeWidth={1} />
            ))}
            {yAxis.ticks.map((v) => (
              <line key={`gy${v}`} x1={0} x2={W} y1={sy(v)} y2={sy(v)} stroke="var(--viz-grid)" strokeWidth={1} />
            ))}

            <g clipPath={`url(#${clipId})`}>
              {bands.map((b) => {
                const x0 = Math.max(0, logX && b.x0 <= 0 ? 0 : sx(b.x0))
                const x1 = Math.min(W, sx(b.x1))
                if (!(x1 > x0)) return null
                return (
                  <g key={b.label}>
                    <rect x={x0} y={0} width={x1 - x0} height={H} fill="var(--viz-text)" opacity={0.07} />
                    <text
                      x={(x0 + x1) / 2 > W - 90 ? W - 4 : (x0 + x1) / 2 < 90 ? 4 : (x0 + x1) / 2}
                      y={H - 6}
                      textAnchor={(x0 + x1) / 2 > W - 90 ? "end" : (x0 + x1) / 2 < 90 ? "start" : "middle"}
                      fontSize={fs(11)}
                      fill="var(--viz-text-muted)"
                    >
                      {b.label}
                    </text>
                  </g>
                )
              })}
              {zeroLine && !logY && <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} stroke="var(--viz-axis)" strokeWidth={1} />}

              {curves.map((c, i) =>
                c.original ? (
                  // The published fit: a wide, light, solid "ghost" under everything,
                  // so it cannot be mistaken for the dashed model beyond the data.
                  <path
                    key={`o${i}`}
                    d={c.original}
                    fill="none"
                    stroke="var(--viz-text-muted)"
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.3}
                  />
                ) : null,
              )}

              {/* Measurements, each with a thin halo. */}
              {series.map((s, i) => {
                const colour = `var(--viz-series-${(s.slot ?? i) + 1})`
                return (
                  <g key={`p${i}`}>
                    {s.points.map((p, k) => {
                      if (!usableX(p.x) || !usableY(p.y) || !p.error) return null
                      const lo = logY && p.y - p.error <= 0 ? H + 3 : sy(p.y - p.error)
                      return (
                        <line key={k} x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.y + p.error)} y2={lo} stroke={colour} strokeWidth={1} opacity={0.75} />
                      )
                    })}
                    {s.points.map((p, k) =>
                      usableX(p.x) && usableY(p.y) ? (
                        <Marker key={`m${k}`} shape={seriesShape(s.slot ?? i)} x={sx(p.x)} y={sy(p.y)} r={r} fill={colour} halo />
                      ) : null,
                    )}
                  </g>
                )
              })}

              {/* The model above the measurements (dense data would bury it), with a thin halo. */}
              {curves.map((c, i) => {
                const s = series[i]
                const ink = colouredCurves ? `var(--viz-series-${(s.slot ?? i) + 1})` : "var(--viz-text)"
                const dash = s.dash ?? (colouredCurves ? "" : DASHES[i % DASHES.length])
                return (
                  <g key={`c${i}`} opacity={s.faded ? 0.35 : 1} className="transition-opacity duration-300">
                    {c.extension && (
                      <path
                        d={c.extension}
                        fill="none"
                        stroke={ink}
                        strokeWidth={colouredCurves ? 1.75 : 1.4}
                        strokeDasharray={extensionDash(dash)}
                        strokeLinejoin="round"
                        opacity={EXTENSION_OPACITY}
                      />
                    )}
                    <path d={c.model} fill="none" stroke="var(--viz-surface)" strokeWidth={3.5} strokeLinejoin="round" opacity={0.7} />
                    <path
                      d={c.model}
                      fill="none"
                      stroke={ink}
                      strokeWidth={colouredCurves ? 2 : 1.6}
                      strokeDasharray={dash || undefined}
                      strokeLinejoin="round"
                    />
                  </g>
                )
              })}

              {marks.map((m) =>
                usableX(m.x) && usableY(m.y) ? (
                  <g key={m.label}>
                    <circle cx={sx(m.x)} cy={sy(m.y)} r={4} fill="var(--viz-surface)" stroke="var(--viz-text)" strokeWidth={1.5} />
                    <text x={sx(m.x) + 8} y={sy(m.y) < 18 ? sy(m.y) + 16 : sy(m.y) - 8} fontSize={fs(11)} fill="var(--viz-text)">
                      {m.label}
                    </text>
                  </g>
                ) : null,
              )}

              {hover?.point && <circle cx={hover.px} cy={hover.py} r={r + 3.5} fill="none" stroke="var(--viz-text)" strokeWidth={1.25} />}
              {hover?.curveAt && <line x1={hover.px} x2={hover.px} y1={0} y2={H} stroke="var(--viz-axis)" strokeDasharray="3 3" />}
              {brush && (
                <rect x={Math.min(brush.from, brush.to)} y={0} width={Math.abs(brush.to - brush.from)} height={H} fill="var(--viz-series-1)" opacity={0.12} />
              )}
            </g>

            <line x1={0} x2={W} y1={H} y2={H} stroke="var(--viz-axis)" />
            <line x1={0} x2={0} y1={0} y2={H} stroke="var(--viz-axis)" />
            {xAxis.ticks.map((v) => (
              <g key={`tx${v}`} transform={`translate(${sx(v)},${H})`}>
                <line y2={4} stroke="var(--viz-axis)" />
                <text y={5 + 11 * k} textAnchor="middle" fontSize={fs(11)} fill="var(--viz-text-muted)">
                  {fmtX(v)}
                </text>
              </g>
            ))}
            {yAxis.ticks.map((v) => (
              <g key={`ty${v}`} transform={`translate(0,${sy(v)})`}>
                <line x2={-4} stroke="var(--viz-axis)" />
                <text x={-7} dy="0.32em" textAnchor="end" fontSize={fs(11)} fill="var(--viz-text-muted)">
                  {fmtY(v)}
                </text>
              </g>
            ))}
            {!compact && (
              <text x={W / 2} y={H + 8 + 26 * k} textAnchor="middle" fontSize={fs(12)} fill="var(--viz-text)">
                {xLabel}
              </text>
            )}
            <text
              transform={`translate(${-(10 + 40 * k)},${H / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={fs(compact ? 11 : 12)}
              fill="var(--viz-text)"
            >
              {yLabel}
            </text>

            <rect
              x={0}
              y={0}
              width={W}
              height={H}
              fill="transparent"
              style={{ cursor: onXDomain ? "crosshair" : "default", touchAction: "pan-y" }}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse" && !brush) setHover(null)
              }}
            />
          </g>
        </svg>
      )}
      {tip && tipStyle && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[15rem] space-y-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm"
          style={tipStyle}
        >
          {tip}
        </div>
      )}
    </div>
  )
}

const sameRange = (a?: [number, number] | null, b?: [number, number] | null) =>
  a === b || (Boolean(a) && Boolean(b) && a![0] === b![0] && a![1] === b![1])

/**
 * Memoised: a re-render of the plot view around it (a timer, a toggle
 * elsewhere) does not redraw the SVG unless what it shows changed. Ranges
 * compare by value and the export ref by nothing (it only collects the node).
 */
export const SegmentChart = memo(SegmentChartImpl, (a, b) => {
  for (const key of Object.keys({ ...a, ...b }) as (keyof Props)[]) {
    if (key === "svgRef") continue
    if (key === "xDomain" || key === "yDomain") {
      if (!sameRange(a[key] as [number, number] | null, b[key] as [number, number] | null)) return false
      continue
    }
    if (a[key] !== b[key]) return false
  }
  return true
})
