"use client"

import Link from "next/link"

import { Sci } from "@/components/sci"
import { localePath, type Lang } from "@/lib/locale"
import { ratesDict } from "@/lib/rates/i18n"
import { sig2 } from "./format"
import { LogSlider } from "./log-slider"

/**
 * One multiplier, ×0.1 to ×10 on a log slider, with ×0.5 / ×2 steps and a
 * reset: a reaction's rate (linked to its atlas page when it has one) or an
 * initial abundance.
 */
export function FactorSlider({
  label,
  href,
  value,
  onChange,
  lang,
  note,
}: {
  label: string
  href?: string | null
  value: number
  onChange: (v: number) => void
  lang: Lang
  note?: string
}) {
  const t = ratesDict(lang)
  const set = (v: number) => onChange(Number(Math.min(10, Math.max(0.1, v)).toPrecision(3)))
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-serif text-[0.95rem] font-semibold">
          {href ? (
            <Link href={localePath(lang, href)} className="text-link underline-offset-4 hover:underline">
              <Sci>{label}</Sci>
            </Link>
          ) : (
            <Sci>{label}</Sci>
          )}
          {note && <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{note}</span>}
        </span>
        <span className="flex items-center gap-1">
          <span className={`tabular mr-1 text-sm ${value !== 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            ×{sig2(value, lang)}
          </span>
          {[0.5, 2].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set(value * f)}
              className="min-h-8 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${f === 0.5 ? t.half : t.double} ${label}`}
            >
              {f === 0.5 ? t.half : t.double}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(1)}
            disabled={value === 1}
            className="min-h-8 rounded px-2 text-xs text-link disabled:text-muted-foreground/50"
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
        valueText={`×${sig2(value, lang)}`}
      />
    </li>
  )
}
