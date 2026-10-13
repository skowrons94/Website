import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { StatusBadge } from "@/components/atlas/status-badge"
import { Said } from "@/components/data/said"
import { dataPublicDict } from "@/lib/data/i18n-public"
import { credit, energy, type GapRow } from "@/lib/data/public"
import { localePath, type Lang } from "@/lib/locale"
import { cn } from "@/lib/utils"

/**
 * "The gap": one row per reaction, on a shared logarithmic energy axis, from
 * the Gamow window a star uses (a box) to the lowest energy anyone has
 * measured (a tick, with the measured range to its right). The empty stretch
 * between them is hatched. Plain HTML positioned in per cent, so it reflows
 * from 320 px to a wide screen with no JavaScript; every row says the same in
 * a sentence, so nothing depends on the picture or on colour.
 */

const LO = 1 // keV
const HI = 5000 // keV
const pos = (keV: number) => {
  const x = (Math.log10(Math.min(Math.max(keV, LO), HI)) - Math.log10(LO)) / (Math.log10(HI) - Math.log10(LO))
  return `${(x * 100).toFixed(2)}%`
}
const TICKS = [1, 10, 100, 1000]

const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--viz-series-2) 70%, transparent) 0 2px, transparent 2px 6px)"

export function GapAxis({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <div className={cn("relative h-5 text-[0.7rem] text-muted-foreground", className)} aria-hidden>
      {TICKS.map((k) => (
        <span key={k} className="tabular absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: pos(k) }}>
          {energy(k, lang)}
        </span>
      ))}
    </div>
  )
}

export function GapBar({ row, className }: { row: GapRow; className?: string }) {
  const low = row.low?.keV
  return (
    <div className={cn("relative h-7", className)} aria-hidden>
      {/* the axis, with its decades */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--viz-grid)]" />
      {TICKS.map((k) => (
        <div key={k} className="absolute inset-y-1 w-px bg-[var(--viz-grid)]" style={{ left: pos(k) }} />
      ))}
      {/* what nobody has measured: from the window to the lowest data (or on) */}
      {(row.kind === "never" || row.kind === "above") && (
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm"
          style={{
            left: pos(row.hi),
            right: row.kind === "never" ? 0 : `calc(100% - ${pos(low!)})`,
            backgroundImage: HATCH,
          }}
        />
      )}
      {/* what has been measured */}
      {low !== undefined && (
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/70"
          style={{ left: pos(low), right: 0 }}
        />
      )}
      {low !== undefined && (
        <div className="absolute inset-y-0.5 w-[3px] -translate-x-1/2 rounded-full bg-foreground" style={{ left: pos(low) }} />
      )}
      {/* the window the star uses */}
      <div
        className="absolute inset-y-0 min-w-[6px] rounded-[3px] border-2 border-[var(--viz-series-1)] bg-[color-mix(in_srgb,var(--viz-series-1)_22%,transparent)]"
        style={{ left: pos(row.lo), width: `max(6px, calc(${pos(row.hi)} - ${pos(row.lo)}))` }}
      />
    </div>
  )
}

/** The row's sentence, the same story as the bar. */
export function gapCaption(row: GapRow, lang: Lang): string {
  const t = dataPublicDict(lang)
  const e0 = energy(row.E0, lang)
  if (row.kind === "never" || !row.low) return t.gapNever(row.site, e0)
  const low = energy(row.low.keV, lang)
  if (row.kind === "inside") return t.gapInside(low, row.site, e0)
  if (row.kind === "edge") return t.gapEdge(low, row.site, e0)
  return t.gapAbove(low, row.site, e0)
}

function factorText(row: GapRow, lang: Lang): string {
  const t = dataPublicDict(lang)
  if (row.kind === "never") return t.gapNone
  if (row.kind === "inside") return t.gapReached
  if (row.kind === "edge") return t.gapEdgeOnly
  const f = row.factor
  const shown = f >= 10 ? String(Math.round(f)) : String(Number(f.toPrecision(2)))
  return t.gapFactor(lang === "it" ? shown.replace(".", ",") : shown)
}

export function GapRowView({ row, lang, compact = false }: { row: GapRow; lang: Lang; compact?: boolean }) {
  const t = dataPublicDict(lang)
  const to = (p: string) => localePath(lang, p)
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link href={to(`/atlas/${row.id}`)} className="font-serif text-[1.05rem] font-semibold hover:text-link">
          <Said label={row.label} plain={row.plain} />
        </Link>
        <span
          className={cn(
            "text-xs font-medium",
            row.kind === "inside" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {factorText(row, lang)}
        </span>
      </div>
      <p className="mt-0.5 text-pretty text-sm leading-snug text-muted-foreground">
        {gapCaption(row, lang)}
        {!compact && row.low && (
          <>
            {" "}
            {t.gapBy(credit(row.low, lang))}.
          </>
        )}
      </p>
      <GapBar row={row} className="mt-1.5" />
      {!compact && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {row.status && <StatusBadge status={row.status} lang={lang} />}
          {row.data && (
            <Link
              href={to(`/data/reaction/${row.data}`)}
              aria-label={t.measurementsAria(row.plain)}
              className="inline-flex min-h-8 items-center text-link underline-offset-4 hover:underline"
            >
              {t.measurements} ({row.datasets})
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export function GapLegend({ lang }: { lang: Lang }) {
  const t = dataPublicDict(lang)
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
      <li className="flex items-center gap-2">
        <span className="inline-block h-4 w-6 rounded-[3px] border-2 border-[var(--viz-series-1)] bg-[color-mix(in_srgb,var(--viz-series-1)_22%,transparent)]" aria-hidden />
        {t.gapLegendWindow}
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-8 rounded-sm" style={{ backgroundImage: HATCH }} aria-hidden />
        {t.gapLegendGap}
      </li>
      <li className="flex items-center gap-2">
        <span className="relative inline-block h-4 w-8" aria-hidden>
          <span className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-foreground" />
          <span className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/70" />
        </span>
        {t.gapLegendData}
      </li>
    </ul>
  )
}

export function GapMap({ rows, lang, first = 8 }: { rows: GapRow[]; lang: Lang; first?: number }) {
  const t = dataPublicDict(lang)
  const head = rows.slice(0, first)
  const rest = rows.slice(first)
  const list = (items: GapRow[]) => (
    <ol className="divide-y divide-border/70">
      {items.map((row) => (
        <li key={row.id} className="py-4">
          <GapRowView row={row} lang={lang} />
        </li>
      ))}
    </ol>
  )
  return (
    <div>
      <GapLegend lang={lang} />
      <div className="mt-5 rounded-lg border border-border bg-card px-4 py-2 sm:px-6">
        <div className="sticky top-[var(--header-h,0px)] z-10 -mx-4 border-b border-border/70 bg-card/95 px-4 pb-1 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">{t.gapAxis}</p>
          <GapAxis lang={lang} className="mt-1" />
        </div>
        {list(head)}
        {rest.length > 0 && (
          <details className="group border-t border-border/70">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-3 text-sm font-medium text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
              <span className="group-open:hidden">{t.gapShowAll(rows.length)}</span>
              <span className="hidden group-open:inline">{t.gapHide}</span>
            </summary>
            {list(rest)}
          </details>
        )}
      </div>
      <p className="mt-4 max-w-3xl text-pretty text-xs leading-relaxed text-muted-foreground">{t.gapRule}</p>
    </div>
  )
}
