import Link from "next/link"

import { getMapData } from "@/lib/atlas"
import { dict, localePath, type Lang } from "@/lib/i18n"
import { prefetchFor } from "@/lib/prefetch"

/*
 * The landing page's picture: one process of the atlas, drawn on its own patch
 * of the chart of nuclides, server-rendered and static.
 *
 * It is a small cousin of components/atlas/network-map.tsx, not a reuse of it:
 * the map is a client component with zoom, tooltips and keyboard handling, none
 * of which a thumbnail needs, and pulling it in would ship all of that to the
 * landing page. What it shares is the look — the same chart tokens, the same
 * cell fills (stable nuclides filled, radioactive ones outlined), the first
 * series hue for the first network of a family, line weight by importance — and
 * the data, which comes from the same getMapData() the atlas uses, so the
 * picture cannot drift from the map it links to.
 */

const NETWORK = "cno1"
const FAMILY = "cno"
const CELL = 0.6 // small cells, so the arrows run in the gaps between them
const WEIGHT = { key: 0.07, major: 0.05, minor: 0.038 } as const
const PAD_LEFT = 0.6 // band for the element symbols
const PAD = 0.2
const PAD_BOTTOM = 0.55 // room for an arrow that goes round underneath

export function HomeNetwork({ lang }: { lang: Lang }) {
  const t = dict(lang).home
  const map = getMapData(lang)
  const network = map.networks.find((n) => n.id === NETWORK)
  if (!network) return null
  const reactions = network.reactions
    .map((id) => map.reactions.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
  if (reactions.length === 0) return null

  const ends = reactions.flatMap((r) => [r.from, r.to])
  const n0 = Math.min(...ends.map((e) => e.N))
  const n1 = Math.max(...ends.map((e) => e.N))
  const z0 = Math.min(...ends.map((e) => e.Z))
  const z1 = Math.max(...ends.map((e) => e.Z))
  const used = new Set(ends.map((e) => `${e.A}-${e.Z}`))
  const cells = map.cells.filter((c) => c.N >= n0 && c.N <= n1 && c.Z >= z0 && c.Z <= z1)
  const symbols = new Map<number, string>()
  for (const c of cells) symbols.set(c.Z, c.symbol)

  // Chart coordinates: neutrons to the right, protons up.
  const x = (N: number) => PAD_LEFT + (N - n0) + 0.5
  const y = (Z: number) => PAD + (z1 - Z) + 0.5
  const width = PAD_LEFT + (n1 - n0 + 1) + PAD
  const height = PAD + PAD_BOTTOM + (z1 - z0 + 1)

  const arrows = reactions.map((r) => {
    const ax = x(r.from.N)
    const ay = y(r.from.Z)
    const bx = x(r.to.N)
    const by = y(r.to.Z)
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    // Straight, edge to edge: from just outside one cell to just outside the
    // other, wherever the line leaves the square.
    const ux0 = dx / len
    const uy0 = dy / len
    const edge = CELL / 2 / Math.max(Math.abs(ux0), Math.abs(uy0)) + 0.04
    let start = { x: ax + ux0 * edge, y: ay + uy0 * edge }
    let tip = { x: bx - ux0 * edge, y: by - uy0 * edge }
    // Bezier control points: a straight line unless changed below.
    let c1 = start
    let c2 = tip
    // A step of more than one column (the (p,α) that closes a cycle) would cut
    // across the arrows in between: it leaves from the bottom of its cell,
    // drops through the gap between the cells below, and comes round
    // underneath to the bottom of the cell it ends in.
    if (Math.abs(r.to.N - r.from.N) > 1) {
      const s = Math.sign(dx)
      const bottom = Math.max(ay, by) + CELL / 2
      start = { x: ax + s * (CELL / 2 - 0.1), y: ay + CELL / 2 + 0.04 }
      tip = { x: bx - s * 0.05, y: by + CELL / 2 + 0.05 }
      c1 = { x: ax + s * 0.5, y: bottom + 0.15 }
      c2 = { x: bx - s * 0.45, y: bottom + 0.75 }
    }
    // The arrowhead follows the curve's last tangent.
    const from = c2.x === tip.x && c2.y === tip.y ? start : c2
    const tx = tip.x - from.x
    const ty = tip.y - from.y
    const tl = Math.hypot(tx, ty) || 1
    const ux = tx / tl
    const uy = ty / tl
    const head = 0.13
    const half = head * 0.55
    const bxh = tip.x - ux * head
    const byh = tip.y - uy * head
    const end = { x: tip.x - ux * head * 0.6, y: tip.y - uy * head * 0.6 }
    const f = (p: { x: number; y: number }) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
    const c2end = c2 === tip ? end : c2
    // Three kinds of step, told apart twice (line style and hue) so the
    // picture reads in greyscale too: proton captures solid in the first
    // series hue, β⁺ decays dashed, and the (p,α) that closes the cycle in
    // the second hue.
    const style: "capture" | "decay" | "close" =
      r.kind === "decay" ? "decay" : Math.abs(r.to.N - r.from.N) > 1 ? "close" : "capture"
    return {
      r,
      style,
      color: style === "close" ? "var(--viz-series-2)" : "var(--viz-series-1)",
      d: `M${f(start)} C${f(c1)} ${f(c2end)} ${f(end)}`,
      head: `M${tip.x.toFixed(3)},${tip.y.toFixed(3)} L${(bxh - uy * half).toFixed(3)},${(byh + ux * half).toFixed(3)} L${(bxh + uy * half).toFixed(3)},${(byh - ux * half).toFixed(3)} Z`,
      weight: WEIGHT[r.importance],
    }
  })

  return (
    <figure className="m-0">
      <Link
        href={localePath(lang, `/atlas#${FAMILY}`)}
        prefetch={prefetchFor("/atlas")}
        className="group block rounded-lg border border-border bg-[var(--viz-surface)] p-3 transition-colors hover:border-[var(--viz-axis)] sm:p-4"
      >
        <svg
          viewBox={`0 0 ${width.toFixed(2)} ${height.toFixed(2)}`}
          role="img"
          aria-label={t.figureAlt(network.name)}
          className="mx-auto block h-auto w-full max-w-[22rem]"
        >
          {cells.map((c) => {
            const active = used.has(`${c.A}-${c.Z}`)
            return (
              <g key={c.code}>
                <rect
                  x={x(c.N) - CELL / 2}
                  y={y(c.Z) - CELL / 2}
                  width={CELL}
                  height={CELL}
                  rx={0.06}
                  fill={c.stable ? (active ? "var(--atlas-cell-strong)" : "var(--atlas-cell)") : "var(--viz-surface)"}
                  stroke={active ? "var(--viz-text-muted)" : "var(--atlas-cell-edge)"}
                  strokeWidth={active ? 0.022 : 0.015}
                />
                <text
                  x={x(c.N)}
                  y={y(c.Z) + 0.06}
                  textAnchor="middle"
                  fontSize={0.18}
                  fill={active ? "var(--viz-text)" : "var(--viz-text-muted)"}
                  fontWeight={active ? 600 : 400}
                >
                  <tspan fontSize={0.115} dy={-0.07}>
                    {c.A}
                  </tspan>
                  <tspan dy={0.07}>{c.symbol}</tspan>
                </text>
              </g>
            )
          })}
          {[...symbols.entries()].map(([Z, symbol]) => (
            <text
              key={Z}
              x={PAD_LEFT - 0.05}
              y={y(Z) + 0.07}
              textAnchor="end"
              fontSize={0.2}
              fill="var(--viz-text-muted)"
            >
              {symbol}
            </text>
          ))}
          {arrows.map((a) => (
            <g key={a.r.id}>
              <path
                d={a.d}
                fill="none"
                stroke="var(--viz-surface)"
                strokeWidth={a.weight + 0.06}
                strokeLinecap="round"
              />
              <path
                d={a.d}
                fill="none"
                stroke={a.color}
                strokeWidth={a.weight}
                strokeLinecap={a.style === "decay" ? "butt" : "round"}
                strokeDasharray={a.style === "decay" ? "0.09 0.065" : undefined}
              />
              <path d={a.head} fill={a.color} />
            </g>
          ))}
        </svg>
      </Link>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {(
          [
            ["capture", t.legendCapture],
            ["decay", t.legendDecay],
            ["close", t.legendClose],
          ] as const
        )
          .filter(([style]) => arrows.some((a) => a.style === style))
          .map(([style, label]) => (
            <li key={style} className="inline-flex items-center gap-1.5">
              <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden className="shrink-0">
                <line
                  x1="1"
                  y1="4"
                  x2="20"
                  y2="4"
                  stroke={style === "close" ? "var(--viz-series-2)" : "var(--viz-series-1)"}
                  strokeWidth="1.8"
                  strokeDasharray={style === "decay" ? "3.5 2.5" : undefined}
                />
                <path d="M25,4 L19,1 L19,7 Z" fill={style === "close" ? "var(--viz-series-2)" : "var(--viz-series-1)"} />
              </svg>
              {label}
            </li>
          ))}
      </ul>
      <figcaption className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
        {t.figureCaption(network.name, network.summary)}{" "}
        <Link
          href={localePath(lang, `/atlas#${FAMILY}`)}
          prefetch={prefetchFor("/atlas")}
          className="whitespace-nowrap text-link underline-offset-4 hover:underline"
        >
          {t.figureLink}
        </Link>
      </figcaption>
    </figure>
  )
}
