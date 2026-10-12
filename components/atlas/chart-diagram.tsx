import { dict, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * How to read the chart of nuclides, as one small static picture: a nucleus
 * captures a proton (up), the product decays by β⁺ (down and right), captures
 * a neutron (right) or a helium nucleus (two up, two right). Filled cells are
 * stable, outlined ones radioactive, as on the map. Server-rendered, no
 * script; the colours are the map's own, so it reads the same in both themes.
 */

const P = 1 // pitch
const C = 0.84 // cell side
const MAXZ = 3

// Cells as [N, Z, stable].
const CELLS: [number, number, boolean][] = [
  [1, 1, true],
  [1, 2, false],
  [2, 1, true],
  [3, 1, true],
  [4, 3, true],
]

const x = (N: number) => N * P
const y = (Z: number) => (MAXZ - Z) * P

function Arrow({
  from,
  to,
  color,
  bow = 0,
}: {
  from: [number, number]
  to: [number, number]
  color: string
  bow?: number
}) {
  const ax = x(from[0])
  const ay = y(from[1])
  const bx = x(to[0])
  const by = y(to[1])
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  const nx = -dy / len
  const ny = dx / len
  const cx = (ax + bx) / 2 + nx * bow
  const cy = (ay + by) / 2 + ny * bow
  const pull = (px: number, py: number, d: number) => {
    const ux = cx - px
    const uy = cy - py
    const l = Math.hypot(ux, uy) || 1
    return [px + (ux / l) * d, py + (uy / l) * d]
  }
  const [sx, sy] = pull(ax, ay, 0.32)
  const [tx, ty] = pull(bx, by, 0.34)
  const ux = (tx - cx) / (Math.hypot(tx - cx, ty - cy) || 1)
  const uy = (ty - cy) / (Math.hypot(tx - cx, ty - cy) || 1)
  const h = 0.17
  const w = h * 0.6
  const baseX = tx - ux * h
  const baseY = ty - uy * h
  return (
    <g>
      <path
        d={`M${sx},${sy} Q${cx},${cy} ${tx - ux * h * 0.6},${ty - uy * h * 0.6}`}
        fill="none"
        stroke={color}
        strokeWidth={0.07}
        strokeLinecap="round"
      />
      <path d={`M${tx},${ty} L${baseX - uy * w},${baseY + ux * w} L${baseX + uy * w},${baseY - ux * w} Z`} fill={color} />
    </g>
  )
}

export function ChartDiagram({ lang, className }: { lang: Lang; className?: string }) {
  const t = dict(lang).atlas.diagram
  const label = { fontSize: 0.27, fill: "var(--viz-text)" }
  const muted = { fontSize: 0.24, fill: "var(--viz-text-muted)" }
  return (
    <figure className={cn("rounded-lg border border-border p-3", className)} style={{ background: "var(--viz-surface)" }}>
      <svg viewBox="-1.25 -0.7 7.2 5.25" role="img" aria-label={t.label} className="block h-auto w-full">
        {/* axes */}
        <g>
          <line x1={-0.65} y1={y(0) + 0.2} x2={-0.65} y2={y(MAXZ) - 0.35} stroke="var(--viz-axis)" strokeWidth={0.035} />
          <path d={`M-0.65,${y(MAXZ) - 0.45} l-0.08,0.16 h0.16 Z`} fill="var(--viz-axis)" />
          <text x={-0.5} y={y(MAXZ) - 0.38} {...muted}>
            {t.protons}
          </text>
          <line x1={-0.65} y1={y(0) + 0.2} x2={x(4) + 0.6} y2={y(0) + 0.2} stroke="var(--viz-axis)" strokeWidth={0.035} />
          <path d={`M${x(4) + 0.7},${y(0) + 0.2} l-0.16,-0.08 v0.16 Z`} fill="var(--viz-axis)" />
          <text x={x(4) + 0.6} y={y(0) + 0.5} textAnchor="end" {...muted}>
            {t.neutrons}
          </text>
        </g>

        {/* cells */}
        {CELLS.map(([N, Z, stable]) => (
          <rect
            key={`${N}-${Z}`}
            x={x(N) - C / 2}
            y={y(Z) - C / 2}
            width={C}
            height={C}
            rx={0.07}
            fill={stable ? "var(--atlas-cell-strong)" : "var(--viz-surface)"}
            stroke="var(--viz-text-muted)"
            strokeWidth={0.03}
          />
        ))}

        {/* arrows */}
        <Arrow from={[1, 1]} to={[1, 2]} color="var(--viz-series-1)" />
        <Arrow from={[1, 2]} to={[2, 1]} color="var(--viz-series-1)" />
        <Arrow from={[2, 1]} to={[3, 1]} color="var(--viz-series-2)" />
        <Arrow from={[2, 1]} to={[4, 3]} color="var(--viz-series-3)" bow={-0.55} />

        {/* labels */}
        <text x={x(1) - 0.52} y={y(1.5) + 0.09} textAnchor="end" {...label}>
          {t.pCapture}
        </text>
        <text x={x(1.5) + 0.12} y={y(1.5) - 0.02} {...label}>
          {t.betaPlus}
        </text>
        <text x={x(2.5)} y={y(1) + 0.68} textAnchor="middle" {...label}>
          {t.nCapture}
        </text>
        <text x={x(3.3)} y={y(2) + 0.12} {...label}>
          {t.aCapture}
        </text>

        {/* legend */}
        <g transform={`translate(${x(3) - 0.15}, ${y(0) + 0.75})`}>
          <rect x={-2.6} y={-0.17} width={0.3} height={0.3} rx={0.04} fill="var(--atlas-cell-strong)" stroke="var(--viz-text-muted)" strokeWidth={0.03} />
          <text x={-2.2} y={0.08} {...muted}>
            {t.stable}
          </text>
          <rect x={-0.55} y={-0.17} width={0.3} height={0.3} rx={0.04} fill="var(--viz-surface)" stroke="var(--viz-text-muted)" strokeWidth={0.03} />
          <text x={-0.15} y={0.08} {...muted}>
            {t.radioactive}
          </text>
        </g>
      </svg>
    </figure>
  )
}
