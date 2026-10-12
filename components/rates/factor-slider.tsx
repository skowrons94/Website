"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Sci } from "@/components/sci"
import { localePath, type Lang } from "@/lib/locale"
import { ratesDict } from "@/lib/rates/i18n"
import { sig2 } from "./format"
import { LogSlider } from "./log-slider"

/** ×2.0 or ÷2.0: a factor as a reader says it. */
export function factorText(v: number, lang: Lang): string {
  if (v === 1) return "×1"
  return v >= 1 ? `×${sig2(v, lang)}` : `÷${sig2(1 / v, lang)}`
}

/**
 * One multiplier, ÷10 to ×10 on a log slider, with a stepper [÷2] [×2], the
 * value as a pill ("now ×2") and a reset that appears once the value is not 1: a reaction's rate
 * (linked to its atlas page when it has one) or an initial abundance.
 */
export function FactorSlider({
  label,
  href,
  value,
  onChange,
  lang,
  note,
  as: Tag = "div",
}: {
  label: string
  href?: string | null
  value: number
  onChange: (v: number) => void
  lang: Lang
  note?: string
  as?: "div" | "li"
}) {
  const t = ratesDict(lang)
  const clamp = (v: number) => Number(Math.min(10, Math.max(0.1, v)).toPrecision(3))
  const set = (v: number) => onChange(clamp(v))
  // the slider moves with the hand; the page hears of it at most every
  // 120 ms (always the latest value), so a drag does not re-render the whole
  // explorer at every input event
  const [shown, setShown] = useState(value)
  const pending = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (pending.current === null) setShown(value)
  }, [value])
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  const drag = (v: number) => {
    const x = clamp(v)
    setShown(x)
    pending.current = x
    if (timer.current) return
    timer.current = setTimeout(function flush() {
      timer.current = null
      const p = pending.current
      pending.current = null
      if (p !== null) onChange(p)
    }, 120)
  }
  const step =
    "min-h-9 min-w-9 rounded-md border border-border px-2 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
  return (
    <Tag className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="min-w-0 font-serif text-[0.95rem] font-semibold">
          {href ? (
            <Link href={localePath(lang, href)} className="text-link underline-offset-4 hover:underline">
              <Sci>{label}</Sci>
            </Link>
          ) : (
            <Sci>{label}</Sci>
          )}
          {note && (
            <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
              <Sci>{note}</Sci>
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => set(value / 2)}
            disabled={value <= 0.1}
            className={step}
            aria-label={`${t.half} ${label}`}
          >
            {t.half}
          </button>
          <button
            type="button"
            onClick={() => set(value * 2)}
            disabled={value >= 10}
            className={step}
            aria-label={`${t.double} ${label}`}
          >
            {t.double}
          </button>
          <span
            className={`tabular ml-1 inline-flex min-h-7 min-w-[4.75rem] items-center justify-center rounded-full px-2.5 text-xs ${
              shown !== 1
                ? "bg-[var(--rates-changed)] font-semibold text-[var(--viz-surface)]"
                : "bg-secondary text-muted-foreground"
            }`}
            aria-hidden
          >
            {t.nowFactor(factorText(shown, lang))}
          </span>
          <button
            type="button"
            onClick={() => onChange(1)}
            className={`min-h-9 rounded px-2 text-xs text-link underline-offset-4 hover:underline ${value === 1 ? "invisible" : ""}`}
            tabIndex={value === 1 ? -1 : 0}
            aria-hidden={value === 1}
          >
            {t.reset}
          </button>
        </span>
      </div>
      <LogSlider
        label={<Sci>{`${label}, ${t.factor}`}</Sci>}
        hideLabel
        value={shown}
        min={0.1}
        max={10}
        onChange={drag}
        valueText={factorText(shown, lang)}
        keyStep={0.05}
      />
    </Tag>
  )
}
