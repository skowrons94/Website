"use client"

import { useEffect, useRef, useState } from "react"

import { Sci } from "@/components/sci"
import { pow10 } from "./format"

/** The width of an element, followed as it resizes. */
/** The reader's text size against the default 16 px (200% text: 2). */
function textScale(): number {
  if (typeof window === "undefined") return 1
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(px) && px > 16 ? Math.min(2.5, px / 16) : 1
}

/**
 * The width of a chart's box in the chart's own units, and the reader's text
 * scale k: a chart lays itself out for `width` and draws its SVG at k times
 * that size (`width * k` by `height * k`, viewBox in chart units), so its
 * text grows with the reader's font size (WCAG 1.4.4) and a chart under
 * large text takes its narrow layout.
 */
export function useWidth<T extends HTMLElement>(initial = 640): [React.RefObject<T | null>, number, number] {
  const ref = useRef<T>(null)
  const [box, setBox] = useState({ width: initial, k: 1 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = (w: number) => {
      // large text grows the chart's text, but a chart keeps at least 240
      // units of width: on a phone at 200% the text grows less than 2×
      const k = Math.max(1, Math.min(textScale(), w / 240))
      setBox((b) => (b.width === w / k && b.k === k ? b : { width: w / k, k }))
    }
    set(el.clientWidth > 40 ? el.clientWidth : initial)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      // a box not laid out yet (hidden, or skipped by content-visibility) reports 0
      if (w && w > 40) set(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [initial])
  return [ref, box.width, box.k]
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

/*
 * One colour language for every chart of the rates pages:
 *
 *   SERIES[0..2]  the identity of a picked reaction or nucleus (the site's
 *                 validated palette, lib/viz.ts); a reaction keeps its colour
 *                 in the rate chart, the waiting times and the flow ring
 *   C.base        grey: the unchanged burn, context, everything not picked
 *   C.ink         the text colour: what the page points at (the bottleneck,
 *                 the current temperature)
 *   C.changed     violet: the result of the reader's changes
 *   C.up/C.down   violet / brown: more / less of a nucleus (never a series hue)
 *
 * Shape is the second cue of identity (SHAPES, paired with the slots as in
 * lib/viz.ts); a dash means only "unchanged".
 */
export const SERIES = ["var(--viz-series-1)", "var(--viz-series-2)", "var(--viz-series-3)"]
export const SHAPES = ["circle", "square", "triangle"] as const
export const BASE_DASH = "5 4"
export const C = {
  base: "var(--viz-axis)",
  muted: "var(--viz-text-muted)",
  ink: "var(--viz-text)",
  grid: "var(--viz-grid)",
  surface: "var(--viz-surface)",
  changed: "var(--rates-changed)",
  up: "var(--rates-up)",
  down: "var(--rates-down)",
} as const
/** The rates pages' own tokens (light, dark), set on the explorer's root. */
export const RATES_TOKENS =
  "[--rates-up:#6b4fc8] [--rates-down:#8a5a22] [--rates-changed:#6b4fc8] dark:[--rates-up:#a48cf0] dark:[--rates-down:#c9925a] dark:[--rates-changed:#a48cf0]"

/** A marker of a slot's shape, centred on (x, y). */
export function Shape({
  slot,
  x,
  y,
  r = 4,
  fill,
  stroke,
  strokeWidth = 1.5,
}: {
  slot: number
  x: number
  y: number
  r?: number
  fill: string
  stroke?: string
  strokeWidth?: number
}) {
  const shape = SHAPES[slot % SHAPES.length]
  if (shape === "square")
    return (
      <rect
        x={x - r * 0.9}
        y={y - r * 0.9}
        width={r * 1.8}
        height={r * 1.8}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    )
  if (shape === "triangle")
    return (
      <path
        d={`M${x},${y - r * 1.1} L${x + r * 1.05},${y + r * 0.75} L${x - r * 1.05},${y + r * 0.75} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    )
  return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
}

/** A legend swatch: a short line in the series colour with its end marker. */
export function Swatch({ slot, dashed = false, color }: { slot: number; dashed?: boolean; color?: string }) {
  const c = color ?? SERIES[slot]
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden className="shrink-0">
      <line x1="1" x2="15" y1="5" y2="5" stroke={c} strokeWidth="2" strokeDasharray={dashed ? "3 2" : undefined} />
      <Shape slot={slot} x={17} y={5} r={3} fill={c} />
    </svg>
  )
}

/** Is reduced motion asked for? */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const up = () => setReduce(mq.matches)
    up()
    mq.addEventListener("change", up)
    return () => mq.removeEventListener("change", up)
  }, [])
  return reduce
}

/** Seconds since `busy` turned true, ticking while it stays true (for the "calculating" line). */
export function useElapsed(busy: boolean): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!busy) return setS(0)
    const t0 = performance.now()
    const id = setInterval(() => setS((performance.now() - t0) / 1000), 100)
    return () => clearInterval(id)
  }, [busy])
  return s
}

const BUSY_CSS =
  "@keyframes rates-busy{from{transform:translateX(-100%)}to{transform:translateX(300%)}}.rates-busy{animation:rates-busy 1.1s linear infinite}@media (prefers-reduced-motion:reduce){.rates-busy{animation:none}}"

/** A 2 px hairline across the top of a results card while it recalculates. */
export function BusyLine({ busy }: { busy: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-lg" aria-hidden>
      {busy && (
        <>
          <style>{BUSY_CSS}</style>
          <div className="rates-busy h-full w-1/3 bg-[var(--rates-changed)] motion-reduce:w-full motion-reduce:opacity-60" />
        </>
      )}
    </div>
  )
}

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

/** A labelled figure frame: an optional step ("1 · How fast"), title, lead, the chart. */
export function Figure({
  id,
  title,
  lead,
  actions,
  step,
  children,
}: {
  id: string
  title: string
  lead?: React.ReactNode
  actions?: React.ReactNode
  /** the step of the page's story this figure answers */
  step?: { n: number; label: string }
  children: React.ReactNode
}) {
  return (
    // content-visibility: a section off screen costs no layout while a slider
    // above it is dragged
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 [contain-intrinsic-size:auto_1100px] [content-visibility:auto]"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-[46rem]">
          {step && (
            <p className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span className="tabular inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[0.7rem] text-foreground">
                {step.n}
              </span>
              {step.label}
            </p>
          )}
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

/**
 * A details/summary fold in the site's style. Its content is built only once
 * the fold has been opened (pass a function to defer the work of building it
 * too): a closed fold costs nothing while a slider is being dragged.
 */
export function Fold({
  title,
  children,
  className = "",
  open,
}: {
  title: React.ReactNode
  children: React.ReactNode | (() => React.ReactNode)
  className?: string
  open?: boolean
}) {
  const [seen, setSeen] = useState(Boolean(open))
  return (
    <details
      className={`group rounded-lg border border-border/80 ${className}`}
      open={open}
      onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setSeen(true)}
    >
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
      <div className="px-4 pb-5 pt-1">{seen ? (typeof children === "function" ? children() : children) : null}</div>
    </details>
  )
}

/**
 * A download built when it is clicked, not on every render: the link's
 * address is made from `make()` at the click, before the browser follows it.
 */
export function Download({
  make,
  filename,
  children,
}: {
  make: () => string
  filename: string
  children: React.ReactNode
}) {
  return (
    <a
      href="#"
      download={filename}
      onClick={(e) => {
        e.currentTarget.href = make()
      }}
      className="text-link underline-offset-4 hover:underline"
    >
      {children}
    </a>
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
