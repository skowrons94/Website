import { getSProcessPath, type SCell, type SEdge, type SPath } from "@/lib/atlas"
import { decimal, type Lang } from "@/lib/i18n"

/**
 * The s-process path on the chart of nuclides, iron to bismuth, as static SVG
 * rendered on the server: no client code, light and dark through the chart
 * tokens of globals.css.
 *
 * The path itself is computed (lib/atlas-core.mjs, sProcessPath) from the
 * NUBASE2020 half-lives and AME2020 masses with one rule: capture if the
 * nucleus lives longer than a year, decay otherwise, both at the classic
 * branch points. The overview is drawn small, one thin cell per nuclide; the
 * insets redraw three branchings with labels.
 */

/** `10.7 yr`, `37.6 Gyr`, `5.37 d`: short enough for a 44 px cell. */
export function compactHalfLife(seconds: number | null, lang: Lang): string {
  if (seconds === null || !Number.isFinite(seconds)) return ""
  const u =
    lang === "it"
      ? { s: "s", min: "min", h: "h", d: "g", y: "a", ky: "ka", My: "Ma", Gy: "Ga" }
      : { s: "s", min: "min", h: "h", d: "d", y: "yr", ky: "kyr", My: "Myr", Gy: "Gyr" }
  const Y = 365.2422 * 86400
  const fmt = (v: number) => decimal(String(Number(v.toPrecision(v < 100 ? 3 : 3))), lang)
  if (seconds < 60) return `${fmt(seconds)} ${u.s}`
  if (seconds < 3600) return `${fmt(seconds / 60)} ${u.min}`
  if (seconds < 86400) return `${fmt(seconds / 3600)} ${u.h}`
  if (seconds < Y) return `${fmt(seconds / 86400)} ${u.d}`
  const y = seconds / Y
  if (y < 1e3) return `${fmt(y)} ${u.y}`
  if (y < 1e6) return `${fmt(y / 1e3)} ${u.ky}`
  if (y < 1e9) return `${fmt(y / 1e6)} ${u.My}`
  if (y < 1e13) return `${fmt(y / 1e9)} ${u.Gy}`
  return `> 10^13 ${u.y}`
}

/** A nuclide name in SVG: the mass number raised, in the surrounding font. */
function Nuclide({ x, y, A, symbol, anchor = "start" }: { x: number; y: number; A: number; symbol: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={11} fontWeight={600} fill="var(--viz-text)">
      <tspan fontSize={8} dy={-3.5}>
        {A}
      </tspan>
      <tspan dy={3.5}>{symbol}</tspan>
    </text>
  )
}

const MAGIC = [
  { N: 50, peak: "Sr–Y–Zr" },
  { N: 82, peak: "Ba–La–Ce" },
  { N: 126, peak: "Pb" },
]

/** The elements named on the overview's left edge: the seeds, the peaks, the end. */
const LABELLED_Z = [26, 30, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82]

export interface Inset {
  id: string
  letter: string
  z: [number, number]
  n: [number, number]
  label: string
}

/** Fill and outline of a cell, by what it is. Tokens only. */
function cellPaint(c: SCell) {
  if (c.role === "s-only") return { fill: "var(--viz-series-2)", stroke: "var(--viz-series-2)" }
  if (c.stable || c.primordial)
    return c.onPath
      ? { fill: "var(--atlas-cell-strong)", stroke: "var(--viz-axis)" }
      : { fill: "var(--atlas-cell)", stroke: "var(--atlas-cell-edge)" }
  return { fill: "var(--viz-surface)", stroke: "var(--viz-axis)" }
}

/* -- the overview ----------------------------------------------------------- */

export function SProcessOverview({
  lang,
  insets,
  label,
  describedBy,
}: {
  lang: Lang
  insets: Inset[]
  label: string
  describedBy?: string
}) {
  const path = getSProcessPath(lang)
  const P = 7 // pitch, user units (≈ px at the natural size)
  const S = 6 // cell side
  const n0 = path.nMin
  const n1 = path.nMax
  const z0 = path.zMin
  const z1 = path.zMax
  const L = 34
  const T = 40
  const R = 14
  const B = 34
  const W = L + (n1 - n0 + 1) * P + R
  const H = T + (z1 - z0 + 1) * P + B
  const x = (N: number) => L + (N - n0) * P + P / 2
  const y = (Z: number) => T + (z1 - Z) * P + P / 2
  const byCode = new Map(path.cells.map((c) => [c.code, c]))
  const ends = (e: SEdge) => [byCode.get(e.from), byCode.get(e.to)] as const
  const gridBottom = T + (z1 - z0 + 1) * P
  // The leftmost drawn cell of each labelled row.
  const rowStart = new Map<number, number>()
  for (const c of path.cells) rowStart.set(c.Z, Math.min(rowStart.get(c.Z) ?? Infinity, c.N))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      className="block h-auto w-full min-w-[40rem] select-none"
      fontFamily="inherit"
    >
      <title>{label}</title>
      <rect x="0" y="0" width={W} height={H} fill="var(--viz-surface)" />

      {/* closed neutron shells */}
      {MAGIC.map((m) => (
        <g key={m.N}>
          <rect
            x={x(m.N) - P / 2}
            y={T - 2}
            width={P}
            height={gridBottom - T + 4}
            fill="var(--viz-series-3)"
            fillOpacity={0.16}
          />
          <text x={x(m.N)} y={T - 22} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--viz-text)">
            N = {m.N}
          </text>
          <text x={x(m.N)} y={T - 8} textAnchor="middle" fontSize={11} fill="var(--viz-text-muted)">
            {m.peak}
          </text>
        </g>
      ))}

      {/* N ticks */}
      {Array.from({ length: Math.floor(n1 / 10) - Math.ceil(n0 / 10) + 1 }, (_, i) => (Math.ceil(n0 / 10) + i) * 10).map((N) => (
        <g key={N}>
          <line x1={x(N)} x2={x(N)} y1={gridBottom + 1} y2={gridBottom + 5} stroke="var(--viz-axis)" strokeWidth={1} />
          <text x={x(N)} y={gridBottom + 16} textAnchor="middle" fontSize={11} fill="var(--viz-text-muted)" className="tabular">
            {N}
          </text>
        </g>
      ))}
      <text x={W - R} y={H - 3} textAnchor="end" fontSize={10.5} fill="var(--viz-text-muted)">
        {lang === "it" ? "neutroni N →" : "neutrons N →"}
      </text>

      {/* cells */}
      <g>
        {path.cells.map((c) => {
          const paint = cellPaint(c)
          return (
            <rect
              key={c.code}
              x={x(c.N) - S / 2}
              y={y(c.Z) - S / 2}
              width={S}
              height={S}
              rx={1}
              fill={paint.fill}
              stroke={c.branch ? "var(--viz-series-1)" : paint.stroke}
              strokeWidth={c.branch ? 1.6 : 0.6}
            />
          )
        })}
      </g>

      {/* the path */}
      <g fill="none" stroke="var(--viz-series-1)" strokeWidth={1.25} strokeLinecap="round">
        {path.edges.map((e, i) => {
          const [a, b] = ends(e)
          if (!a || !b) return null
          if (e.kind === "alpha") {
            const mx = (x(a.N) + x(b.N)) / 2 + 16
            const my = (y(a.Z) + y(b.Z)) / 2
            return (
              <path
                key={i}
                d={`M${x(a.N)},${y(a.Z)} Q${mx},${my} ${x(b.N) + 2},${y(b.Z) - 1}`}
                strokeDasharray="2.5 2"
              />
            )
          }
          return <line key={i} x1={x(a.N)} y1={y(a.Z)} x2={x(b.N)} y2={y(b.Z)} />
        })}
      </g>

      {/* element names on the left of their rows */}
      {LABELLED_Z.filter((Z) => rowStart.has(Z)).map((Z) => (
        <text
          key={Z}
          x={x(rowStart.get(Z)!) - 10}
          y={y(Z)}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={11}
          fill="var(--viz-text-muted)"
        >
          {path.cells.find((c) => c.Z === Z)?.symbol}
        </text>
      ))}
      {/* the start and the end, named in full */}
      <Nuclide x={x(56 - 26) - 4} y={y(27) - 2} A={56} symbol="Fe" anchor="middle" />
      <Nuclide x={x(126) - 10} y={y(83) - 8} A={209} symbol="Bi" anchor="end" />

      {/* where the insets are */}
      {insets.map((inset) => {
        const left = x(inset.n[0]) - P / 2 - 2
        const right = x(inset.n[1]) + P / 2 + 2
        const top = y(inset.z[1]) - P / 2 - 2
        const bottom = y(inset.z[0]) + P / 2 + 2
        return (
          <a key={inset.id} href={`#${inset.id}`} aria-label={inset.label}>
            <rect
              x={left}
              y={top}
              width={right - left}
              height={bottom - top}
              fill="none"
              stroke="var(--viz-text)"
              strokeWidth={1}
              rx={2}
            />
            <text x={right + 3} y={bottom + 1} fontSize={11} fontWeight={700} fill="var(--viz-text)">
              {inset.letter}
            </text>
          </a>
        )
      })}
    </svg>
  )
}

/* -- one inset ---------------------------------------------------------------- */

export function SProcessInset({ inset, lang, label }: { inset: Inset; lang: Lang; label: string }) {
  const path: SPath = getSProcessPath(lang)
  const [z0, z1] = inset.z
  const [n0, n1] = inset.n
  const P = 52 // pitch
  const C = 46 // cell
  const L = 30
  const T = 6
  const B = 22
  const R = 14
  const W = L + (n1 - n0 + 1) * P + R
  const H = T + (z1 - z0 + 1) * P + B
  const x = (N: number) => L + (N - n0) * P + P / 2
  const y = (Z: number) => T + (z1 - Z) * P + P / 2
  const inside = (c: { Z: number; N: number }) => c.Z >= z0 && c.Z <= z1 && c.N >= n0 && c.N <= n1
  const cells = path.cells.filter(inside)
  const byCode = new Map(cells.map((c) => [c.code, c]))
  const edges = path.edges.filter((e) => byCode.has(e.from) && byCode.has(e.to))
  // Edges that cross the frame: a short stub shows where the flow comes from
  // or goes to (¹⁵⁴Eu → ¹⁵⁴Gd from outside inset B), when it stays clear of
  // the axis labels.
  const anywhere = new Map(path.cells.map((c) => [c.code, c]))
  for (const n of path.nodes) if (!anywhere.has(n.code)) anywhere.set(n.code, { ...n } as never)
  const gridRight = L + (n1 - n0 + 1) * P
  const gridBottom = T + (z1 - z0 + 1) * P
  const stubs = path.edges
    .filter((e) => byCode.has(e.from) !== byCode.has(e.to) && anywhere.has(e.from) && anywhere.has(e.to))
    .map((e) => {
      const a = anywhere.get(e.from)!
      const b = anywhere.get(e.to)!
      const dx = x(b.N) - x(a.N)
      const dy = y(b.Z) - y(a.Z)
      const len = Math.hypot(dx, dy)
      const ux = dx / len
      const uy = dy / len
      const reach = e.kind === "n" ? C / 2 + 0.5 : (C / 2) * Math.SQRT2 - 4
      const incoming = byCode.has(e.to)
      const end = incoming
        ? { x: x(b.N) - ux * (reach + 1), y: y(b.Z) - uy * (reach + 1) }
        : { x: x(a.N) + ux * (reach + 14), y: y(a.Z) + uy * (reach + 14) }
      const start = incoming
        ? { x: end.x - ux * 14, y: end.y - uy * 14 }
        : { x: x(a.N) + ux * reach, y: y(a.Z) + uy * reach }
      const ok = [start, end].every((p) => p.x >= L && p.x <= gridRight + R && p.y >= T - 4 && p.y <= gridBottom)
      return ok ? { key: `${e.from}-${e.to}`, start, end } : null
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
  const marker = `arrow-${inset.id}`
  const symbols = new Map(cells.map((c) => [c.Z, c.symbol]))
  const it = lang === "it"

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      className="block h-auto max-w-full"
      fontFamily="inherit"
    >
      <title>{label}</title>
      <defs>
        <marker id={marker} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--viz-series-1)" />
        </marker>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="var(--viz-surface)" />

      {/* rows and columns */}
      {Array.from({ length: z1 - z0 + 1 }, (_, i) => z0 + i).map((Z) => (
        <text key={Z} x={L - 6} y={y(Z)} textAnchor="end" dominantBaseline="central" fontSize={12} fill="var(--viz-text-muted)">
          {symbols.get(Z) ?? ""}
        </text>
      ))}
      {Array.from({ length: n1 - n0 + 1 }, (_, i) => n0 + i).map((N) => (
        <text key={N} x={x(N)} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--viz-text-muted)" className="tabular">
          {N}
        </text>
      ))}
      {MAGIC.filter((m) => m.N >= n0 && m.N <= n1).map((m) => (
        <rect
          key={m.N}
          x={x(m.N) - P / 2 + 1}
          y={T - 4}
          width={P - 2}
          height={(z1 - z0 + 1) * P + 6}
          fill="var(--viz-series-3)"
          fillOpacity={0.14}
          rx={4}
        />
      ))}

      {/* cells */}
      {cells.map((c) => {
        const paint = cellPaint(c)
        const sOnly = c.role === "s-only"
        const rOnly = c.role === "r-only"
        // Primordial nuclei that outlive the Universe a thousandfold (¹⁵²Gd,
        // ¹⁵¹Eu) are stable for this purpose: no half-life shown.
        const ancient = c.seconds !== null && c.seconds > 1e12 * 365.2422 * 86400
        const only = it ? { s: "solo s", r: "solo r" } : { s: "s-only", r: "r-only" }
        const sub = sOnly ? only.s : rOnly ? only.r : c.stable || ancient ? "" : compactHalfLife(c.seconds, lang)
        return (
          <g key={c.code}>
            <rect
              x={x(c.N) - C / 2}
              y={y(c.Z) - C / 2}
              width={C}
              height={C}
              rx={4}
              fill={sOnly ? "var(--viz-series-2)" : paint.fill}
              fillOpacity={sOnly ? 0.2 : 1}
              stroke={c.branch ? "var(--viz-series-1)" : sOnly ? "var(--viz-series-2)" : rOnly ? "var(--viz-text-muted)" : paint.stroke}
              strokeWidth={c.branch || sOnly ? 2 : 1}
              strokeDasharray={rOnly ? "3 2.5" : undefined}
            />
            <text
              x={x(c.N)}
              y={y(c.Z) - (sub ? 5 : 0)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
              fontWeight={c.onPath ? 600 : 400}
              fill={c.onPath ? "var(--viz-text)" : "var(--viz-text-muted)"}
            >
              <tspan fontSize={10} dy={-4.5}>
                {c.A}
              </tspan>
              <tspan dy={4.5}>{c.symbol}</tspan>
            </text>
            {sub && (
              <text x={x(c.N)} y={y(c.Z) + 12} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="var(--viz-text-muted)">
                {sub}
              </text>
            )}
          </g>
        )
      })}

      {/* captures and decays */}
      <g fill="none" stroke="var(--viz-series-1)" strokeWidth={1.8} strokeLinecap="round">
        {edges.map((e, i) => {
          const a = byCode.get(e.from)!
          const b = byCode.get(e.to)!
          const ax = x(a.N)
          const ay = y(a.Z)
          const bx = x(b.N)
          const by = y(b.Z)
          const dx = bx - ax
          const dy = by - ay
          const len = Math.hypot(dx, dy)
          const ux = dx / len
          const uy = dy / len
          // From the edge of one cell to the edge of the next (corners for a decay).
          const reach = e.kind === "n" ? C / 2 + 0.5 : (C / 2) * Math.SQRT2 - 4
          return (
            <line
              key={i}
              x1={ax + ux * reach}
              y1={ay + uy * reach}
              x2={bx - ux * (reach + 1)}
              y2={by - uy * (reach + 1)}
              markerEnd={`url(#${marker})`}
            />
          )
        })}
        {stubs.map((st) => (
          <line
            key={st.key}
            x1={st.start.x}
            y1={st.start.y}
            x2={st.end.x}
            y2={st.end.y}
            strokeDasharray="3 2.5"
            markerEnd={`url(#${marker})`}
          />
        ))}
      </g>
    </svg>
  )
}

/* -- the legend ----------------------------------------------------------------- */

export function SProcessLegend({ lang }: { lang: Lang }) {
  const it = lang === "it"
  const items: { swatch: React.ReactNode; text: string }[] = [
    {
      swatch: <line x1="2" y1="7" x2="24" y2="7" stroke="var(--viz-series-1)" strokeWidth="2" strokeLinecap="round" />,
      text: it ? "percorso: cattura (orizzontale), decadimento β (diagonale)" : "path: capture (across), β decay (diagonal)",
    },
    {
      swatch: <rect x="8" y="1.5" width="11" height="11" rx="2" fill="var(--atlas-cell-strong)" stroke="var(--viz-axis)" />,
      text: it ? "stabile, sul percorso" : "stable, on the path",
    },
    {
      swatch: <rect x="8" y="1.5" width="11" height="11" rx="2" fill="var(--atlas-cell)" stroke="var(--atlas-cell-edge)" />,
      text: it ? "stabile, fuori dal percorso" : "stable, off the path",
    },
    {
      swatch: <rect x="8" y="1.5" width="11" height="11" rx="2" fill="var(--viz-series-2)" stroke="var(--viz-series-2)" />,
      text: it ? "solo s" : "s-only",
    },
    {
      swatch: <rect x="8" y="1.5" width="11" height="11" rx="2" fill="var(--viz-surface)" stroke="var(--viz-series-1)" strokeWidth="2" />,
      text: it ? "punto di diramazione" : "branch point",
    },
    {
      swatch: <rect x="8" y="1.5" width="11" height="11" rx="2" fill="var(--viz-surface)" stroke="var(--viz-axis)" />,
      text: it ? "radioattivo, sul percorso" : "radioactive, on the path",
    },
    {
      swatch: <rect x="8" y="1.5" width="11" height="11" rx="2" fill="var(--atlas-cell)" stroke="var(--viz-text-muted)" strokeDasharray="2.5 2" />,
      text: it ? "solo r (nei riquadri)" : "r-only (in the insets)",
    },
    {
      swatch: <rect x="6" y="0" width="14" height="14" fill="var(--viz-series-3)" fillOpacity="0.25" />,
      text: it ? "guscio di neutroni chiuso" : "closed neutron shell",
    },
  ]
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.text} className="inline-flex items-center gap-2">
          <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden className="shrink-0">
            {item.swatch}
          </svg>
          {item.text}
        </li>
      ))}
    </ul>
  )
}
