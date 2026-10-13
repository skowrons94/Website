"use client"

import { useMemo, useState } from "react"

import { useWidth } from "@/components/rates/chart-kit"
import { energy, kev } from "@/lib/data/format"
import { fill } from "@/lib/data/fill"
import { packLanes } from "@/lib/data/gap"
import { GROUPS, GROUP_SYMBOL, type Group } from "@/lib/data/quantity"
import type { DataExpertStrings } from "@/lib/i18n"
import type { Lang } from "@/lib/locale"

/** One dataset on the gap map; energies in keV (kT for a Maxwellian average). */
export interface MapRow {
  id: string
  g: Group
  e0: number
  e1: number
  /** counted as a measurement (gap.ts countsForRate), else drawn outlined */
  counted: boolean
  a: string
  y: number | null
  n: number
}

export interface MapWindow {
  label: string
  T9: number
  E0: number
  lo: number
  hi: number
  kT: number | null
}

/** Colour family of a quantity group: cross sections, angular data, integral quantities. */
const FAMILY: Record<Group, string> = {
  sigma: "var(--viz-series-1)",
  S: "var(--viz-series-1)",
  partial: "var(--viz-series-1)",
  dsigma: "var(--viz-series-3)",
  pol: "var(--viz-series-3)",
  yield: "var(--viz-series-2)",
  strength: "var(--viz-series-2)",
  macs: "var(--viz-series-2)",
  other: "var(--viz-axis)",
}

const LANE = 7
const LANE_GAP = 3
const GROUP_GAP = 9
const MAX_LANES = 14

/**
 * The gap map: every dataset's energy span as a bar, rows grouped by what
 * was measured (σ, S, partial, dσ/dΩ, polarisation, yield, ωγ, MACS), on a
 * log energy axis, with the Gamow window of the chosen temperature drawn
 * across all of them and the part of it below the lowest measurement
 * hatched. The picture is one image for a screen reader (its summary in
 * aria-label); the table under it holds the same numbers.
 */
export function GapMap({
  rows,
  window: w,
  others = [],
  lowest,
  threshold,
  strings,
  lang,
  title,
}: {
  rows: MapRow[]
  window: MapWindow | null
  /** the E₀ of the other temperatures, drawn as ticks */
  others?: MapWindow[]
  lowest: number | null
  threshold?: number | null
  strings: DataExpertStrings
  lang: Lang
  title?: string
}) {
  const t = strings.gap
  const [ref, width, k] = useWidth<HTMLDivElement>(720)
  const [hover, setHover] = useState<{ row: MapRow; x: number; y: number } | null>(null)
  const neutron = w?.kT !== null && w?.kT !== undefined

  const layout = useMemo(() => {
    const positive = rows.filter((r) => r.e0 > 0 && r.e1 > 0)
    const lows = positive.map((r) => r.e0)
    const highs = positive.map((r) => r.e1)
    const marks = [...(w ? [w.lo, w.hi] : []), ...others.map((o) => o.E0), ...(lowest ? [lowest] : [])]
    let min = Math.min(...lows, ...marks)
    let max = Math.max(...highs, ...marks)
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 1
      max = 1e4
    }
    const cap = neutron ? 2e4 : Math.max(2e4, (w?.hi ?? 0) * 4)
    const lo = Math.pow(10, Math.floor(Math.log10(min / 1.3)))
    const hi = Math.min(Math.pow(10, Math.ceil(Math.log10(max * 1.3))), Math.pow(10, Math.ceil(Math.log10(cap))))
    const groups = GROUPS.map((g) => {
      const members = positive.filter((r) => r.g === g)
      const lx = members.map((r) => [Math.log10(r.e0), Math.log10(Math.max(r.e1, r.e0 * 1.0001))] as [number, number])
      const lanes = packLanes(lx, (Math.log10(hi) - Math.log10(lo)) / 120)
      const nLanes = members.length ? Math.max(...lanes) + 1 : 0
      return { g, members, lanes, nLanes }
    }).filter((x) => x.members.length > 0)
    return { lo, hi, groups }
  }, [rows, w, others, lowest, neutron])

  const narrow = width < 520
  const left = narrow ? 46 : 64
  const right = 12
  const top = 30
  const plotW = Math.max(120, width - left - right)
  const x = (E: number) => left + ((Math.log10(E) - Math.log10(layout.lo)) / (Math.log10(layout.hi) - Math.log10(layout.lo))) * plotW
  const clampX = (E: number) => Math.min(left + plotW, Math.max(left, x(E)))
  // lanes: compressed when a group has very many
  let y = top
  const bands = layout.groups.map((grp) => {
    const lanes = Math.min(grp.nLanes, MAX_LANES)
    const step = grp.nLanes > MAX_LANES ? (MAX_LANES * (LANE + LANE_GAP)) / grp.nLanes : LANE + LANE_GAP
    const band = { ...grp, y0: y, step, h: Math.max(lanes * (LANE + LANE_GAP), 14) }
    y += band.h + GROUP_GAP
    return band
  })
  const plotBottom = y - GROUP_GAP + 6
  const height = plotBottom + 36
  const decades: number[] = []
  for (let d = Math.round(Math.log10(layout.lo)); d <= Math.round(Math.log10(layout.hi)); d++) decades.push(d)
  const every = decades.length > 9 ? 2 : 1

  const groupsText = layout.groups
    .map((grp) =>
      fill(t.groupSummary, {
        name: strings.quantityShort[grp.g],
        n: grp.members.length,
        lo: kev(Math.min(...grp.members.map((r) => r.e0)), lang),
        hi: kev(Math.max(...grp.members.map((r) => r.e1)), lang),
      }),
    )
    .join("; ")
  const summary = fill(t.summary, {
    groups: groupsText,
    lo: w ? kev(w.lo, lang) : "–",
    hi: w ? kev(w.hi, lang) : "–",
    T: w ? `T₉ = ${w.T9}` : "",
    lowest: lowest ? energy(lowest, lang) : "–",
  })

  const tick = (d: number) => {
    const unit = (p: number, name: string) => (p <= 2 ? `${10 ** p} ${name}` : `10${sup(p)} ${name}`)
    if (d >= 3) return unit(d - 3, "MeV")
    if (d >= 0) return unit(d, "keV")
    if (d >= -3) return unit(d + 3, "eV")
    if (d >= -6) return unit(d + 6, "meV")
    return `10${sup(d)} keV`
  }

  return (
    <div ref={ref} className="relative w-full">
      {title && <p className="mb-1 text-sm font-medium">{title}</p>}
      <svg
        role="img"
        aria-label={summary}
        width={width * k}
        height={height * k}
        viewBox={`0 0 ${width} ${height}`}
        className="block max-w-full select-none overflow-visible"
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <pattern id="gap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--viz-series-2)" strokeWidth="1.6" strokeOpacity="0.55" />
          </pattern>
        </defs>
        {/* decades */}
        {decades.map((d, i) => (
          <g key={d}>
            <line x1={x(10 ** d)} x2={x(10 ** d)} y1={top - 4} y2={plotBottom} stroke="var(--viz-grid)" />
            {i % every === 0 && (
              <text x={x(10 ** d)} y={plotBottom + 14} textAnchor="middle" fontSize={11} fill="var(--viz-text-muted)">
                {tick(d)}
              </text>
            )}
          </g>
        ))}
        <text x={left + plotW / 2} y={plotBottom + 30} textAnchor="middle" fontSize={11} fill="var(--viz-text-muted)">
          {layout.groups.some((g) => g.g === "macs") ? t.axisKT : t.axis}
        </text>
        {/* the window */}
        {w && (
          <g>
            <rect
              x={clampX(w.lo)}
              y={top - 4}
              width={Math.max(2, clampX(w.hi) - clampX(w.lo))}
              height={plotBottom - top + 4}
              fill="var(--viz-text)"
              fillOpacity={0.07}
              stroke="var(--viz-text-muted)"
              strokeDasharray="3 3"
              strokeWidth={0.8}
            />
            {lowest !== null && lowest > w.lo && (
              <rect
                x={clampX(w.lo)}
                y={top - 4}
                width={Math.max(0, clampX(Math.min(lowest, w.hi)) - clampX(w.lo))}
                height={plotBottom - top + 4}
                fill="url(#gap-hatch)"
              />
            )}
            <line x1={x(w.E0)} x2={x(w.E0)} y1={top - 10} y2={plotBottom} stroke="var(--viz-text)" strokeWidth={1.2} strokeDasharray="5 3" />
            <text
              x={x(w.E0)}
              y={top - 14}
              textAnchor={x(w.E0) > left + plotW * 0.7 ? "end" : "start"}
              fontSize={11}
              fontWeight={600}
              fill="var(--viz-text)"
            >
              {neutron ? `kT = ${kev(w.kT as number, lang)} keV` : `${t.peak} = ${kev(w.E0, lang)} keV`}
            </text>
          </g>
        )}
        {others.map((o, i) => (
          <line key={i} x1={x(o.E0)} x2={x(o.E0)} y1={top - 8} y2={top - 2} stroke="var(--viz-text-muted)" strokeWidth={1.2} />
        ))}
        {threshold ? (
          <line x1={x(threshold)} x2={x(threshold)} y1={top - 4} y2={plotBottom} stroke="var(--viz-text-muted)" strokeWidth={1} />
        ) : null}
        {/* bars */}
        {bands.map((b) => (
          <g key={b.g}>
            <text x={left - 8} y={b.y0 + Math.min(b.h, 14) / 2 + 4} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--viz-text)">
              {b.g === "other" ? strings.quantityShort.other : GROUP_SYMBOL[b.g]}
            </text>
            {b.members.map((r, j) => {
              const lane = b.lanes[j]
              const yy = b.y0 + lane * b.step
              const h = Math.max(2, Math.min(LANE, b.step - 1))
              const colour = FAMILY[r.g]
              const single = r.e1 <= r.e0 * 1.001
              const x0 = x(r.e0)
              const over = x(r.e1) > left + plotW + 0.5
              const x1 = clampX(r.e1)
              if (x0 > left + plotW) return null
              const onEnter = (ev: React.PointerEvent) => {
                const box = ((ev.currentTarget as SVGGraphicsElement).ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                setHover({ row: r, x: (ev.clientX - box.left), y: (ev.clientY - box.top) })
              }
              return single ? (
                <path
                  key={r.id}
                  d={`M${x0} ${yy} l${h / 2 + 0.5} ${h / 2} l${-(h / 2 + 0.5)} ${h / 2} l${-(h / 2 + 0.5)} ${-h / 2} z`}
                  fill={r.counted ? colour : "var(--viz-surface)"}
                  stroke={colour}
                  strokeWidth={1}
                  onPointerEnter={onEnter}
                />
              ) : (
                <g key={r.id} onPointerEnter={onEnter}>
                  <rect
                    x={x0}
                    y={yy}
                    width={Math.max(2, x1 - x0)}
                    height={h}
                    rx={1.5}
                    fill={r.counted ? colour : "var(--viz-surface)"}
                    fillOpacity={r.counted ? 0.85 : 1}
                    stroke={colour}
                    strokeWidth={r.counted ? 0 : 1}
                  />
                  {over && <path d={`M${x1 - 1} ${yy - 1} l4 ${h / 2 + 1} l-4 ${h / 2 + 1}z`} fill={colour} />}
                </g>
              )
            })}
          </g>
        ))}
        {/* the lowest measurement */}
        {lowest !== null && (
          <g>
            <line x1={x(lowest)} x2={x(lowest)} y1={top - 4} y2={plotBottom} stroke="var(--viz-series-2)" strokeWidth={1.6} />
            <text
              x={x(lowest) + 4}
              y={plotBottom - 3}
              fontSize={11}
              fontWeight={600}
              fill="var(--viz-text)"
              paintOrder="stroke"
              stroke="var(--viz-surface)"
              strokeWidth={3}
            >
              {t.lowest} {energy(lowest, lang)}
            </text>
          </g>
        )}
      </svg>
      {hover && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 max-w-[16rem] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.max(0, Math.min(hover.x + 8, width * k - 220)), top: hover.y + 14 }}
        >
          <p className="font-medium">
            {hover.row.a} {hover.row.y ?? ""} · <span className="tabular">{hover.row.id}</span>
          </p>
          <p className="text-muted-foreground">
            {strings.quantityShort[hover.row.g]} · {energy(hover.row.e0, lang)}
            {hover.row.e1 > hover.row.e0 * 1.001 ? `–${energy(hover.row.e1, lang)}` : ""} · {hover.row.n} pt
          </p>
        </div>
      )}
    </div>
  )
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"
function sup(n: number): string {
  return (n < 0 ? "⁻" : "") + String(Math.abs(n)).replace(/\d/g, (d) => SUP[Number(d)])
}
