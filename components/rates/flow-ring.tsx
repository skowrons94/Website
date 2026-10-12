"use client"

import { memo } from "react"

import { SvgSci } from "./chart-kit"
import { C, useWidth } from "./chart-kit"
import type { Network } from "@/lib/rates/schema"
import type { PathStep } from "@/lib/rates/flow"

/** "(p,γ)" out of "¹⁴N(p,γ)¹⁵O". */
const channel = (label: string) => label.match(/\([^)]*\)/)?.[0] ?? label

/**
 * The cycle (or chain) a nucleus follows, as a ring of nuclei: each arrow is
 * the reaction that carries the flow on, its width the matter that went
 * through it during the burn (∫ flux dt, from the network's own burn, on a
 * square-root scale so small flows stay visible). Side arrows are the
 * largest leak out of each nucleus. With a rate changed, the arrows take the
 * "changed" colour over a grey outline of the unchanged flow. The slowest
 * step is drawn in ink and named.
 */
export const FlowRing = memo(function FlowRing({
  network,
  path,
  closed,
  flows,
  flowsBase,
  slowest,
  label,
  slowestWord,
}: {
  network: Network
  path: PathStep[]
  closed: boolean
  /** integrated flow of every reaction (the burn shown) */
  flows: Float64Array | null
  /** the unchanged burn's, when a rate is changed */
  flowsBase: Float64Array | null
  /** index of the slowest step's reaction */
  slowest: number | null
  label: string
  slowestWord: string
}) {
  const [box, width] = useWidth<HTMLDivElement>(360)
  if (path.length < 2 || !flows) return <div ref={box} />
  const nuc = (i: number) => network.nuclei[i]
  const nodes = path.map((p) => p.nucleus)
  let terminal: number | null = null
  if (!closed) {
    const last = network.reactions[path[path.length - 1].reaction]
    terminal = [...last.products].sort((a, b) => nuc(b).A - nuc(a).A)[0] ?? null
    if (terminal !== null && !nodes.includes(terminal)) nodes.push(terminal)
  }
  const n = nodes.length
  const W = Math.min(width, 440)
  const H = closed ? Math.min(W, 380) : 150
  const R = closed ? Math.min(W, H) / 2 - 58 : 0
  const cx = W / 2
  const cy = H / 2 + (closed ? 4 : 10)
  const pos = nodes.map((_, i) =>
    closed
      ? {
          x: cx + R * Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n),
          y: cy + R * Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n),
        }
      : { x: 34 + ((W - 68) * i) / Math.max(1, n - 1), y: cy },
  )
  const node = 19
  const ref = flowsBase ?? flows
  const fmax = Math.max(...path.map((p) => ref[p.reaction]), 1e-300)
  const w = (F: number) => 1.5 + 10 * Math.sqrt(Math.max(0, F) / fmax)

  const edges = path
    .map((p, i) => {
      const j = closed ? (i + 1) % n : i + 1
      if (j >= n) return null
      return { p, a: pos[i], b: pos[j] }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)

  // the biggest leak out of each nucleus of the path, as a share of every
  // way the nucleus is destroyed (³He + ³He takes two ³He per reaction)
  const uses = (k: number, i: number) => network.reactions[k].reactants.filter((x) => x === i).length
  const leaks = path.flatMap((p, i) => {
    let total = 0
    let best = -1
    let bestF = 0
    network.reactions.forEach((r, k) => {
      if (r.target !== p.nucleus) return
      const f = flows[k] * uses(k, p.nucleus)
      total += f
      if (k === p.reaction) return
      const prod = [...r.products].sort((a, b) => nuc(b).A - nuc(a).A)[0]
      if (prod !== undefined && nodes.includes(prod)) return
      if (f > bestF) {
        bestF = f
        best = k
      }
    })
    if (best < 0 || !(total > 0) || bestF / total < 0.005) return []
    const r = network.reactions[best]
    const prod = [...r.products].sort((a, b) => nuc(b).A - nuc(a).A)[0]
    const out = closed ? { x: pos[i].x - cx, y: pos[i].y - cy } : { x: 0, y: 1 }
    const len = Math.hypot(out.x, out.y) || 1
    const ux = out.x / len
    const uy = out.y / len
    return [{ k: best, from: pos[i], ux, uy, frac: bestF / total, label: `${channel(r.label)}${nuc(prod).label}` }]
  })

  const arrow = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    width: number,
    color: string,
    key: string,
    opacity = 1,
  ) => {
    const dx = bx - ax
    const dy = by - ay
    const L = Math.hypot(dx, dy) || 1
    const ux = dx / L
    const uy = dy / L
    const s = { x: ax + ux * (node + 3), y: ay + uy * (node + 3) }
    const head = Math.max(7, width * 1.1)
    const e = { x: bx - ux * (node + 3 + head), y: by - uy * (node + 3 + head) }
    const tip = { x: bx - ux * (node + 3), y: by - uy * (node + 3) }
    const nx = -uy
    const ny = ux
    const hw = Math.max(5, width * 0.9)
    return (
      <g key={key} opacity={opacity}>
        <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={color} strokeWidth={width} strokeLinecap="butt" />
        <path
          d={`M${tip.x},${tip.y} L${e.x + nx * hw},${e.y + ny * hw} L${e.x - nx * hw},${e.y - ny * hw} Z`}
          fill={color}
        />
      </g>
    )
  }

  const changed = Boolean(flowsBase)
  return (
    <div ref={box} className="flex justify-center">
      <svg
        role="img"
        aria-label={label}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block overflow-visible"
      >
        {edges.map(({ p, a, b }) => {
          const isSlow = p.reaction === slowest
          const col = isSlow ? C.ink : changed ? C.changed : C.muted
          return (
            <g key={p.reaction}>
              {flowsBase && arrow(a.x, a.y, b.x, b.y, w(flowsBase[p.reaction]) + 3, C.base, `b${p.reaction}`, 0.55)}
              {arrow(a.x, a.y, b.x, b.y, w(flows[p.reaction]), col, `f${p.reaction}`)}
            </g>
          )
        })}
        {leaks.map((l) => {
          const len = 34
          const tx = l.from.x + l.ux * (node + len)
          const ty = l.from.y + l.uy * (node + len)
          return (
            <g key={`l${l.k}`}>
              {arrow(
                l.from.x,
                l.from.y,
                l.from.x + l.ux * (node + len + node + 3),
                l.from.y + l.uy * (node + len + node + 3),
                w(flows[l.k]),
                C.base,
                `lk${l.k}`,
              )}
              <text
                x={tx + l.ux * 8}
                y={ty + l.uy * 8}
                dy="0.32em"
                textAnchor={Math.abs(l.ux) < 0.3 ? "middle" : l.ux > 0 ? "start" : "end"}
                fontSize={10.5}
                fill={C.muted}
              >
                <SvgSci>{`${l.label} ${l.frac >= 0.1 ? Math.round(l.frac * 100) : (l.frac * 100).toPrecision(1)}%`}</SvgSci>
              </text>
            </g>
          )
        })}
        {edges.map(({ p, a, b }) => {
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          const ox = closed ? (mx - cx) / (Math.hypot(mx - cx, my - cy) || 1) : 0
          const oy = closed ? (my - cy) / (Math.hypot(mx - cx, my - cy) || 1) : -1
          const isSlow = p.reaction === slowest
          const r = network.reactions[p.reaction]
          const lx = mx + ox * (closed ? -24 : 18)
          const ly = my + oy * (closed ? -24 : 18)
          return (
            <g key={`t${p.reaction}`}>
              <text
                x={lx}
                y={ly}
                dy="0.32em"
                textAnchor="middle"
                fontSize={11}
                fill={isSlow ? C.ink : C.muted}
                fontWeight={isSlow ? 600 : 400}
              >
                <SvgSci>{channel(r.label)}</SvgSci>
              </text>
              {isSlow && (
                <text x={lx} y={ly + 13} dy="0.32em" textAnchor="middle" fontSize={10} fill={C.ink}>
                  {slowestWord}
                </text>
              )}
            </g>
          )
        })}
        {nodes.map((k, i) => (
          <g key={k}>
            <circle cx={pos[i].x} cy={pos[i].y} r={node} fill={C.surface} stroke={C.ink} strokeWidth={1.25} />
            <text x={pos[i].x} y={pos[i].y} dy="0.34em" textAnchor="middle" fontSize={13} fontWeight={600} fill={C.ink}>
              <SvgSci>{nuc(k).label}</SvgSci>
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
})
