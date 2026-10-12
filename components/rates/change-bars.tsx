"use client"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import { dec } from "./format"

export interface ChangeRow {
  name: string
  label: string
  ratio: number
}

const STEPS = [1.1, 1.25, 1.5, 2, 3, 5, 10, 30, 100, 1e3, 1e4, 1e6, 1e9]

/** ×2.3 or ÷4.1: a ratio as a reader says it. */
export function ratioText(r: number, lang: Lang): string {
  if (!Number.isFinite(r)) return r > 0 ? "∞" : "0"
  if (r >= 1) return `×${dec(r < 10 ? r.toFixed(r < 1.1 ? 3 : 2) : r < 1e4 ? r.toFixed(0) : r.toExponential(1), lang)}`
  const q = 1 / r
  return `÷${dec(q < 10 ? q.toFixed(q < 1.1 ? 3 : 2) : q < 1e4 ? q.toFixed(0) : q.toExponential(1), lang)}`
}

/**
 * The final abundances with the changed rates over the unchanged ones, one
 * diverging bar per nucleus on a symmetric log scale: right (first colour)
 * is more, left (second colour) is less, and the label says ×2 or ÷2 in
 * words as well, so the direction never rests on colour alone.
 */
export function ChangeBars({
  rows,
  lang,
  label,
  more,
  less,
}: {
  rows: ChangeRow[]
  lang: Lang
  label: string
  more: string
  less: string
}) {
  const maxLog = Math.max(...rows.map((r) => Math.abs(Math.log10(r.ratio))).filter(Number.isFinite), 0)
  const top = STEPS.find((s) => Math.log10(s) >= maxLog) ?? STEPS[STEPS.length - 1]
  const D = Math.log10(top)
  const pos = (r: number) => Math.max(-1, Math.min(1, Math.log10(r) / D))
  const ticks = [1 / top, 1, top]

  return (
    <div role="figure" aria-label={label}>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[6rem_minmax(0,1fr)]">
        <span />
        <div className="relative h-5 text-[0.7rem] text-muted-foreground" aria-hidden>
          <span className="absolute left-0">{ratioText(ticks[0], lang)}</span>
          <span className="absolute left-1/2 -translate-x-1/2">×1</span>
          <span className="absolute right-0">{ratioText(ticks[2], lang)}</span>
        </div>
      </div>
      <ul className="border-y border-border/60">
        {rows.map((r) => {
          const p = Number.isFinite(Math.log10(r.ratio)) ? pos(r.ratio) : r.ratio > 1 ? 1 : -1
          const up = p >= 0
          return (
            <li
              key={r.name}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 py-1.5 sm:grid-cols-[6rem_minmax(0,1fr)]"
            >
              <span className="text-right font-serif text-sm font-semibold">
                <Sci>{r.label}</Sci>
              </span>
              <div className="relative h-6">
                <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--viz-axis)]" aria-hidden />
                <span
                  className="absolute top-1/2 h-3 -translate-y-1/2"
                  style={{
                    left: up ? "50%" : `${50 + p * 50}%`,
                    width: `${Math.max(Math.abs(p) * 50, 0.4)}%`,
                    background: up ? "var(--viz-series-1)" : "var(--viz-series-2)",
                    borderRadius: up ? "0 4px 4px 0" : "4px 0 0 4px",
                  }}
                />
                <span
                  className="tabular absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs"
                  style={up ? { right: "52%" } : { left: "52%" }}
                >
                  {ratioText(r.ratio, lang)}
                  <span className="sr-only"> {up ? more : less}</span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
