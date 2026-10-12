"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type PublicationFacets = { year: number; first: boolean; luna: boolean }

/** The filter's labels, from the server (no dictionary in the browser). */
export type PublicationFilterLabels = {
  filter: string
  all: string
  first: string
  luna: string
  year: string
  allYears: string
  /** "{n} publications shown"; `shownOne` for a single one. */
  shown: string
  shownOne: string
  none: string
}

type State = { first: boolean; luna: boolean; year: number | null }
const NONE: State = { first: false, luna: false, year: null }

/**
 * The filter, from the address: `?only=first` (first author), `?tag=luna`
 * (LUNA papers), `?year=2024`, in any combination. Unknown values are ignored.
 */
function fromUrl(search: string, years: number[]): State {
  const q = new URLSearchParams(search)
  const year = Number(q.get("year"))
  return {
    first: q.getAll("only").includes("first"),
    luna: q.getAll("tag").includes("luna"),
    year: years.includes(year) ? year : null,
  }
}

function toQuery(s: State): string {
  const q = new URLSearchParams()
  if (s.first) q.set("only", "first")
  if (s.year !== null) q.set("year", String(s.year))
  if (s.luna) q.set("tag", "luna")
  const text = q.toString()
  return text ? `?${text}` : ""
}

/**
 * All papers, only those with Jakub as first author, only the LUNA ones (or
 * both), optionally narrowed to one year.
 *
 * The list itself is server-rendered; each entry carries `data-year`,
 * `data-first` and `data-luna`, and this hides the entries that do not match,
 * the sections left empty, and rewrites each section's count. Without
 * JavaScript the whole list is simply shown.
 *
 * The filter lives in the address (?only=first&year=2025&tag=luna), so a
 * filtered list can be linked to, and Back undoes a change of filter: each
 * change is a history entry of its own, and the page follows the address when
 * Back or Forward moves it.
 */
export function PublicationFilter({
  labels,
  items,
  children,
}: {
  labels: PublicationFilterLabels
  items: PublicationFacets[]
  children: React.ReactNode
}) {
  const years = useMemo(() => [...new Set(items.map((p) => p.year))].sort((a, b) => b - a), [items])
  const [state, setState] = useState<State>(NONE)
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<number | null>(null)
  const changed = useRef(false)

  // The address decides, on arrival and on Back / Forward.
  useEffect(() => {
    const read = () => setState(fromUrl(window.location.search, years))
    read()
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [years])

  const update = useCallback((next: State) => {
    changed.current = true
    setState(next)
    const url = `${window.location.pathname}${toQuery(next)}${window.location.hash}`
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.pushState(window.history.state, "", url)
    }
  }, [])

  const match = (p: PublicationFacets, s: Pick<State, "first" | "luna" | "year">) =>
    (!s.first || p.first) && (!s.luna || p.luna) && (s.year === null || p.year === s.year)

  const { first, luna, year } = state
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let total = 0
    for (const section of root.querySelectorAll<HTMLElement>("[data-pub-section]")) {
      let visible = 0
      for (const li of section.querySelectorAll<HTMLElement>("[data-pub]")) {
        const ok =
          (!first || li.dataset.first === "true") &&
          (!luna || li.dataset.luna === "true") &&
          (year === null || li.dataset.year === String(year))
        li.hidden = !ok
        if (ok) visible++
      }
      section.hidden = visible === 0
      const count = section.querySelector<HTMLElement>("[data-count]")
      if (count) count.textContent = `(${visible})`
      total += visible
    }
    // Announce only after a change made here, not on arrival (but an empty
    // result is always said, on the page too).
    setShown(changed.current || total === 0 ? total : null)
  }, [first, luna, year])

  const chips: { id: "all" | "first" | "luna"; label: string; pressed: boolean; count: number; onClick: () => void }[] = [
    {
      id: "all",
      label: labels.all,
      pressed: !first && !luna,
      count: items.filter((p) => match(p, { first: false, luna: false, year })).length,
      onClick: () => update({ ...state, first: false, luna: false }),
    },
    {
      id: "first",
      label: labels.first,
      pressed: first,
      count: items.filter((p) => match(p, { first: true, luna, year })).length,
      onClick: () => update({ ...state, first: !first }),
    },
    {
      id: "luna",
      label: labels.luna,
      pressed: luna,
      count: items.filter((p) => match(p, { first, luna: true, year })).length,
      onClick: () => update({ ...state, luna: !luna }),
    },
  ]

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
        {chips.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.pressed}
            onClick={o.onClick}
            className={
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 transition-colors " +
              (o.pressed
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-input-strong text-foreground hover:bg-accent")
            }
          >
            {o.label}
            <span className="tabular opacity-80">{o.count}</span>
          </button>
        ))}
        <label className="ml-1 inline-flex min-h-10 max-w-full flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{labels.year}</span>
          <select
            value={year ?? ""}
            onChange={(e) => update({ ...state, year: e.target.value ? Number(e.target.value) : null })}
            className="min-h-10 max-w-full rounded-md border border-input-strong bg-background px-2.5 tabular text-foreground"
          >
            <option value="">{labels.allYears}</option>
            {years.map((y) => {
              const n = items.filter((p) => match(p, { first, luna, year: y })).length
              return (
                <option key={y} value={y} disabled={n === 0 && y !== year}>
                  {y} ({n})
                </option>
              )
            })}
          </select>
        </label>
        <span className="sr-only" aria-live="polite">
          {shown !== null ? (shown === 1 ? labels.shownOne : labels.shown.replace("{n}", String(shown))) : ""}
        </span>
      </div>
      {shown === 0 && <p className="text-muted-foreground">{labels.none}</p>}
      {children}
    </div>
  )
}
