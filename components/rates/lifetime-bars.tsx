"use client"

import { memo, useEffect, useRef } from "react"

import Link from "next/link"

import { Sci } from "@/components/sci"
import { localePath, type Lang } from "@/lib/locale"
import { C, SERIES, Shape } from "./chart-kit"
import { factorText } from "./factor-slider"
import { duration, shortTime, YEAR_S } from "./format"

export interface LifeRow {
  id: string
  label: string
  /** the nucleus that waits, e.g. ¹⁴N */
  target: string
  tau: number
  /** the waiting time at the unchanged rate, when the reader scaled it */
  tau0?: number
  atlas: string | null
  bottleneck: boolean
  /** the colour slot of a picked reaction (−1: not picked) */
  slot: number
  /** the reader's factor on this rate */
  scaled?: number
}

export interface TimeRef {
  t: number
  label: string
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
 * The mean waiting time before each reaction as a dot on a logarithmic time
 * axis (no bar: on a log axis a bar's length would only measure the distance
 * from an arbitrary floor). Vertical rules mark times that give the dots a
 * meaning: the burn time, the age of the Sun. Grey dots; a picked reaction
 * in its series colour and shape; the bottleneck in ink, named; a changed
 * rate leaves a hollow dot at its old waiting time.
 */
export const LifetimeBars = memo(function LifetimeBars({
  rows,
  lang,
  label,
  waits,
  bottleneckWord,
  never,
  refs = [],
  unscaledWord,
}: {
  rows: LifeRow[]
  lang: Lang
  label: string
  waits: (n: string) => string
  bottleneckWord: string
  never: string
  refs?: TimeRef[]
  unscaledWord: string
}) {
  const finite = rows.flatMap((r) => [r.tau, r.tau0 ?? r.tau]).filter((t) => Number.isFinite(t) && t > 0)
  if (!finite.length) return null
  let lo = Math.log10(Math.min(...finite))
  let hi = Math.log10(Math.max(...finite))
  const shownRefs = refs.filter((r) => Math.log10(r.t) > lo - 2 && Math.log10(r.t) < hi + 3)
  for (const r of shownRefs) {
    lo = Math.min(lo, Math.log10(r.t))
    hi = Math.max(hi, Math.log10(r.t))
  }
  lo = Math.floor(lo - 0.4)
  hi = Math.ceil(hi + 0.4)
  if (hi - lo < 3) lo = hi - 3
  const frac = (t: number) => Math.min(1, Math.max(0, (Math.log10(t) - lo) / (hi - lo)))
  let ticks = TICKS.filter((t) => Math.log10(t) >= lo && Math.log10(t) <= hi)
  if (ticks.length > 6) {
    // keep the largest tick (1 Gyr when the bottleneck is billions of years)
    const keep = ticks.length % 2 === 1 ? 0 : 1
    ticks = ticks.filter((_, i) => i % 2 === keep)
  }
  const pct = (t: number) => `${(frac(t) * 100).toFixed(2)}%`

  // a value label set to the right of its dot that would run past the end of
  // its track (large text, a narrow column) goes to the left of it instead
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    let id = 0
    // measured when the page is idle: never a forced layout during hydration
    const later = () => {
      cancelAnimationFrame(id)
      id = requestAnimationFrame(fit)
    }
    const fit = () => {
      // axis labels that would overprint (large text, a narrow track): every other one goes
      let lastRight = -Infinity
      el.querySelectorAll<HTMLElement>("[data-tick]").forEach((tick) => {
        tick.style.visibility = ""
        const b = tick.getBoundingClientRect()
        if (b.left < lastRight + 4) tick.style.visibility = "hidden"
        else lastRight = b.right
      })
      el.querySelectorAll<HTMLElement>("[data-side]").forEach((span) => {
        const track = span.parentElement!
        span.style.left = span.dataset.left ?? ""
        span.style.right = span.dataset.right ?? ""
        span.style.whiteSpace = ""
        const box = () => span.getBoundingClientRect()
        const tb = track.getBoundingClientRect()
        // past the right end: to the other side of the dot
        if (span.dataset.side === "right" && box().right - tb.right > 2) {
          span.style.left = ""
          span.style.right = span.dataset.flip ?? ""
        }
        // past the left end (either side): held at the start of the track
        if (tb.left - box().left > 2) {
          span.style.right = ""
          span.style.left = "0px"
        }
        // longer than the track itself (very large text): it wraps
        if (box().right - tb.right > 2) span.style.whiteSpace = "normal"
      })
    }
    const idle = "requestIdleCallback" in window ? window.requestIdleCallback(later, { timeout: 1500 }) : 0
    const ro = new ResizeObserver(later)
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(id)
      if (idle) window.cancelIdleCallback(idle)
    }
  })

  return (
    <div role="figure" aria-label={label} ref={root}>
      <div className="grid grid-cols-1 gap-x-4 min-[40rem]:grid-cols-[minmax(0,14rem)_minmax(10rem,1fr)]">
        <span className="hidden min-[40rem]:block" />
        <div className="relative mx-3" style={{ height: `${1.4 + 1.1 * shownRefs.length}rem` }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              data-tick
              // the end ticks stay inside the axis: one at the very edge is anchored by its own edge
              className={`tabular absolute bottom-0 whitespace-nowrap text-[0.7rem] text-muted-foreground ${
                frac(t) < 0.08 ? "translate-x-0" : frac(t) > 0.92 ? "-translate-x-full" : "-translate-x-1/2"
              }`}
              style={{ left: pct(t) }}
            >
              {shortTime(t, lang)}
            </span>
          ))}
          {shownRefs.map((r, i) => (
            <span
              key={r.label}
              className="absolute whitespace-nowrap text-[0.7rem] font-medium text-foreground"
              style={{
                top: `${1.1 * i}rem`,
                ...(frac(r.t) > 0.5
                  ? { right: `calc(${(100 - frac(r.t) * 100).toFixed(2)}% - 1px)` }
                  : { left: `calc(${pct(r.t)} - 1px)` }),
              }}
            >
              {frac(r.t) > 0.5 ? `${r.label} ┐` : `┌ ${r.label}`}
            </span>
          ))}
        </div>
      </div>
      <ul className="border-y border-border/60">
        {rows.map((r) => {
          const fin = Number.isFinite(r.tau)
          const color = r.bottleneck ? C.ink : r.slot >= 0 ? SERIES[r.slot] : "var(--viz-text-muted)"
          const right = frac(r.tau) < 0.62
          // the value label clears both dots when a rate was changed
          const ghost = r.tau0 !== undefined && Number.isFinite(r.tau0) ? r.tau0 : r.tau
          const edge = right ? Math.max(frac(r.tau), frac(ghost)) : Math.min(frac(r.tau), frac(ghost))
          return (
            <li
              key={r.id}
              className="grid grid-cols-1 items-center gap-x-4 gap-y-1 border-b border-border/40 py-2 last:border-b-0 min-[40rem]:grid-cols-[minmax(0,14rem)_minmax(10rem,1fr)]"
            >
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
                  <span className="tabular ml-1.5 rounded bg-[var(--rates-changed)] px-1 text-[0.7rem] font-medium text-[var(--viz-surface)]">
                    {factorText(r.scaled, lang)}
                  </span>
                )}
                <span className="block text-xs text-muted-foreground">
                  <Sci>{waits(r.target)}</Sci>
                </span>
              </div>
              <div className="relative mx-3 h-8">
                <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--viz-grid)]" aria-hidden />
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute inset-y-1 w-px bg-[var(--viz-grid)]"
                    style={{ left: pct(t) }}
                    aria-hidden
                  />
                ))}
                {shownRefs.map((x) => (
                  <span
                    key={x.label}
                    className="absolute inset-y-0 w-px bg-[var(--viz-text-muted)] opacity-60"
                    style={{ left: pct(x.t) }}
                    aria-hidden
                  />
                ))}
                {fin ? (
                  <>
                    {r.tau0 !== undefined && Number.isFinite(r.tau0) && r.tau0 !== r.tau && (
                      <>
                        <span
                          className="absolute top-1/2 h-px -translate-y-1/2 bg-[var(--rates-changed)]"
                          style={{
                            left: pct(Math.min(r.tau, r.tau0)),
                            width: `${Math.abs(frac(r.tau) - frac(r.tau0)) * 100}%`,
                          }}
                          aria-hidden
                        />
                        <svg
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
                          style={{ left: pct(r.tau0) }}
                          width="12"
                          height="12"
                          aria-hidden
                        >
                          <circle cx="6" cy="6" r="4.5" fill="none" stroke={C.base} strokeWidth="1.5" />
                          <title>{`${unscaledWord}: ${duration(r.tau0, lang)}`}</title>
                        </svg>
                      </>
                    )}
                    <svg
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
                      style={{ left: pct(r.tau) }}
                      width="14"
                      height="14"
                      aria-hidden
                    >
                      {r.slot >= 0 && !r.bottleneck ? (
                        <Shape
                          slot={r.slot}
                          x={7}
                          y={7}
                          r={5}
                          fill={color}
                          stroke="var(--viz-surface)"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <circle
                          cx="7"
                          cy="7"
                          r={r.bottleneck ? 6 : 5}
                          fill={color}
                          stroke="var(--viz-surface)"
                          strokeWidth="1.5"
                        />
                      )}
                    </svg>
                    <span
                      className={`tabular absolute top-1/2 z-[1] -translate-y-1/2 whitespace-nowrap rounded-sm bg-background px-1 text-xs leading-tight ${r.bottleneck ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      data-side={right ? "right" : "left"}
                      data-left={right ? `calc(${(edge * 100).toFixed(2)}% + 12px)` : undefined}
                      data-flip={right ? `calc(${(100 - Math.min(frac(r.tau), frac(ghost)) * 100).toFixed(2)}% + 12px)` : undefined}
                      data-right={right ? undefined : `calc(${(100 - edge * 100).toFixed(2)}% + 12px)`}
                      style={
                        right
                          ? { left: `calc(${(edge * 100).toFixed(2)}% + 12px)` }
                          : { right: `calc(${(100 - edge * 100).toFixed(2)}% + 12px)` }
                      }
                    >
                      {duration(r.tau, lang)}
                      {r.bottleneck && ` · ${bottleneckWord}`}
                    </span>
                  </>
                ) : (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs italic text-muted-foreground">
                    {never}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
})
