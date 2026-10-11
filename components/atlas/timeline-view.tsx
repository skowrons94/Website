"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
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
  url: string | null
  reactions: { id: string; label: string }[]
  refs: { key: string; label: string; href?: string }[]
}

const CATEGORIES = ["theory", "experiment", "observation", "facility", "luna"]

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

  // /atlas/timeline?only=luna, linked from the atlas page. Read on the client,
  // so the page itself stays static.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("only")
    if (value && CATEGORIES.includes(value)) setOnly(value)
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
    () => (only ? events.filter((e) => e.categories.includes(only)) : events),
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

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const e of events) for (const k of e.categories) c.set(k, (c.get(k) ?? 0) + 1)
    return c
  }, [events])

  return (
    <div>
      {/* -- filters and the decade bar ------------------------------------ */}
      <div className="sticky top-16 z-20 -mx-5 border-b border-border/70 bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-8 sm:px-8">
        <div role="group" aria-label={t.show} className="flex flex-wrap gap-1.5">
          <Chip on={only === null} onClick={() => choose(null)}>
            {t.all} <span className="tabular opacity-70">{events.length}</span>
          </Chip>
          {CATEGORIES.filter((c) => counts.get(c)).map((c) => (
            <Chip key={c} on={only === c} onClick={() => choose(only === c ? null : c)}>
              {label(c)} <span className="tabular opacity-70">{counts.get(c)}</span>
            </Chip>
          ))}
        </div>
        <nav aria-label={t.decades} className="mt-2.5 flex gap-x-3.5 gap-y-1 overflow-x-auto whitespace-nowrap pb-0.5 text-xs text-muted-foreground [scrollbar-width:none]">
          {decades.map((d) => (
            <a key={d.decade} href={`#d${d.decade}`} className="tabular underline-offset-2 hover:text-foreground hover:underline">
              {d.decade ? t.decade(d.decade) : t.undated}
            </a>
          ))}
        </nav>
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
                    <p className="mt-2.5 max-w-2xl text-pretty text-[0.975rem] leading-relaxed text-foreground/90">
                      <Sci>{e.text}</Sci>
                    </p>
                  )}
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
                    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {e.refs.map((ref) =>
                        ref.href ? (
                          <a
                            key={ref.key}
                            href={ref.href}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:text-link hover:underline"
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
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1 text-sm sm:min-h-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
