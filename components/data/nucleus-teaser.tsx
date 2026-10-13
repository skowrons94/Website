import { dataPublicDict } from "@/lib/data/i18n-public"
import type { LevelTeaser } from "@/lib/data/public"
import type { Lang } from "@/lib/locale"

/**
 * "Inside the nucleus": the ENSDF levels of a compound nucleus around the
 * proton threshold, with the band of energies the Sun uses drawn across them.
 * The band is a few keV wide on a scale of MeV, so it is drawn at least 5 px
 * tall and named in words. The levels a proton reaches without orbital
 * angular momentum (lib/data/public.ts, `levelTeaser`) are drawn heavier and
 * named. Server-rendered SVG; the description is in the caption and the
 * aria-label.
 */
export function NucleusTeaser({ data, lang }: { data: LevelTeaser; lang: Lang }) {
  const t = dataPublicDict(lang)
  const W = 360
  const H = 330
  const padT = 16
  const padB = 16
  const x0 = 128
  const x1 = 236
  const y = (E: number) => padT + ((data.emax - E) / (data.emax - data.emin)) * (H - padT - padB)
  const mev = (E: number) => (lang === "it" ? E.toFixed(3).replace(".", ",") : E.toFixed(3))
  // Labels on the right must not overlap: push each down past the one above.
  const sorted = [...data.levels].sort((a, b) => b.E - a.E)
  let last = -Infinity
  const placed = sorted.map((l) => {
    const at = Math.max(y(l.E), last + 13)
    last = at
    return { ...l, ly: at }
  })
  const ys = y(data.sp)
  const wTop = Math.min(y(data.whi), ys - 5)
  const sp = `${mev(data.sp)} MeV`
  const highlight = (E: number) => E === data.sub || E === data.res
  const left = x0 - 10
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[26rem]" role="img" aria-label={t.nucleusAria(data.levels.length, sp)}>
      {/* the levels */}
      {placed.map((l) => (
        <g key={l.E}>
          <line
            x1={x0}
            x2={x1}
            y1={y(l.E)}
            y2={y(l.E)}
            stroke={highlight(l.E) ? "var(--viz-series-2)" : "var(--viz-text)"}
            strokeWidth={highlight(l.E) ? 3 : 1.3}
          />
          <line x1={x1} x2={x1 + 8} y1={y(l.E)} y2={l.ly} stroke="var(--viz-axis)" strokeWidth={0.8} />
          <text x={x1 + 11} y={l.ly + 4} fontSize={11.5} fill="var(--viz-text)" className="tabular font-sans">
            {mev(l.E)}
            <tspan fill="var(--viz-text-muted)" dx={5}>
              {l.J}
            </tspan>
          </text>
        </g>
      ))}
      {/* the threshold, and the Sun's window just above it */}
      <line x1={x0 - 4} x2={x1 + 4} y1={ys} y2={ys} stroke="var(--viz-text)" strokeWidth={1.2} strokeDasharray="5 3" />
      <rect
        x={x0 - 4}
        y={wTop}
        width={x1 - x0 + 8}
        height={ys - wTop}
        fill="color-mix(in srgb, var(--viz-series-1) 45%, transparent)"
        stroke="var(--viz-series-1)"
        strokeWidth={1.5}
      />
      <text x={left} y={wTop - 4} textAnchor="end" fontSize={11.5} fill="var(--viz-series-1)" className="font-sans font-semibold">
        {t.nucleusWindow}
      </text>
      <text x={left} y={ys + 14} textAnchor="end" fontSize={11.5} fill="var(--viz-text)" className="font-sans">
        {t.nucleusThreshold}
      </text>
      <text x={left} y={ys + 28} textAnchor="end" fontSize={11} fill="var(--viz-text-muted)" className="tabular font-sans">
        {sp}
      </text>
      {data.sub !== null && (
        <text x={left} y={Math.max(y(data.sub) + 4, ys + 46)} textAnchor="end" fontSize={11} fill="var(--viz-series-2)" className="font-sans font-semibold">
          {/* two lines, so the label fits left of the levels at any width */}
          {t.nucleusSub.split(/(?<=:)\s+/).map((part, k) => (
            <tspan key={k} x={left} dy={k ? 13 : 0}>
              {part}
            </tspan>
          ))}
        </text>
      )}
      {data.res !== null && (
        <text x={left} y={Math.min(y(data.res) + 4, wTop - 20)} textAnchor="end" fontSize={11} fill="var(--viz-series-2)" className="font-sans font-semibold">
          {t.nucleusRes}
        </text>
      )}
    </svg>
  )
}
