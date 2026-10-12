"use client"

import { memo, useMemo, useRef, useState } from "react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import type { RateProvider } from "@/lib/rates/rate-provider"
import type { Reaction } from "@/lib/rates/schema"
import { C, SERIES, Shape, SvgSci, decades, logScale, useWidth } from "./chart-kit"
import { pow10, sci, tShort, temperature } from "./format"

export interface Marker {
  T9: number
  label: string
  current?: boolean
}

/**
 * N_A⟨σv⟩ against T9 on log axes, absolute or as a ratio to one reaction.
 * Up to three picked reactions take a series colour (fixed per slot, so a
 * reaction keeps its colour while others come and go) and a marker shape at
 * their label; the rest are grey context. A scaled reaction is drawn as a
 * band between its own rate and the scaled one. The sites are marked where
 * they burn, and the current temperature is a handle: drag across the chart
 * (or tap it) to move it. Hovering shows a readout.
 */
export const RateChart = memo(function RateChart({
  reactions,
  slots,
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
  fasterLabel,
  onTemperature,
}: {
  reactions: Reaction[]
  /** the picked reactions by colour slot (null: a free slot) */
  slots: (string | null)[]
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
  /** "↑ faster", above the y axis */
  fasterLabel?: string
  /** dragging on the chart sets the temperature */
  onTemperature?: (T9: number) => void
}) {
  const [box, width, k] = useWidth<HTMLDivElement>()
  const narrow = width < 560
  const height = narrow ? 300 : 360
  const m = { l: narrow ? 46 : 58, r: narrow ? 10 : 132, t: 34, b: 44 }
  const [hoverT, setHoverT] = useState<number | null>(null)
  const dragging = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const N = 140
  const grid = useMemo(() => {
    const [a, b] = T9range
    return Array.from({ length: N }, (_, i) => a * (b / a) ** (i / (N - 1)))
  }, [T9range])

  const raw = (r: Reaction, T9: number, f = 1) => {
    const v = provider.rate(r.id, T9) * f
    if (mode === "relative" && reference) return v / (provider.rate(reference.id, T9) * (scale[reference.id] ?? 1))
    return v
  }
  const value = (r: Reaction, T9: number) => raw(r, T9, scale[r.id] ?? 1)

  const series = useMemo(
    () =>
      reactions.map((r) => ({
        r,
        ys: grid.map((T) => value(r, T)),
        unscaled: (scale[r.id] ?? 1) !== 1 ? grid.map((T) => raw(r, T, 1)) : null,
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
  const xMinor: number[] = []
  for (let e = Math.floor(Math.log10(T9range[0])); e <= Math.ceil(Math.log10(T9range[1])); e++)
    for (const f of [2, 5]) {
      const v = f * 10 ** e
      if (v > T9range[0] && v < T9range[1]) xMinor.push(v)
    }
  const yt = decades(y.lo, y.hi, narrow ? 6 : 9)
  const yAll: number[] = []
  for (let e = Math.round(Math.log10(y.lo)); e <= Math.round(Math.log10(y.hi)); e++) yAll.push(e)

  const toPath = (ys: number[]) => {
    let d = ""
    let pen = false
    ys.forEach((v, i) => {
      if (!(v > 0) || v < y.lo) {
        pen = false
        return
      }
      d += `${pen ? "L" : "M"}${x.px(grid[i]).toFixed(1)},${y.px(Math.min(v, y.hi)).toFixed(1)}`
      pen = true
    })
    return d
  }
  const band = (a: number[], b: number[]) => {
    const pts: string[] = []
    const back: string[] = []
    a.forEach((va, i) => {
      const vb = b[i]
      if (!(va > 0 && vb > 0)) return
      const px = x.px(grid[i]).toFixed(1)
      pts.push(`${px},${y.px(Math.min(Math.max(va, y.lo), y.hi)).toFixed(1)}`)
      back.unshift(`${px},${y.px(Math.min(Math.max(vb, y.lo), y.hi)).toFixed(1)}`)
    })
    return pts.length ? `M${pts.join("L")}L${back.join("L")}Z` : ""
  }

  const slot = (id: string) => slots.indexOf(id)
  const colored = series.filter((s) => slot(s.r.id) >= 0)
  const grey = series.filter((s) => slot(s.r.id) < 0)

  // labels: at the right end on a wide chart, inside the plot on a narrow one
  const labelAt = narrow ? Math.round(N * 0.05) : N - 1
  const ends = colored
    .map((s) => {
      let i = labelAt
      if (narrow) while (i < N - 1 && !(s.ys[i] > 0 && s.ys[i] >= y.lo)) i++
      else while (i > 0 && !(s.ys[i] > 0 && s.ys[i] >= y.lo)) i--
      return { s, py: y.px(Math.min(Math.max(s.ys[i], y.lo), y.hi)) - (narrow ? 10 : 0), px: x.px(grid[i]) }
    })
    .sort((a, b) => a.py - b.py)
  for (let i = 1; i < ends.length; i++) if (ends[i].py - ends[i - 1].py < 17) ends[i].py = ends[i - 1].py + 17
  for (const e of ends) e.py = Math.max(m.t + 8, Math.min(height - m.b - 6, e.py))

  const tAt = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    const px = ((clientX - rect.left) / rect.width) * width
    if (px < m.l || px > width - m.r) return null
    return x.inv(px)
  }
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onTemperature) return
    const T = tAt(e.clientX)
    if (T === null) return
    dragging.current = true
    svgRef.current?.setPointerCapture?.(e.pointerId)
    onTemperature(Number(T.toPrecision(3)))
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const T = tAt(e.clientX)
    if (dragging.current && onTemperature && T !== null) onTemperature(Number(T.toPrecision(3)))
    if (e.pointerType === "mouse") setHoverT(T)
  }
  const onKey = (e: React.KeyboardEvent) => {
    const step = (T9range[1] / T9range[0]) ** (1 / 40)
    const cur = hoverT ?? markers.find((mk) => mk.current)?.T9 ?? Math.sqrt(T9range[0] * T9range[1])
    if (e.key === "ArrowRight") setHoverT(Math.min(T9range[1], cur * step))
    else if (e.key === "ArrowLeft") setHoverT(Math.max(T9range[0], cur / step))
    else if (e.key === "Enter" && hoverT !== null && onTemperature) onTemperature(Number(hoverT.toPrecision(3)))
    else if (e.key === "Escape") setHoverT(null)
    else return
    e.preventDefault()
  }

  const readout =
    hoverT !== null
      ? series
          .filter((s) => slot(s.r.id) >= 0 || series.length <= 6)
          .map((s) => ({ r: s.r, v: value(s.r, hoverT) }))
          .sort((a, b) => b.v - a.v)
      : []
  const hx = hoverT !== null ? x.px(hoverT) : 0
  const current = markers.find((mk) => mk.current)
  const cx = current ? x.px(current.T9) : 0
  const crowded = new Set<Marker>()
  {
    let last = -Infinity
    for (const mk of markers.filter((q) => !q.current).sort((a, b) => a.T9 - b.T9)) {
      const px = x.px(mk.T9)
      if (px - last < (narrow ? 64 : 48)) crowded.add(mk)
      else last = px
    }
  }
  // a site under the handle is named in the handle's label instead of its own
  const near = current
    ? markers.find(
        (mk) => !mk.current && Math.abs(x.px(mk.T9) - cx) < 30 && mk.T9 >= T9range[0] && mk.T9 <= T9range[1],
      )
    : undefined

  return (
    <div ref={box} className="relative">
      <svg
        ref={svgRef}
        role="img"
        aria-label={label}
        tabIndex={-1}
        width={width * k}
        height={height * k}
        viewBox={`0 0 ${width} ${height}`}
        className={`block touch-pan-y select-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${onTemperature ? "cursor-ew-resize" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHoverT(null)}
        onKeyDown={onKey}
        onBlur={() => setHoverT(null)}
      >
        {/* grid: every decade, labels on some */}
        {yAll.map((e) => (
          <line
            key={`yg${e}`}
            x1={m.l}
            x2={width - m.r}
            y1={y.px(10 ** e)}
            y2={y.px(10 ** e)}
            stroke={C.grid}
            strokeWidth={yt.includes(e) ? 1 : 0.6}
          />
        ))}
        {yt.map((e) => (
          <text key={`y${e}`} x={m.l - 6} y={y.px(10 ** e)} dy="0.32em" textAnchor="end" fontSize={11} fill={C.muted}>
            <SvgSci>{pow10(e)}</SvgSci>
          </text>
        ))}
        {xt.map((e) => (
          <g key={`x${e}`}>
            <line x1={x.px(10 ** e)} x2={x.px(10 ** e)} y1={m.t} y2={height - m.b} stroke={C.grid} />
            <text x={x.px(10 ** e)} y={height - m.b + 16} textAnchor="middle" fontSize={11} fill={C.muted}>
              <SvgSci>{sci(10 ** e, lang)}</SvgSci>
            </text>
          </g>
        ))}
        {xMinor.map((v) => (
          <g key={`xm${v}`}>
            <line x1={x.px(v)} x2={x.px(v)} y1={height - m.b} y2={height - m.b + 4} stroke={C.base} />
            {!narrow && (
              <text x={x.px(v)} y={height - m.b + 16} textAnchor="middle" fontSize={10} fill={C.muted}>
                <SvgSci>{sci(v, lang, 1)}</SvgSci>
              </text>
            )}
          </g>
        ))}
        <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke={C.base} />
        <text x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle" fontSize={12} fill={C.muted}>
          {axisLabel}
        </text>
        <text
          transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={narrow ? 10.5 : 12}
          fill={C.muted}
        >
          <SvgSci>{mode === "relative" ? ratioLabel : axisLabelY}</SvgSci>
        </text>

        {fasterLabel && mode === "absolute" && !(current && cx < m.l + 90) && (
          <text x={4} y={m.t - 19} fontSize={11} fill={C.muted}>
            {fasterLabel}
          </text>
        )}

        {/* where the sites burn (a label too close to the one before it is left out) */}
        {markers.map((mk, i) =>
          !mk.current && mk.T9 >= T9range[0] && mk.T9 <= T9range[1] ? (
            <g key={`mk${i}`}>
              <line
                x1={x.px(mk.T9)}
                x2={x.px(mk.T9)}
                y1={m.t - 2}
                y2={height - m.b}
                stroke={C.base}
                strokeDasharray="3 3"
              />
              {mk !== near && !crowded.has(mk) && (
                <text
                  x={Math.min(Math.max(x.px(mk.T9), m.l + 24), width - (narrow ? 26 : m.r - 20))}
                  y={m.t + 10}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill={C.muted}
                  stroke={C.surface}
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  <SvgSci>{mk.label}</SvgSci>
                </text>
              )}
            </g>
          ) : null,
        )}
        {mode === "relative" && reference && 1 >= y.lo && 1 <= y.hi && (
          <line x1={m.l} x2={width - m.r} y1={y.px(1)} y2={y.px(1)} stroke={C.base} strokeWidth={1.5} />
        )}

        {/* the lines */}
        {grey.map((s) => (
          <g key={s.r.id}>
            {s.unscaled && <path d={band(s.unscaled, s.ys)} fill={C.base} opacity={0.35} />}
            <path d={toPath(s.ys)} fill="none" stroke={C.base} strokeWidth={1.25} />
          </g>
        ))}
        {colored.map((s) => (
          <g key={s.r.id}>
            {s.unscaled && <path d={band(s.unscaled, s.ys)} fill={SERIES[slot(s.r.id)]} opacity={0.2} />}
            <path
              d={toPath(s.ys)}
              fill="none"
              stroke={SERIES[slot(s.r.id)]}
              strokeWidth={2.25}
              strokeLinejoin="round"
            />
          </g>
        ))}
        {/* the current temperature: a handle */}
        {current && current.T9 >= T9range[0] && current.T9 <= T9range[1] && (
          <g pointerEvents="none">
            <line x1={cx} x2={cx} y1={m.t - 8} y2={height - m.b} stroke={C.ink} strokeWidth={1.5} />
            <path d={`M${cx - 6},${m.t - 15} L${cx + 6},${m.t - 15} L${cx},${m.t - 8} Z`} fill={C.ink} />
            <text
              x={Math.min(Math.max(cx, m.l + 30), width - (narrow ? 30 : m.r - 10))}
              y={m.t - 19}
              textAnchor="middle"
              fontSize={11.5}
              fontWeight={600}
              fill={C.ink}
            >
              <SvgSci>{near ? `${tShort(current.T9, lang)} · ${near.label}` : tShort(current.T9, lang)}</SvgSci>
            </text>
            {colored.map((s) => {
              const v = value(s.r, current.T9)
              if (!(v >= y.lo && v <= y.hi)) return null
              const k = slot(s.r.id)
              return (
                <Shape
                  key={s.r.id}
                  slot={k}
                  x={cx}
                  y={y.px(v)}
                  r={4}
                  fill={SERIES[k]}
                  stroke={C.surface}
                  strokeWidth={1.5}
                />
              )
            })}
          </g>
        )}

        {ends.map(({ s, py, px }) => {
          const k = slot(s.r.id)
          const lx = narrow ? px + 2 : width - m.r + 8
          return (
            <g key={s.r.id}>
              <Shape slot={k} x={lx + 4} y={py} r={3.5} fill={SERIES[k]} stroke={C.surface} strokeWidth={1} />
              <text
                x={lx + 12}
                y={py}
                dy="0.32em"
                fontSize={11.5}
                fill={C.ink}
                stroke={C.surface}
                strokeWidth={3}
                paintOrder="stroke"
              >
                <SvgSci>{s.r.label}</SvgSci>
              </text>
            </g>
          )
        })}

        {/* hover crosshair */}
        {hoverT !== null && (
          <line
            x1={hx}
            x2={hx}
            y1={m.t}
            y2={height - m.b}
            stroke={C.muted}
            strokeWidth={1}
            strokeDasharray="2 2"
            pointerEvents="none"
          />
        )}
      </svg>
      {hoverT !== null && readout.length > 0 && (
        <div
          className="pointer-events-none absolute top-8 z-10 max-w-[16rem] rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={hx > width / 2 ? { right: (width - hx) * k + 12 } : { left: hx * k + 12 }}
        >
          <p className="font-medium">{temperature(hoverT, lang)}</p>
          <ul className="mt-1 space-y-0.5">
            {readout.slice(0, 6).map(({ r, v }) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  {slot(r.id) >= 0 && (
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES[slot(r.id)] }} />
                  )}
                  <span>
                    <Sci>{r.label}</Sci>
                  </span>
                </span>
                <span className="tabular text-muted-foreground">
                  <Sci>{sci(v, lang, 3)}</Sci>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
})
