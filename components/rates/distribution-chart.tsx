"use client"

import { useRef, useState } from "react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import { SvgSci, decades, logScale, useWidth } from "./chart-kit"
import { pow10, sci } from "./format"

export interface DistPoint {
  name: string
  label: string
  A: number
  Z: number
  base: number
  changed: number | null
  sOnly: boolean
}

/** The closed neutron shells' mass numbers along the s-process path. */
const SHELLS = [
  { N: 50, A: [86, 90] },
  { N: 82, A: [136, 142] },
  { N: 126, A: [204, 209] },
]

/**
 * Production factors against mass number: one dot per stable isotope, the
 * unchanged burn hollow grey and the changed one in the first colour, s-only
 * isotopes as squares, the closed neutron shells shaded. A crosshair picks
 * a mass number (pointer or arrow keys) and lists its isotopes.
 */
export function DistributionChart({
  points,
  lang,
  label,
  xLabel,
  yLabel,
  shellLabel,
  sOnlyLabel,
  baseLabel,
  changedLabel,
  belowLabel,
}: {
  points: DistPoint[]
  lang: Lang
  label: string
  xLabel: string
  yLabel: string
  shellLabel: (n: number) => string
  sOnlyLabel: string
  /** The hollow "unchanged" key; null hides it (nothing changed, so no hollow dots). */
  baseLabel: string | null
  changedLabel: string
  belowLabel: string
}) {
  const [box, width] = useWidth<HTMLDivElement>()
  const narrow = width < 520
  const height = narrow ? 300 : 380
  const m = { l: narrow ? 44 : 56, r: 12, t: 22, b: 44 }
  const [hoverA, setHoverA] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const vals = points.flatMap((p) => [p.base, p.changed ?? p.base]).filter((v) => v > 0)
  if (!vals.length) return <div ref={box} />
  let yMax = Math.max(...vals)
  let yMin = Math.min(...vals)
  // destroyed isotopes (the p-nuclei, burnt by captures) sit on the floor as
  // down-pointing triangles rather than stretching the axis
  yMin = Math.max(Math.min(yMin, 0.1), 1e-2)
  yMax = Math.max(yMax, 10)
  const Amin = Math.min(...points.map((p) => p.A)) - 2
  const Amax = Math.max(...points.map((p) => p.A)) + 2
  const x = (A: number) => m.l + ((A - Amin) / (Amax - Amin)) * (width - m.l - m.r)
  const xInv = (px: number) => Amin + ((px - m.l) / (width - m.l - m.r)) * (Amax - Amin)
  const y = logScale(yMin, yMax, height - m.b, m.t)
  const yt = decades(y.lo, y.hi, narrow ? 5 : 8)
  const xt: number[] = []
  for (let a = Math.ceil(Amin / 20) * 20; a <= Amax; a += narrow ? 40 : 20) xt.push(a)
  const clampY = (v: number) => y.px(Math.min(Math.max(v, y.lo), y.hi))
  const below = (v: number) => v < y.lo
  const tri = (cx: number, size: number) =>
    `M${cx - size},${height - m.b - 2 * size} L${cx + size},${height - m.b - 2 * size} L${cx},${height - m.b - 0.5} Z`
  const r = narrow ? 2.6 : 3.2

  const at = hoverA === null ? [] : points.filter((p) => p.A === hoverA)
  const hx = hoverA === null ? 0 : x(hoverA)

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
          if (px < m.l || px > width - m.r) return setHoverA(null)
          const A = Math.round(xInv(px))
          // the nearest mass number that has a point
          let best: number | null = null
          for (const p of points) if (best === null || Math.abs(p.A - A) < Math.abs(best - A)) best = p.A
          setHoverA(best)
        }}
        onPointerLeave={() => setHoverA(null)}
        onBlur={() => setHoverA(null)}
        onKeyDown={(e) => {
          const As = [...new Set(points.map((p) => p.A))].sort((a, b) => a - b)
          const i = hoverA === null ? -1 : As.indexOf(hoverA)
          if (e.key === "ArrowRight") setHoverA(As[Math.min(As.length - 1, i + 1)])
          else if (e.key === "ArrowLeft") setHoverA(As[Math.max(0, i < 0 ? As.length - 1 : i - 1)])
          else if (e.key === "Escape") setHoverA(null)
          else return
          e.preventDefault()
        }}
      >
        {SHELLS.map((s) =>
          s.A[1] >= Amin && s.A[0] <= Amax ? (
            <g key={s.N}>
              <rect
                x={x(s.A[0] - 0.5)}
                y={m.t}
                width={x(s.A[1] + 0.5) - x(s.A[0] - 0.5)}
                height={height - m.b - m.t}
                fill="var(--viz-grid)"
                opacity={0.55}
              />
              <text x={x((s.A[0] + s.A[1]) / 2)} y={m.t - 7} textAnchor="middle" fontSize={11} fill="var(--viz-text-muted)">
                {shellLabel(s.N)}
              </text>
            </g>
          ) : null,
        )}
        {yt.map((e) => (
          <g key={e}>
            <line x1={m.l} x2={width - m.r} y1={y.px(10 ** e)} y2={y.px(10 ** e)} stroke="var(--viz-grid)" />
            <text x={m.l - 6} y={y.px(10 ** e)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-text-muted)">
              <SvgSci>{pow10(e)}</SvgSci>
            </text>
          </g>
        ))}
        {1 >= y.lo && 1 <= y.hi && (
          <line x1={m.l} x2={width - m.r} y1={y.px(1)} y2={y.px(1)} stroke="var(--viz-axis)" strokeWidth={1.5} />
        )}
        {xt.map((a) => (
          <text key={a} x={x(a)} y={height - m.b + 16} textAnchor="middle" fontSize={11} fill="var(--viz-text-muted)">
            {a}
          </text>
        ))}
        <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke="var(--viz-axis)" />
        <text x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle" fontSize={12} fill="var(--viz-text-muted)">
          {xLabel}
        </text>
        <text transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--viz-text-muted)">
          {yLabel}
        </text>
        {hoverA !== null && <line x1={hx} x2={hx} y1={m.t} y2={height - m.b} stroke="var(--viz-text-muted)" />}

        {/* the unchanged burn: hollow grey */}
        {points.map((p) =>
          p.base > 0 && !below(p.base) ? (
            p.sOnly ? (
              <rect
                key={`b${p.name}`}
                x={x(p.A) - r - 0.5}
                y={clampY(p.base) - r - 0.5}
                width={2 * r + 1}
                height={2 * r + 1}
                fill="none"
                stroke="var(--viz-text-muted)"
                strokeWidth={1.25}
              />
            ) : (
              <circle key={`b${p.name}`} cx={x(p.A)} cy={clampY(p.base)} r={r} fill="none" stroke="var(--viz-axis)" strokeWidth={1.25} />
            )
          ) : null,
        )}
        {/* the changed burn */}
        {points.map((p) =>
          p.changed !== null && p.changed > 0 ? (
            below(p.changed) ? (
              <path key={`c${p.name}`} d={tri(x(p.A), r)} fill="var(--viz-text-muted)" opacity={0.7} />
            ) : p.sOnly ? (
              <rect
                key={`c${p.name}`}
                x={x(p.A) - r}
                y={clampY(p.changed) - r}
                width={2 * r}
                height={2 * r}
                fill="var(--viz-series-2)"
                stroke="var(--viz-surface)"
                strokeWidth={1}
              />
            ) : (
              <circle
                key={`c${p.name}`}
                cx={x(p.A)}
                cy={clampY(p.changed)}
                r={r - 0.4}
                fill="var(--viz-series-1)"
                stroke="var(--viz-surface)"
                strokeWidth={1}
              />
            )
          ) : null,
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs text-muted-foreground">
        {baseLabel && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              <circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--viz-axis)" strokeWidth="1.25" />
            </svg>
            {baseLabel}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="3.5" fill="var(--viz-series-1)" />
          </svg>
          {changedLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <rect x="1.5" y="1.5" width="7" height="7" fill="var(--viz-series-2)" />
          </svg>
          {sOnlyLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <path d="M1,2 L9,2 L5,9 Z" fill="var(--viz-text-muted)" opacity="0.7" />
          </svg>
          {belowLabel}
        </span>
      </div>
      {hoverA !== null && at.length > 0 && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={hx > width / 2 ? { right: width - hx + 12 } : { left: hx + 12 }}
        >
          <p className="font-medium">A = {hoverA}</p>
          <ul className="mt-1 space-y-0.5">
            {at.map((p) => (
              <li key={p.name} className="flex items-baseline justify-between gap-4">
                <span>
                  <Sci>{p.label}</Sci>
                  {p.sOnly && <span className="ml-1 text-muted-foreground">(s)</span>}
                </span>
                <span className="tabular text-muted-foreground">
                  <Sci>{`${sci(p.base, lang, 3)}${p.changed !== null && p.changed !== p.base ? ` → ${sci(p.changed, lang, 3)}` : ""}`}</Sci>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
