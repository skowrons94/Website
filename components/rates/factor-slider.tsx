"use client"

import Link from "next/link"

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
 * One multiplier, ÷10 to ×10 on a log slider, with a stepper [÷2] ×1 [×2]
 * and a reset that appears once the value is not 1: a reaction's rate
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
  const set = (v: number) => onChange(Number(Math.min(10, Math.max(0.1, v)).toPrecision(3)))
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
          <span
            className={`tabular min-w-[3.5rem] text-center text-sm ${value !== 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            aria-hidden
          >
            {factorText(value, lang)}
          </span>
          <button
            type="button"
            onClick={() => set(value * 2)}
            disabled={value >= 10}
            className={step}
            aria-label={`${t.double} ${label}`}
          >
            {t.double}
          </button>
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
        value={value}
        min={0.1}
        max={10}
        onChange={(x) => set(x)}
        valueText={factorText(value, lang)}
      />
    </Tag>
  )
}
