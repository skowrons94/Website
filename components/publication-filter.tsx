"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { dict, type Lang } from "@/lib/i18n"

type Kind = "all" | "first" | "luna"

export type PublicationFacets = { year: number; first: boolean; luna: boolean }

/**
 * All papers, only those with Jakub as first author, or only the LUNA ones,
 * optionally narrowed to one year.
 *
 * The list itself is server-rendered; each entry carries `data-year`,
 * `data-first` and `data-luna`, and this hides the entries that do not match,
 * the sections left empty, and rewrites each section's count. Without
 * JavaScript the whole list is simply shown.
 */
export function PublicationFilter({
  lang,
  items,
  children,
}: {
  lang: Lang
  items: PublicationFacets[]
  children: React.ReactNode
}) {
  const t = dict(lang).publications
  const labels = {
    filter: t.filter,
    all: t.all,
    first: t.firstAuthor,
    luna: t.luna,
    year: t.year,
    allYears: t.allYears,
    shown: t.shown,
  }
  const [kind, setKind] = useState<Kind>("all")
  const [year, setYear] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<number | null>(null)

  const matchKind = (p: PublicationFacets, k: Kind) => k === "all" || (k === "first" ? p.first : p.luna)
  const years = useMemo(() => [...new Set(items.map((p) => p.year))].sort((a, b) => b - a), [items])
  const kinds: { id: Kind; label: string }[] = [
    { id: "all", label: labels.all },
    { id: "first", label: labels.first },
    { id: "luna", label: labels.luna },
  ]

  useEffect(() => {
    const root = ref.current
    if (!root) return
    let total = 0
    for (const section of root.querySelectorAll<HTMLElement>("[data-pub-section]")) {
      let visible = 0
      for (const li of section.querySelectorAll<HTMLElement>("[data-pub]")) {
        const ok =
          (kind === "all" ||
            (kind === "first" ? li.dataset.first === "true" : li.dataset.luna === "true")) &&
          (year === null || li.dataset.year === String(year))
        li.hidden = !ok
        if (ok) visible++
      }
      section.hidden = visible === 0
      const count = section.querySelector<HTMLElement>("[data-count]")
      if (count) count.textContent = `(${visible})`
      total += visible
    }
    // Announce only after a change, not on the first render.
    setShown((prev) => (prev === null && kind === "all" && year === null ? null : total))
  }, [kind, year])

  return (
    <div ref={ref}>
      <div
        role="group"
        aria-label={labels.filter}
        className="mb-10 flex flex-wrap items-center gap-2 text-sm print:hidden"
      >
        <span className="mr-1 text-muted-foreground" aria-hidden>
          {labels.filter}
        </span>
        {kinds.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={kind === o.id}
            onClick={() => setKind(o.id)}
            className={
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 transition-colors " +
              (kind === o.id
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-input-strong text-foreground hover:bg-accent")
            }
          >
            {o.label}
            <span className="tabular opacity-80">
              {items.filter((p) => matchKind(p, o.id) && (year === null || p.year === year)).length}
            </span>
          </button>
        ))}
        <label className="ml-1 inline-flex min-h-10 items-center gap-2">
          <span className="text-muted-foreground">{labels.year}</span>
          <select
            value={year ?? ""}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
            className="min-h-10 rounded-md border border-input-strong bg-background px-2.5 tabular text-foreground"
          >
            <option value="">{labels.allYears}</option>
            {years.map((y) => {
              const n = items.filter((p) => p.year === y && matchKind(p, kind)).length
              return (
                <option key={y} value={y} disabled={n === 0}>
                  {y} ({n})
                </option>
              )
            })}
          </select>
        </label>
        <span className="sr-only" aria-live="polite">
          {shown !== null ? labels.shown(shown) : ""}
        </span>
      </div>
      {children}
    </div>
  )
}
