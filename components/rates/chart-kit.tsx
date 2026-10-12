"use client"

import { useEffect, useRef, useState } from "react"

import { Sci } from "@/components/sci"
import { pow10 } from "./format"

/** The width of an element, followed as it resizes. */
export function useWidth<T extends HTMLElement>(initial = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth || initial)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [initial])
  return [ref, width]
}

/** Is the page in dark mode (the `dark` class next-themes sets)? */
export function useDark(): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const el = document.documentElement
    const update = () => setDark(el.classList.contains("dark"))
    update()
    const mo = new MutationObserver(update)
    mo.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [])
  return dark
}

export const SERIES = ["var(--viz-series-1)", "var(--viz-series-2)", "var(--viz-series-3)"]
export const DASHES = ["", "6 3", "2 3"]

export interface LogScale {
  lo: number
  hi: number
  /** pixel of a value */
  px: (v: number) => number
  /** value of a pixel */
  inv: (p: number) => number
}

/** A log scale over [lo, hi] (decades, snapped outward) onto [a, b] pixels. */
export function logScale(lo: number, hi: number, a: number, b: number, snap = true): LogScale {
  let l = Math.log10(lo)
  let h = Math.log10(hi)
  if (snap) {
    l = Math.floor(l + 1e-9)
    h = Math.ceil(h - 1e-9)
  }
  if (h <= l) h = l + 1
  return {
    lo: 10 ** l,
    hi: 10 ** h,
    px: (v) => a + ((Math.log10(v) - l) / (h - l)) * (b - a),
    inv: (p) => 10 ** (l + ((p - a) / (b - a)) * (h - l)),
  }
}

/** Decade ticks between lo and hi, thinned to at most `max`. */
export function decades(lo: number, hi: number, max = 8): number[] {
  const l = Math.ceil(Math.log10(lo) - 1e-9)
  const h = Math.floor(Math.log10(hi) + 1e-9)
  const span = h - l
  const step = Math.max(1, Math.ceil(span / max))
  const out: number[] = []
  for (let e = l; e <= h; e++) if ((e - l) % step === 0) out.push(e)
  return out
}

/** "10⁻⁵" as SVG text. */
export function DecadeLabel({ e }: { e: number }) {
  return <>{pow10(e)}</>
}

/** A labelled figure frame: title, lead, the chart, and a caption slot. */
export function Figure({
  id,
  title,
  lead,
  actions,
  children,
}: {
  id: string
  title: string
  lead?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-[46rem]">
          <h2 id={`${id}-title`} className="text-balance font-serif text-2xl font-semibold tracking-tight">
            {title}
          </h2>
          {lead && <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{lead}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/** Segmented control: a radio group drawn as buttons. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: React.ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap rounded-md border border-border bg-card p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.value === value)
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault()
              onChange(options[(i + 1) % options.length].value)
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault()
              onChange(options[(i - 1 + options.length) % options.length].value)
            }
          }}
          tabIndex={value === o.value ? 0 : -1}
          className={`min-h-9 rounded px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A details/summary fold in the site's style. */
export function Fold({
  title,
  children,
  className = "",
  open,
}: {
  title: React.ReactNode
  children: React.ReactNode
  className?: string
  open?: boolean
}) {
  return (
    <details className={`group rounded-lg border border-border/80 ${className}`} open={open}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      <div className="px-4 pb-5 pt-1">{children}</div>
    </details>
  )
}

/** Reaction text with superscripts. */
export function R({ children }: { children: string }) {
  return <Sci>{children}</Sci>
}

const SUP_MAP: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "−",
}
const SUB_MAP: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
}

/**
 * Unicode super- and subscripts as SVG tspans, for text inside a chart: the
 * web fonts lack most of those glyphs (see components/sci.tsx).
 */
export function SvgSci({ children }: { children: string }) {
  // N_A: an underscore subscripts the letters after it
  const sub = children.split(/_([A-Za-z]+)/)
  if (sub.length > 1)
    return (
      <>
        {sub.map((piece, i) =>
          i % 2 ? (
            <tspan key={i} baselineShift="sub" fontSize="72%">
              {piece}
            </tspan>
          ) : (
            <SvgSci key={i}>{piece}</SvgSci>
          ),
        )}
      </>
    )
  const parts: React.ReactNode[] = []
  let buf = ""
  let mode: "n" | "sup" | "sub" = "n"
  const flush = (key: number) => {
    if (!buf) return
    if (mode === "n") parts.push(buf)
    else
      parts.push(
        <tspan key={key} baselineShift={mode === "sup" ? "super" : "sub"} fontSize="72%">
          {buf}
        </tspan>,
      )
    buf = ""
  }
  ;[...children].forEach((ch, i) => {
    const m: "n" | "sup" | "sub" = SUP_MAP[ch] ? "sup" : SUB_MAP[ch] ? "sub" : "n"
    if (m !== mode) {
      flush(i)
      mode = m
    }
    buf += m === "sup" ? SUP_MAP[ch] : m === "sub" ? SUB_MAP[ch] : ch
  })
  flush(children.length)
  return <>{parts}</>
}

/** Text with `x_sub` subscripts (N_A, Y_partner, f_scr,r) and Unicode superscripts. */
export function Formula({ children }: { children: string }) {
  const parts = children.split(/_([A-Za-z0-9,]+)/)
  return <>{parts.map((piece, i) => (i % 2 ? <sub key={i}>{piece}</sub> : <Sci key={i}>{piece}</Sci>))}</>
}
