"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink } from "lucide-react"

import { LunaBadge } from "@/components/atlas/status-badge"
import { useDict, useLang } from "@/components/lang-provider"
import { Sci } from "@/components/sci"
import { localePath } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface TimelineItem {
  id: string
  year: number | null
  month: number | null
  title: string
  text: string
  categories: string[]
  luna: boolean
  highlight: boolean
  url: string | null
  reactions: { id: string; label: string }[]
  refs: { key: string; label: string; href?: string }[]
}

const CATEGORIES = ["theory", "experiment", "observation", "facility", "luna"]
/** Not a category: the few events marked `highlight` in timeline.yaml. */
const HIGHLIGHTS = "highlights"

/**
 * The history of the field as one vertical line, grouped by decade, with chips
 * that narrow it to one kind of event. Filtering hides events but keeps the
 * decade headings that still have something under them, so the anchors in the
 * decade bar keep working.
 */
export function TimelineView({ events }: { events: TimelineItem[] }) {
  const lang = useLang()
  const t = useDict().atlas
  const label = (category: string) => t.categories[category] ?? category
  const [only, setOnly] = useState<string | null>(null)
  // On a phone each entry opens folded to its title and the first lines of
  // its text; on a wider screen everything is shown.
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // /atlas/timeline?only=luna, linked from the atlas page. Read on the client,
  // so the page itself stays static.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("only")
    if (value && (CATEGORIES.includes(value) || value === HIGHLIGHTS)) setOnly(value)
  }, [])

  const choose = (value: string | null) => {
    setOnly(value)
    try {
      const url = value ? `?only=${value}` : window.location.pathname
      window.history.replaceState(null, "", url)
    } catch {
      // Not essential.
    }
  }

  const visible = useMemo(
    () =>
      only === HIGHLIGHTS
        ? events.filter((e) => e.highlight)
        : only
          ? events.filter((e) => e.categories.includes(only))
          : events,
    [events, only],
  )

  const decades = useMemo(() => {
    const groups: { decade: number; events: TimelineItem[] }[] = []
    for (const e of visible) {
      const decade = e.year === null ? 0 : Math.floor(e.year / 10) * 10
      const last = groups[groups.length - 1]
      if (last && last.decade === decade) last.events.push(e)
      else groups.push({ decade, events: [e] })
    }
    return groups
  }, [visible])

  const highlights = useMemo(() => events.filter((e) => e.highlight).length, [events])

  // The decade in view, marked in the bar (aria-current) and kept visible in
  // it when the bar scrolls sideways on a phone.
  const [current, setCurrent] = useState<number | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const headings = decades
      .map((d) => document.getElementById(`d${d.decade}`))
      .filter((el): el is HTMLElement => el !== null)
    if (headings.length === 0 || typeof IntersectionObserver === "undefined") return
    const pick = () => {
      // The last heading above a line just under the sticky bar.
      const line = (bar.current?.getBoundingClientRect().bottom ?? 0) + 64
      let found = decades[0]?.decade ?? null
      for (const el of headings) {
        if (el.getBoundingClientRect().top <= line) found = Number(el.id.slice(1))
      }
      setCurrent(found)
    }
    pick()
    const observer = new IntersectionObserver(pick, { rootMargin: "0px 0px -60% 0px", threshold: [0, 1] })
    for (const el of headings) observer.observe(el)
    window.addEventListener("scroll", pick, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", pick)
    }
  }, [decades])
  useEffect(() => {
    const row = bar.current?.querySelector<HTMLElement>("[data-scroll-row]")
    const link = row?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!row || !link || row.scrollWidth <= row.clientWidth) return
    // Not while the bar still sits in the page above the line: the filters
    // come first, and the reader has not started down the line yet.
    if ((bar.current?.getBoundingClientRect().top ?? 0) > 72) return
    const left = link.offsetLeft - row.offsetLeft
    if (left < row.scrollLeft || left + link.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" })
    }
  }, [current])

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const e of events) for (const k of e.categories) c.set(k, (c.get(k) ?? 0) + 1)
    return c
  }, [events])

  return (
    <div>
      {/* -- filters and the decade bar ------------------------------------ */}
      {/* On a phone, filters and decades are one row that scrolls sideways;
          from sm up, two rows. */}
      <div
        ref={bar}
        className="sticky top-16 z-20 -mx-5 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-8"
      >
        <div
          data-scroll-row
          className="flex snap-x scroll-px-5 items-center gap-1.5 overflow-x-auto whitespace-nowrap px-5 py-2.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:whitespace-normal sm:px-8 sm:py-3 [&::-webkit-scrollbar]:hidden"
        >
          <div role="group" aria-label={t.show} className="flex shrink-0 gap-1.5 sm:min-w-0 sm:shrink sm:flex-wrap">
            {highlights > 0 && (
              <Chip on={only === HIGHLIGHTS} onClick={() => choose(only === HIGHLIGHTS ? null : HIGHLIGHTS)}>
                {t.highlights} <span className="tabular opacity-70">{highlights}</span>
              </Chip>
            )}
            <Chip on={only === null} onClick={() => choose(null)}>
              {t.all} <span className="tabular opacity-70">{events.length}</span>
            </Chip>
            {CATEGORIES.filter((c) => counts.get(c)).map((c) => (
              <Chip key={c} on={only === c} onClick={() => choose(only === c ? null : c)}>
                {label(c)} <span className="tabular opacity-70">{counts.get(c)}</span>
              </Chip>
            ))}
          </div>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border sm:hidden" />
          <nav aria-label={t.decades} className="flex shrink-0 gap-x-1 text-xs text-muted-foreground sm:basis-full sm:flex-wrap sm:gap-x-1.5">
            {decades.map((d) => (
              <a
                key={d.decade}
                href={`#d${d.decade}`}
                aria-current={current === d.decade ? "true" : undefined}
                className="tabular inline-flex min-h-10 snap-start items-center rounded-full px-2 underline-offset-2 hover:text-foreground hover:underline aria-[current=true]:bg-secondary aria-[current=true]:font-medium aria-[current=true]:text-foreground sm:min-h-7"
              >
                {d.decade ? t.decade(d.decade) : t.undated}
              </a>
            ))}
          </nav>
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
      </div>

      {/* -- the line -------------------------------------------------------- */}
      <div className="mt-10">
        {decades.length === 0 && <p className="text-muted-foreground">{t.nothingHere}</p>}
        {decades.map((d) => (
          <section key={d.decade} aria-labelledby={`d${d.decade}`} className="relative">
            <h2
              id={`d${d.decade}`}
              className="scroll-mt-44 pb-4 pt-2 font-serif text-2xl font-semibold tracking-tight tabular sm:text-[1.65rem]"
            >
              {d.decade ? t.decade(d.decade) : t.undated}
            </h2>
            <ol className="relative ml-[0.3rem] border-l border-border pb-10 sm:ml-[5.25rem]">
              {d.events.map((e) => (
                <li key={e.id} id={e.id} className="relative scroll-mt-44 pb-9 pl-6 last:pb-2 sm:pl-8">
                  {/* the node; filled and larger for LUNA */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-[0.35rem] rounded-full border-2 border-background",
                      e.luna
                        ? "-left-[0.4rem] h-3 w-3 bg-foreground ring-1 ring-foreground/40"
                        : "-left-[0.3rem] h-2.5 w-2.5 bg-muted-foreground/60",
                    )}
                  />
                  {/* the date: in the margin on a wide screen, above the title on a phone */}
                  <p className="tabular text-sm font-medium text-muted-foreground sm:absolute sm:-left-[5.25rem] sm:top-0 sm:w-[4.25rem] sm:text-right">
                    {e.month ? `${t.months[e.month - 1]} ` : ""}
                    {e.year ?? ""}
                  </p>
                  <h3 className="mt-0.5 text-pretty font-serif text-[1.15rem] font-semibold leading-snug tracking-tight sm:mt-0">
                    <Sci>{e.title}</Sci>
                  </h3>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    {e.categories
                      .filter((c) => c !== "luna")
                      .map(label)
                      .join(" · ")}
                    {e.luna && <LunaBadge className="normal-case" />}
                  </p>
                  {e.text && (
                    <p
                      id={`${e.id}-text`}
                      className={cn(
                        "mt-2.5 max-w-2xl text-pretty text-[0.975rem] leading-relaxed text-foreground/90 sm:line-clamp-none",
                        !open.has(e.id) && "line-clamp-2",
                      )}
                    >
                      <Sci>{e.text}</Sci>
                    </p>
                  )}
                  {(e.text || e.reactions.length > 0 || e.refs.length > 0 || e.url) && (
                    <button
                      type="button"
                      aria-expanded={open.has(e.id)}
                      aria-controls={`${e.id}-more`}
                      onClick={() => toggle(e.id)}
                      className="mt-1 inline-flex min-h-8 items-center text-sm text-link underline-offset-4 hover:underline sm:hidden"
                    >
                      {open.has(e.id) ? t.readLess : t.readMore}
                    </button>
                  )}
                  <div id={`${e.id}-more`} className={cn("sm:block", !open.has(e.id) && "hidden")}>
                  {e.reactions.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {e.reactions.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={localePath(lang, `/atlas/${r.id}`)}
                            className="inline-block rounded-md border border-border bg-card px-2 py-0.5 font-serif text-sm font-semibold transition-colors hover:border-foreground/30 hover:text-link"
                          >
                            <Sci>{r.label}</Sci>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(e.refs.length > 0 || e.url) && (
                    <p className="mt-3 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      {e.refs.map((ref) =>
                        ref.href ? (
                          <a
                            key={ref.key}
                            href={ref.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-6 items-center underline-offset-2 hover:text-link hover:underline"
                          >
                            <Sci>{ref.label}</Sci>
                          </a>
                        ) : (
                          <span key={ref.key}>
                            <Sci>{ref.label}</Sci>
                          </span>
                        ),
                      )}
                      {e.url && (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline-offset-2 hover:text-link hover:underline"
                        >
                          {t.officialPage} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1 text-sm sm:min-h-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
