"use client"

import { useMemo, useRef, useState } from "react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import type { RateProvider } from "@/lib/rates/rate-provider"
import type { Reaction } from "@/lib/rates/schema"
import { DASHES, SERIES, SvgSci, decades, logScale, useWidth } from "./chart-kit"
import { pow10, sci, temperature } from "./format"

export interface Marker {
  T9: number
  label: string
  current?: boolean
}

/**
 * N_A⟨σv⟩ against T9 on log axes, absolute or as a ratio to one reaction.
 * Up to three reactions are coloured (the site's validated palette, with a
 * dash per slot as a second cue) and labelled at their right end; the rest
 * are grey context. A crosshair follows the pointer, or the arrow keys.
 */
export function RateChart({
  reactions,
  highlighted,
  provider,
  scale,
  mode,
  reference,
  T9range,
  markers,
  lang,
  label,
  axisLabel,
  axisLabelY,
  ratioLabel,
}: {
  reactions: Reaction[]
  highlighted: string[]
  provider: RateProvider
  scale: Record<string, number>
  mode: "absolute" | "relative"
  reference: Reaction | null
  T9range: [number, number]
  markers: Marker[]
  lang: Lang
  label: string
  axisLabel: string
  axisLabelY: string
  ratioLabel: string
}) {
  const [box, width] = useWidth<HTMLDivElement>()
  const narrow = width < 520
  const height = narrow ? 300 : 380
  const m = { l: narrow ? 46 : 58, r: narrow ? 12 : 120, t: 26, b: 44 }
  const [hoverT, setHoverT] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const N = 140
  const grid = useMemo(() => {
    const [a, b] = T9range
    return Array.from({ length: N }, (_, i) => a * (b / a) ** (i / (N - 1)))
  }, [T9range])

  const value = (r: Reaction, T9: number) => {
    const v = provider.rate(r.id, T9) * (scale[r.id] ?? 1)
    if (mode === "relative" && reference) return v / (provider.rate(reference.id, T9) * (scale[reference.id] ?? 1))
    return v
  }

  const series = useMemo(
    () =>
      reactions.map((r) => ({
        r,
        ys: grid.map((T) => value(r, T)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reactions, grid, provider, scale, mode, reference],
  )

  // y range: what is drawn, but no more than 36 decades below the top
  let yMax = 0
  let yMin = Infinity
  for (const s of series)
    for (const y of s.ys) {
      if (y > yMax) yMax = y
      if (y > 0 && y < yMin) yMin = y
    }
  if (!(yMax > 0)) {
    yMax = 1
    yMin = 1e-3
  }
  yMin = Math.max(yMin, yMax * 1e-36)
  const x = logScale(T9range[0], T9range[1], m.l, width - m.r, false)
  const y = logScale(yMin, yMax, height - m.b, m.t)
  const xt = decades(T9range[0], T9range[1], 6)
  // 2 and 5 between decades on a narrow T range
  const xMinor: number[] = []
  for (let e = Math.floor(Math.log10(T9range[0])); e <= Math.ceil(Math.log10(T9range[1])); e++)
    for (const k of [2, 5]) {
      const v = k * 10 ** e
      if (v > T9range[0] && v < T9range[1]) xMinor.push(v)
    }
  const yt = decades(y.lo, y.hi, narrow ? 6 : 9)

  const path = (ys: number[]) => {
    let d = ""
    let pen = false
    ys.forEach((v, i) => {
      if (!(v > 0) || v < y.lo) {
        pen = false
        return
      }
      const px = x.px(grid[i]).toFixed(1)
      const py = y.px(Math.min(v, y.hi)).toFixed(1)
      d += `${pen ? "L" : "M"}${px},${py}`
      pen = true
    })
    return d
  }

  const colored = series.filter((s) => highlighted.includes(s.r.id))
  const grey = series.filter((s) => !highlighted.includes(s.r.id))
  const slot = (id: string) => highlighted.indexOf(id)

  // right-end labels, pushed apart
  const ends = colored
    .map((s) => {
      let i = grid.length - 1
      while (i > 0 && !(s.ys[i] > 0 && s.ys[i] >= y.lo)) i--
      return { s, py: y.px(Math.min(Math.max(s.ys[i], y.lo), y.hi)) }
    })
    .sort((a, b) => a.py - b.py)
  for (let i = 1; i < ends.length; i++) if (ends[i].py - ends[i - 1].py < 16) ends[i].py = ends[i - 1].py + 16

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * width
    if (px < m.l || px > width - m.r) return setHoverT(null)
    setHoverT(x.inv(px))
  }
  const onKey = (e: React.KeyboardEvent) => {
    const step = (T9range[1] / T9range[0]) ** (1 / 40)
    const cur = hoverT ?? markers.find((mk) => mk.current)?.T9 ?? Math.sqrt(T9range[0] * T9range[1])
    if (e.key === "ArrowRight") setHoverT(Math.min(T9range[1], cur * step))
    else if (e.key === "ArrowLeft") setHoverT(Math.max(T9range[0], cur / step))
    else if (e.key === "Escape") setHoverT(null)
    else return
    e.preventDefault()
  }

  const readout =
    hoverT !== null
      ? series
          .filter((s) => highlighted.includes(s.r.id) || series.length <= 6)
          .map((s) => ({ r: s.r, v: value(s.r, hoverT) }))
          .sort((a, b) => b.v - a.v)
      : []
  const hx = hoverT !== null ? x.px(hoverT) : 0

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
        onPointerMove={onMove}
        onPointerLeave={() => setHoverT(null)}
        onKeyDown={onKey}
        onBlur={() => setHoverT(null)}
      >
        {/* grid */}
        {yt.map((e) => (
          <g key={`y${e}`}>
            <line x1={m.l} x2={width - m.r} y1={y.px(10 ** e)} y2={y.px(10 ** e)} stroke="var(--viz-grid)" />
            <text x={m.l - 6} y={y.px(10 ** e)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-text-muted)">
              <SvgSci>{pow10(e)}</SvgSci>
            </text>
          </g>
        ))}
        {xt.map((e) => (
          <g key={`x${e}`}>
            <line x1={x.px(10 ** e)} x2={x.px(10 ** e)} y1={m.t} y2={height - m.b} stroke="var(--viz-grid)" />
            <text
              x={x.px(10 ** e)}
              y={height - m.b + 16}
              textAnchor="middle"
              fontSize={11}
              fill="var(--viz-text-muted)"
            >
              <SvgSci>{sci(10 ** e, lang)}</SvgSci>
            </text>
          </g>
        ))}
        {xMinor.map((v) => (
          <g key={`xm${v}`}>
            <line x1={x.px(v)} x2={x.px(v)} y1={height - m.b} y2={height - m.b + 4} stroke="var(--viz-axis)" />
            {!narrow && (
              <text x={x.px(v)} y={height - m.b + 16} textAnchor="middle" fontSize={10} fill="var(--viz-text-muted)">
                <SvgSci>{sci(v, lang, 1)}</SvgSci>
              </text>
            )}
          </g>
        ))}
        <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke="var(--viz-axis)" />
        <text x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle" fontSize={12} fill="var(--viz-text-muted)">
          {axisLabel}
        </text>
        <text
          transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={12}
          fill="var(--viz-text-muted)"
        >
          <SvgSci>{mode === "relative" ? ratioLabel : axisLabelY}</SvgSci>
        </text>

        {/* where reactions run */}
        {markers.map((mk, i) =>
          mk.T9 >= T9range[0] && mk.T9 <= T9range[1] ? (
            <g key={`mk${i}`}>
              <line
                x1={x.px(mk.T9)}
                x2={x.px(mk.T9)}
                y1={m.t - 6}
                y2={height - m.b}
                stroke={mk.current ? "var(--viz-text)" : "var(--viz-axis)"}
                strokeWidth={mk.current ? 1.5 : 1}
                strokeDasharray={mk.current ? undefined : "3 3"}
              />
              <text
                x={x.px(mk.T9)}
                y={m.t - 10}
                textAnchor="middle"
                fontSize={11}
                fontWeight={mk.current ? 600 : 400}
                fill={mk.current ? "var(--viz-text)" : "var(--viz-text-muted)"}
              >
                <SvgSci>{mk.label}</SvgSci>
              </text>
            </g>
          ) : null,
        )}
        {mode === "relative" && reference && 1 >= y.lo && 1 <= y.hi && (
          <line x1={m.l} x2={width - m.r} y1={y.px(1)} y2={y.px(1)} stroke="var(--viz-axis)" strokeWidth={1.5} />
        )}

        {/* the lines */}
        {grey.map((s) => (
          <path key={s.r.id} d={path(s.ys)} fill="none" stroke="var(--viz-axis)" strokeWidth={1.25} />
        ))}
        {colored.map((s) => (
          <path
            key={s.r.id}
            d={path(s.ys)}
            fill="none"
            stroke={SERIES[slot(s.r.id)]}
            strokeWidth={2}
            strokeDasharray={DASHES[slot(s.r.id)] || undefined}
            strokeLinejoin="round"
          />
        ))}
        {!narrow &&
          ends.map(({ s, py }) => (
            <text key={s.r.id} x={width - m.r + 6} y={py} dy="0.32em" fontSize={11.5} fill="var(--viz-text)">
              <SvgSci>{s.r.label}</SvgSci>
            </text>
          ))}

        {/* crosshair */}
        {hoverT !== null && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={m.t} y2={height - m.b} stroke="var(--viz-text-muted)" strokeWidth={1} />
            {colored.map((s) => {
              const v = value(s.r, hoverT)
              if (!(v >= y.lo && v <= y.hi)) return null
              return (
                <circle
                  key={s.r.id}
                  cx={hx}
                  cy={y.px(v)}
                  r={4.5}
                  fill={SERIES[slot(s.r.id)]}
                  stroke="var(--viz-surface)"
                  strokeWidth={2}
                />
              )
            })}
          </g>
        )}
      </svg>
      {hoverT !== null && readout.length > 0 && (
        <div
          className="pointer-events-none absolute top-8 z-10 max-w-[16rem] rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={hx > width / 2 ? { right: width - hx + 12 } : { left: hx + 12 }}
          aria-live="polite"
        >
          <p className="font-medium">{temperature(hoverT, lang)}</p>
          <ul className="mt-1 space-y-0.5">
            {readout.slice(0, 6).map(({ r, v }) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  {highlighted.includes(r.id) && (
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES[slot(r.id)] }} />
                  )}
                  <span>
                    <Sci>{r.label}</Sci>
                  </span>
                </span>
                <span className="tabular text-muted-foreground">{sci(v, lang, 3)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
