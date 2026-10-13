import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { StatusBadge, STATUSES } from "@/components/atlas/status-badge"
import { Said } from "@/components/data/said"
import { STATUS_STYLE, StatusLine } from "@/components/data/status-style"
import type { Status } from "@/lib/atlas"
import { statusLabel } from "@/lib/atlas-format"
import { dataPublicDict } from "@/lib/data/i18n-public"
import type { ChartArrow, StatusChart as ChartData } from "@/lib/data/public"
import { localePath, type Lang } from "@/lib/locale"

/**
 * "How well do we know it?": the light nuclides, N across and Z up, with an
 * arrow for each reaction of the atlas from its target to its product, drawn
 * in the style of its status (components/data/status-style.tsx: a hue and a
 * dash pattern each). Drawn on the server, no JavaScript: each arrow is a link
 * to the reaction for a mouse or a finger, and the list under the chart,
 * grouped by status, carries the same links for the keyboard and for screen
 * readers (the picture itself is one image with a description).
 */

const CELL = 0.86

function arrowPath(a: ChartArrow, index: number, siblings: number, maxZ: number) {
  const ax = a.from.N
  const ay = maxZ - a.from.Z
  const bx = a.to.N
  const by = maxZ - a.to.Z
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const gcd = (p: number, q: number): number => (q ? gcd(q, p % q) : p)
  const bow = gcd(Math.abs(dx), Math.abs(dy)) > 1 ? 0.8 : 0
  const offset = (index - (siblings - 1) / 2) * 0.36 + bow
  const cx = (ax + bx) / 2 + nx * offset
  const cy = (ay + by) / 2 + ny * offset
  const pull = (px: number, py: number, d: number) => {
    const ux = cx - px
    const uy = cy - py
    const l = Math.hypot(ux, uy) || 1
    return { x: px + (ux / l) * d, y: py + (uy / l) * d }
  }
  const start = pull(ax, ay, 0.3)
  const tip = pull(bx, by, 0.36)
  const tx = tip.x - cx
  const ty = tip.y - cy
  const tl = Math.hypot(tx, ty) || 1
  const ux = tx / tl
  const uy = ty / tl
  const head = 0.2
  const half = head * 0.55
  const baseX = tip.x - ux * head
  const baseY = tip.y - uy * head
  const r = (v: number) => Math.round(v * 1000) / 1000
  return {
    d: `M${r(start.x)},${r(start.y)} Q${r(cx)},${r(cy)} ${r(tip.x - ux * head * 0.7)},${r(tip.y - uy * head * 0.7)}`,
    head: `M${r(tip.x)},${r(tip.y)} L${r(baseX - uy * half)},${r(baseY + ux * half)} L${r(baseX + uy * half)},${r(baseY - ux * half)} Z`,
  }
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"
const sup = (n: number) => String(n).replace(/\d/g, (d) => SUP[Number(d)])

export function StatusChart({ data, lang }: { data: ChartData; lang: Lang }) {
  const t = dataPublicDict(lang)
  const to = (p: string) => localePath(lang, p)
  // a plain <a> inside the SVG (not next/link): the base path and the static
  // export's trailing slash by hand
  const raw = (p: string) => `${process.env.BASE_PATH ?? ""}${to(p)}${process.env.TRAILING_SLASH ? "/" : ""}`
  const { arrows, cells, maxZ, maxN } = data

  // The chart shows the nuclides the arrows touch, with a margin.
  let nMax = 0
  let zMax = 0
  for (const a of arrows) {
    nMax = Math.max(nMax, a.from.N, a.to.N)
    zMax = Math.max(zMax, a.from.Z, a.to.Z)
  }
  nMax = Math.min(maxN, nMax + 1)
  zMax = Math.min(maxZ, zMax + 1)
  const top = maxZ - zMax
  const left = 1.25
  const bottom = 0.9
  const vb = { x: -0.5 - left, y: top - 0.5, w: nMax + 1 + left, h: zMax + 1 + bottom }

  // Pairs of nuclides joined by more than one reaction fan out.
  const pairs = new Map<string, ChartArrow[]>()
  for (const a of arrows) {
    const key = [a.from.N, a.from.Z, a.to.N, a.to.Z].join(",")
    pairs.set(key, [...(pairs.get(key) ?? []), a])
  }
  // Minor reactions first, so the key ones are drawn on top.
  const weight = { key: 2, major: 1, minor: 0 }
  const drawn = [...arrows].sort((a, b) => weight[a.importance] - weight[b.importance])
  const shown = cells.filter((c) => c.N <= nMax && c.Z <= zMax && c.Z >= 0)
  const symbols = new Map<number, string>()
  for (const c of shown) if (!symbols.has(c.Z)) symbols.set(c.Z, c.symbol)

  const all = [...arrows, ...data.offChart]
  const byStatus = (s: Status) =>
    all.filter((a) => a.status === s).sort((a, b) => a.from.Z - b.from.Z || a.from.N - b.from.N || a.id.localeCompare(b.id))

  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] lg:items-start">
        <figure className="min-w-0">
          {/* on a phone the chart keeps a legible size and scrolls sideways in its frame */}
          {/* the list beside the chart says the same in text: the drawing is hidden from screen readers, its frame is a named, focusable region (it scrolls on a phone) */}
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label={t.chartLabel(String(arrows.length))}>
            <svg
              viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              className="h-auto w-full min-w-[36rem] max-w-[44rem] select-none sm:min-w-0"
              aria-hidden
            >
              {/* the cells */}
              {shown.map((c) => {
                const x = c.N
                const y = maxZ - c.Z
                return (
                  <g key={c.code}>
                    <rect
                      x={x - CELL / 2}
                      y={y - CELL / 2}
                      width={CELL}
                      height={CELL}
                      rx={0.08}
                      fill={c.inNetwork ? "var(--viz-surface)" : "transparent"}
                      stroke={c.inNetwork ? "var(--viz-axis)" : "var(--viz-grid)"}
                      strokeWidth={c.stable ? 1.4 : 0.8}
                      vectorEffect="non-scaling-stroke"
                    />
                    {c.inNetwork && (
                      <text
                        x={x}
                        y={y + 0.1}
                        textAnchor="middle"
                        fontSize={0.27}
                        fill="var(--viz-text-muted)"
                        className="font-sans"
                      >
                        {sup(c.A)}
                        {c.symbol}
                      </text>
                    )}
                  </g>
                )
              })}
              {/* the axes: element symbols on the left, neutron numbers below */}
              {[...symbols.entries()].map(([Z, sym]) => (
                <text
                  key={`z${Z}`}
                  x={-0.5 - left / 2}
                  y={maxZ - Z + 0.1}
                  textAnchor="middle"
                  fontSize={0.32}
                  fill="var(--viz-text-muted)"
                  className="font-sans"
                >
                  {sym}
                </text>
              ))}
              {Array.from({ length: nMax + 1 }, (_, N) => N)
                .filter((N) => N % 2 === 0)
                .map((N) => (
                  <text
                    key={`n${N}`}
                    x={N}
                    y={maxZ + 0.5 + bottom * 0.62}
                    textAnchor="middle"
                    fontSize={0.3}
                    fill="var(--viz-text-muted)"
                    className="tabular font-sans"
                  >
                    {N}
                  </text>
                ))}
              {/* the reactions */}
              {drawn.map((a) => {
                const key = [a.from.N, a.from.Z, a.to.N, a.to.Z].join(",")
                const group = pairs.get(key)!
                const { d, head } = arrowPath(a, group.indexOf(a), group.length, maxZ)
                const s = STATUS_STYLE[a.status]
                const w = s.width * (a.importance === "key" ? 1.15 : a.importance === "minor" ? 0.8 : 1)
                return (
                  <a key={a.id} href={raw(`/atlas/${a.id}`)} tabIndex={-1} className="group cursor-pointer">
                    <title>{`${a.label}: ${a.plain}`}</title>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />
                    <path
                      d={d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={w}
                      strokeDasharray={s.dash}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      className="transition-[stroke-width] motion-reduce:transition-none group-hover:[stroke-width:4.5px]"
                    />
                    <path d={head} fill={a.status === "unmeasured" ? "var(--viz-surface)" : s.color} stroke={s.color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                  </a>
                )
              })}
            </svg>
          </div>
          <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>↑ {t.axisZ}</span>
            <span>→ {t.axisN}</span>
          </figcaption>
        </figure>

        {/* the legend: line, icon and word */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">{t.legendTitle}</p>
          <ul className="mt-3 space-y-3">
            {STATUSES.map((s) => (
              <li key={s} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusLine status={s} />
                <StatusBadge status={s} lang={lang} />
                <span className="tabular text-xs text-muted-foreground">{t.statusCount(byStatus(s).length)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* the same, as a list: the keyboard's and the screen reader's chart */}
      <details className="group mt-8 rounded-lg border border-border/80">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
          <h3 className="font-serif text-lg font-semibold tracking-tight">{t.listTitle}</h3>
        </summary>
        <div className="grid gap-6 px-4 pb-5 pt-2 md:grid-cols-2">
          {STATUSES.map((s) => {
            const list = byStatus(s)
            if (list.length === 0) return null
            return (
              <section key={s} aria-label={statusLabel(s, lang)} className="min-w-0">
                <h4 className="flex items-center gap-3">
                  <StatusLine status={s} />
                  <StatusBadge status={s} lang={lang} link />
                </h4>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {list.map((a) => (
                    <li key={a.id} className="inline-flex items-stretch overflow-hidden rounded-md border border-border bg-card text-sm">
                      <Link
                        href={to(`/atlas/${a.id}`)}
                        className="inline-flex min-h-10 items-center px-2.5 font-serif font-semibold transition-colors hover:bg-accent hover:text-link"
                      >
                        <Said label={a.label} plain={a.plain} />
                      </Link>
                      {a.data && (
                        <Link
                          href={to(`/data/reaction/${a.data}`)}
                          aria-label={t.measurementsAria(a.plain)}
                          className="inline-flex min-h-10 items-center border-l border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-link"
                        >
                          {t.measurements}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </details>
    </div>
  )
}
