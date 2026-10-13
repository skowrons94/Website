"use client"

import Link from "next/link"
import { useId, useMemo, useState } from "react"
import { Search } from "lucide-react"

import { StatusMini } from "@/components/data/status-mini"
import { Said } from "@/components/data/said"
import type { ElementEntry } from "@/lib/data/public"
import { localePath, type Lang } from "@/lib/locale"

/**
 * Search by element: "sodio", "sodium", "Na", "sodium-23", "23Na" → the
 * element's isotopes in the atlas → their reactions → the measurements and the
 * rates. The index (lib/data/public.ts, `elementIndex`) is a few kB sent with
 * the page; nothing is fetched. Accents and case are ignored, and the names
 * match in both languages whatever the page's language.
 */

export interface ElementSearchStrings {
  label: string
  placeholder: string
  examples: string
  /** with {q} */
  none: string
  isotopes: string
  reactions: string
  noReactions: string
  file: string
  rates: string
  data: string
  /** with {n}; `resultsOne` for one */
  results: string
  resultsOne: string
  /** with {r} */
  measurementsAria: string
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()

/** The letters and the mass number a query asks for: "sodio-23" → ["sodio", 23]. */
function parse(q: string): { word: string; A: number | null } {
  const f = fold(q).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String("⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)))
  const digits = /\d+/.exec(f)
  const word = f.replace(/[\d\s\-‑_()]+/g, "")
  return { word, A: digits ? Number(digits[0]) : null }
}

function match(elements: ElementEntry[], q: string): { el: ElementEntry; A: number | null }[] {
  const { word, A } = parse(q)
  if (!word) return []
  const out: { el: ElementEntry; A: number | null; score: number }[] = []
  for (const el of elements) {
    const names = [fold(el.en), fold(el.it)]
    const sym = el.symbol.toLowerCase()
    let score = 0
    if (word === sym) score = 3
    else if (names.includes(word)) score = 3
    else if (word.length >= 2 && names.some((n) => n.startsWith(word))) score = 2
    else if (word.length >= 4 && names.some((n) => n.includes(word))) score = 1
    if (score > 0) out.push({ el, A: A !== null && el.isotopes.some((i) => Number.parseInt(i.code, 10) === A) ? A : null, score })
  }
  return out.sort((a, b) => b.score - a.score || a.el.Z - b.el.Z).slice(0, 4)
}

export function ElementSearch({
  elements,
  lang,
  strings: t,
  examples,
}: {
  elements: ElementEntry[]
  lang: Lang
  strings: ElementSearchStrings
  examples: string[]
}) {
  const [q, setQ] = useState("")
  const id = useId()
  const results = useMemo(() => match(elements, q), [elements, q])
  const to = (p: string) => localePath(lang, p)
  const none = (x: string) => t.none.replace("{q}", x)
  const found = (n: number) => (n === 1 ? t.resultsOne : t.results.replace("{n}", String(n)))
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const name = (el: ElementEntry) => cap(lang === "it" ? el.it : el.en)
  const other = (el: ElementEntry) => cap(lang === "it" ? el.en : el.it)

  return (
    <div>
      <label htmlFor={`${id}-q`} className="text-sm font-medium">
        {t.label}
      </label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={`${id}-q`}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-status`}
          className="h-12 w-full rounded-md border border-input bg-background pl-9 pr-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">{t.examples}:</span>
        {examples.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setQ(x)}
            className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm transition-colors hover:border-foreground/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {x}
          </button>
        ))}
      </div>
      <p id={`${id}-status`} role="status" className="sr-only">
        {q.trim() ? (results.length ? found(results.length) : none(q.trim())) : ""}
      </p>
      {q.trim() && results.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{none(q.trim())}</p>}

      <ul className="mt-5 space-y-6">
        {results.map(({ el, A }) => {
          const isotopes = A === null ? el.isotopes : el.isotopes.filter((i) => Number.parseInt(i.code, 10) === A)
          return (
            <li key={el.Z} className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <h3 className="font-serif text-xl font-semibold tracking-tight">
                {name(el)} <span className="font-sans text-base font-normal text-muted-foreground">({el.symbol}, Z = {el.Z})</span>
              </h3>
              {fold(other(el)) !== fold(name(el)) && (
                <p className="text-sm text-muted-foreground" lang={lang === "it" ? "en" : "it"}>
                  {other(el)}
                </p>
              )}
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.isotopes}</p>
              <ul className="mt-2 space-y-4">
                {isotopes.map((iso) => (
                  <li key={iso.code} className="border-l-2 border-border pl-3">
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-serif text-lg font-semibold">
                        <Said label={iso.label} plain={iso.plain} />
                      </span>
                      <span className="text-sm text-muted-foreground" aria-hidden>
                        {iso.plain}
                      </span>
                      {iso.file && (
                        <Link href={to(iso.file)} className="inline-flex min-h-8 items-center text-sm text-link underline-offset-4 hover:underline">
                          {t.file}
                        </Link>
                      )}
                    </p>
                    {iso.reactions.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">{t.noReactions}</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {iso.reactions.map((r) => (
                          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <Link href={to(r.href)} className="inline-flex min-h-9 items-center font-serif text-[0.975rem] font-semibold hover:text-link">
                              <Said label={r.label} plain={r.plain} />
                            </Link>
                            {r.status && <StatusMini status={r.status} lang={lang} />}
                            {r.data && (
                              <Link
                                href={to(r.data)}
                                aria-label={t.measurementsAria.replace("{r}", r.plain)}
                                className="inline-flex min-h-9 items-center text-link underline-offset-4 hover:underline"
                              >
                                {t.data}
                              </Link>
                            )}
                            {r.rates && (
                              <Link href={to(r.rates)} className="inline-flex min-h-9 items-center text-link underline-offset-4 hover:underline">
                                {t.rates}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
