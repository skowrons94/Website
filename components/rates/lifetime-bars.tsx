"use client"

import Link from "next/link"

import { Sci } from "@/components/sci"
import { localePath, type Lang } from "@/lib/locale"
import { duration, shortTime, YEAR_S } from "./format"

export interface LifeRow {
  id: string
  label: string
  /** the nucleus that waits, e.g. ¹⁴N */
  target: string
  tau: number
  atlas: string | null
  bottleneck: boolean
  /** the rate is scaled by the reader */
  scaled?: number
}

const TICKS = [
  1e-6,
  1e-3,
  1,
  60,
  3600,
  86400,
  YEAR_S,
  1e3 * YEAR_S,
  1e6 * YEAR_S,
  1e9 * YEAR_S,
  1e12 * YEAR_S,
  1e15 * YEAR_S,
]

/**
 * Horizontal bars of the mean waiting time before each reaction, on a log
 * time axis with ticks at human units. Bars run from the left edge of the
 * axis, so a longer bar is a longer wait; the bottleneck takes the second
 * colour and says so in words.
 */
export function LifetimeBars({
  rows,
  lang,
  label,
  waits,
  bottleneckWord,
  never,
}: {
  rows: LifeRow[]
  lang: Lang
  label: string
  waits: (n: string) => string
  bottleneckWord: string
  never: string
}) {
  const finite = rows.map((r) => r.tau).filter((t) => Number.isFinite(t) && t > 0)
  if (!finite.length) return null
  let lo = Math.log10(Math.min(...finite))
  let hi = Math.log10(Math.max(...finite))
  lo = Math.floor(lo - 0.3)
  hi = Math.ceil(hi + 0.3)
  if (hi - lo < 3) lo = hi - 3
  // the axis takes 70% of the track; the rest is room for the value label
  const frac = (t: number) => 0.7 * Math.min(1, Math.max(0.006, (Math.log10(t) - lo) / (hi - lo)))
  let ticks = TICKS.filter((t) => Math.log10(t) >= lo && Math.log10(t) <= hi)
  if (ticks.length > 6) ticks = ticks.filter((_, i) => i % 2 === ticks.length % 2)

  return (
    <div role="figure" aria-label={label}>
      <div className="relative ml-0 h-6 sm:ml-[16rem]" aria-hidden>
        {ticks.map((t) => (
          <span
            key={t}
            className="tabular absolute -translate-x-1/2 whitespace-nowrap text-[0.7rem] text-muted-foreground"
            style={{ left: `${frac(t) * 100}%` }}
          >
            {shortTime(t, lang)}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-border/60 border-y border-border/60">
        {rows.map((r) => {
          const fin = Number.isFinite(r.tau)
          return (
            <li key={r.id} className="grid grid-cols-1 gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[15rem_minmax(0,1fr)]">
              <div className="min-w-0 text-sm leading-snug">
                {r.atlas ? (
                  <Link
                    href={localePath(lang, `/atlas/${r.atlas}`)}
                    className="font-serif font-semibold text-link underline-offset-4 hover:underline"
                  >
                    <Sci>{r.label}</Sci>
                  </Link>
                ) : (
                  <span className="font-serif font-semibold">
                    <Sci>{r.label}</Sci>
                  </span>
                )}
                {r.scaled !== undefined && r.scaled !== 1 && (
                  <span className="tabular ml-1.5 rounded bg-secondary px-1 text-[0.7rem] text-muted-foreground">
                    ×{r.scaled.toPrecision(2)}
                  </span>
                )}
                <span className="block text-xs text-muted-foreground">
                  <Sci>{waits(r.target)}</Sci>
                </span>
              </div>
              <div className="relative flex min-h-7 items-center">
                {/* decade grid */}
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute inset-y-0 w-px bg-[var(--viz-grid)]"
                    style={{ left: `${frac(t) * 100}%` }}
                    aria-hidden
                  />
                ))}
                {fin ? (
                  <>
                    <span
                      className="relative h-3.5 shrink-0 rounded-r-[4px]"
                      style={{
                        width: `${frac(r.tau) * 100}%`,
                        background: r.bottleneck ? "var(--viz-series-2)" : "var(--viz-series-1)",
                      }}
                    />
                    <span
                      className={`tabular relative ml-2 min-w-0 text-xs leading-tight ${r.bottleneck ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                    >
                      {duration(r.tau, lang)}
                      {r.bottleneck && ` · ${bottleneckWord}`}
                    </span>
                  </>
                ) : (
                  <span className="relative text-xs italic text-muted-foreground">{never}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
