"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"

import { Sci } from "@/components/sci"
import type { Lang } from "@/lib/locale"
import { ratesDict } from "@/lib/rates/i18n"
import type { Reaction, RateSource } from "@/lib/rates/schema"
import { ratioText, type ChangeRow } from "./change-bars"
import { useElapsed } from "./chart-kit"
import { FactorSlider, factorText } from "./factor-slider"
import { dec } from "./format"

export interface PickGroup {
  id: string
  title?: string
  lead?: string
  reactions: Reaction[]
}

/**
 * "Choose a reaction to change": the reactions as chips (in groups when
 * given), the rest of the network in a menu, and one slider, for the chosen
 * reaction, right under them. A changed rate shows its factor on its chip.
 */
export function ReactionPicker({
  groups,
  others = [],
  active,
  setActive,
  scale,
  setFactor,
  lang,
}: {
  groups: PickGroup[]
  others?: Reaction[]
  active: Reaction | null
  setActive: (id: string) => void
  scale: Record<string, number>
  setFactor: (id: string, v: number) => void
  lang: Lang
}) {
  const t = ratesDict(lang)
  const chip = (r: Reaction) => {
    const on = active?.id === r.id
    const f = scale[r.id] ?? 1
    return (
      <li key={r.id}>
        <button
          type="button"
          aria-pressed={on}
          onClick={() => setActive(r.id)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
          }`}
        >
          <span className="font-serif font-semibold">
            <Sci>{r.label}</Sci>
          </span>
          <LunaMark reaction={r} lang={lang} inverted={on} />
          {f !== 1 && (
            <span
              className={`tabular rounded px-1 text-[0.7rem] font-medium ${on ? "bg-background/20" : "bg-[var(--rates-changed)] text-[var(--viz-surface)]"}`}
            >
              {factorText(f, lang)}
            </span>
          )}
        </button>
      </li>
    )
  }
  const inOthers = active && others.some((r) => r.id === active.id)
  return (
    <div>
      <p className="text-sm font-medium" id="pick-reaction">
        {t.pickReaction}
      </p>
      <div className="mt-2 space-y-3">
        {groups.map((g) => (
          <div key={g.id}>
            {g.title && (
              <p
                className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
                title={g.lead}
              >
                {g.title}
              </p>
            )}
            <ul className="flex flex-wrap gap-1.5" aria-labelledby="pick-reaction">
              {g.reactions.map(chip)}
            </ul>
          </div>
        ))}
        {others.length > 0 && (
          <select
            value={inOthers ? active!.id : ""}
            onChange={(e) => e.target.value && setActive(e.target.value)}
            className="min-h-9 w-full max-w-full rounded-md border border-border bg-card px-2 text-sm"
            aria-label={t.moreReactionsPick}
          >
            <option value="">{t.moreReactionsPick}</option>
            {others.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {(scale[r.id] ?? 1) !== 1 ? ` ${factorText(scale[r.id], lang)}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {active && (
        <div className="mt-3 rounded-lg border border-border bg-card px-3 sm:px-4">
          <FactorSlider
            label={active.label}
            href={active.atlas ? `/atlas/${active.atlas}` : null}
            value={scale[active.id] ?? 1}
            onChange={(v) => setFactor(active.id, v)}
            lang={lang}
          />
        </div>
      )}
    </div>
  )
}

/** "LUNA" beside a reaction measured at LUNA (the atlas' measurements, in the network file). */
export function LunaMark({ reaction, lang, inverted = false }: { reaction: Reaction; lang: Lang; inverted?: boolean }) {
  const luna = reaction.measured?.filter((m) => m.luna) ?? []
  if (!luna.length) return null
  const t = ratesDict(lang)
  const refs = [...new Set(luna.flatMap((m) => m.refs.map((r) => r.short)))].join("; ")
  return (
    <abbr
      title={t.lunaChipTitle(refs)}
      className={`rounded-sm border px-1 font-sans text-[0.62rem] font-semibold tracking-[0.06em] no-underline ${
        inverted ? "border-background/50 text-background" : "border-[var(--viz-series-1)] text-foreground"
      }`}
    >
      {t.lunaChip}
      <span className="sr-only">: {t.lunaChipTitle(refs)}</span>
    </abbr>
  )
}

/** The reader's changes as removable chips, with "reset all". */
export function ChangesList({
  scale,
  byId,
  setFactor,
  reset,
  lang,
}: {
  scale: Record<string, number>
  byId: Map<string, Reaction>
  setFactor: (id: string, v: number) => void
  reset: () => void
  lang: Lang
}) {
  const t = ratesDict(lang)
  const list = Object.entries(scale).filter(([, v]) => v !== 1)
  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.yourChanges}</p>
      {list.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {list.map(([id, v]) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setFactor(id, 1)}
                aria-label={t.remove(byId.get(id)?.label ?? id)}
                className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--rates-changed)] px-2.5 text-xs transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  <Sci>{byId.get(id)?.label ?? id}</Sci>
                </span>
                <span className="tabular font-semibold">{factorText(v, lang)}</span>
                <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
          {list.length > 1 && (
            <li>
              <button
                type="button"
                onClick={reset}
                className="min-h-8 px-1 text-xs text-link underline-offset-4 hover:underline"
              >
                {t.resetAll}
              </button>
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t.noChanges}</p>
      )}
    </div>
  )
}

/** "Calculating… 0.3 s" while a burn runs, else what the last one did. */
export function StatusLine({
  busy,
  error,
  done,
  lang,
}: {
  busy: boolean
  error: string | null
  done: React.ReactNode
  lang: Lang
}) {
  const t = ratesDict(lang)
  const s = useElapsed(busy)
  // a drag makes many results a second: the screen reader hears only the
  // last one, once nothing has changed for 0.8 s, and never "Calculating…"
  const doneRef = useRef<HTMLSpanElement>(null)
  const [said, setSaid] = useState("")
  useEffect(() => {
    if (busy) return
    const id = setTimeout(() => setSaid(error ? `${t.failed} ${error}` : (doneRef.current?.textContent ?? "")), 800)
    return () => clearTimeout(id)
  }, [busy, error, t])
  return (
    <p className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
      {busy ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          {t.calculatingFor(s >= 0.2 ? `${dec(s.toFixed(1), lang)} s` : "")}
        </>
      ) : error ? (
        <span className="text-destructive">
          {t.failed} {error}
        </span>
      ) : (
        <span ref={doneRef}>{done}</span>
      )}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {said}
      </span>
    </p>
  )
}

/**
 * On a phone the results sit below the controls: once the reader has changed
 * something, this strip stays at the bottom of the screen while the what-if
 * section is in view and shows the three biggest effects of the change, or
 * the calculation's timer. It hides while the full results (`watch`, an
 * element id) are on screen, and before any change it is not there at all.
 */
export function ResultStrip({
  rows,
  self = [],
  busy,
  href,
  lang,
  active,
  watch,
  rev,
}: {
  /** the knock-on effects of 1% or more, biggest first (the bars) */
  rows: ChangeRow[]
  /** the changed reactions' own targets that moved by 1% or more: shown when nothing else did */
  self?: ChangeRow[]
  busy: boolean
  href: string
  lang: Lang
  /** a change has been made */
  active: boolean
  /** the ids of what the strip would cover (the results it stands in for, the sensitivity map), space-separated */
  watch?: string
  /** changes when one of them appears or goes (the map opened) */
  rev?: unknown
}) {
  const t = ratesDict(lang)
  const s = useElapsed(busy)
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    const els = (watch ?? "")
      .split(" ")
      .map((id) => (id ? document.getElementById(id) : null))
      .filter((e): e is HTMLElement => e !== null)
    if (!els.length || typeof IntersectionObserver === "undefined") return
    const seen = new Set<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target)
          else seen.delete(e.target)
        }
        setCovered(seen.size > 0)
      },
      { threshold: 0.05 },
    )
    els.forEach((e) => io.observe(e))
    return () => {
      io.disconnect()
      setCovered(false)
    }
  }, [watch, rev])
  if (!active || covered) return null
  return (
    <div className="sticky bottom-0 z-20 -mx-5 mt-6 border-t border-border bg-background/95 px-5 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-8 sm:px-8 lg:hidden">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t.stripTitle}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {busy ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              {t.calculatingFor(s >= 0.2 ? `${dec(s.toFixed(1), lang)} s` : "")}
            </span>
          ) : rows.length || self.length ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
              {(rows.length ? rows : self).slice(0, 3).map((r) => (
                <li key={r.name} className="tabular whitespace-nowrap">
                  <span className="font-serif font-semibold">
                    <Sci>{r.label}</Sci>
                  </span>
                  {!rows.length && <span className="text-muted-foreground"> {t.stripSelf}</span>}{" "}
                  <span
                    style={{ color: r.ratio >= 1 ? "var(--rates-up)" : "var(--rates-down)" }}
                    className="font-medium"
                  >
                    <Sci>{ratioText(r.ratio, lang)}</Sci>
                  </span>
                </li>
              ))}
              {!rows.length && <li className="text-muted-foreground">{t.stripOthers}</li>}
            </ul>
          ) : (
            <span className="text-muted-foreground">{t.stripQuiet}</span>
          )}
        </div>
        <a href={href} className="shrink-0 text-xs text-link underline-offset-4 hover:underline">
          {t.seeAll} ↓
        </a>
      </div>
    </div>
  )
}

/** A REACLIB set's source: author and year, or the title when the label has no author (bet+, ec, ks03). */
export function SourceCell({ sources, lang }: { sources: RateSource[]; lang: Lang }) {
  return (
    <>
      {sources.map((s) => {
        const text = s.author
          ? `${s.author}${s.year ? ` (${s.year})` : ""}`
          : `${s.title || s.set}${s.year ? ` (${s.year})` : ""}`
        return (
          <span key={s.set} className="block">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">
                <Sci>{text}</Sci>
              </a>
            ) : (
              <Sci>{text}</Sci>
            )}
            {s.ref && s.author && <span className="text-muted-foreground">, {s.ref}</span>}
            {s.note && <span className="text-muted-foreground">; {lang === "it" ? (s.note_it ?? s.note) : s.note}</span>}
          </span>
        )
      })}
    </>
  )
}

/**
 * On a phone the results sit below the controls: the first time a change of
 * the reader's own (by finger or mouse) has a result, scroll gently to it
 * (`id`), once the finger is lifted, unless it is already on screen. Once
 * per visit; never for a change that came with the address, or from the
 * keyboard (the focus stays where it is, and so does the page).
 */
export function useRevealFirstResult(ready: boolean, id: string) {
  const done = useRef(false)
  const byPointer = useRef(false)
  const down = useRef(false)
  useEffect(() => {
    const d = () => {
      down.current = true
      byPointer.current = true
    }
    const u = () => {
      down.current = false
    }
    const k = () => {
      byPointer.current = false
    }
    window.addEventListener("pointerdown", d, true)
    window.addEventListener("pointerup", u, true)
    window.addEventListener("pointercancel", u, true)
    window.addEventListener("keydown", k, true)
    return () => {
      window.removeEventListener("pointerdown", d, true)
      window.removeEventListener("pointerup", u, true)
      window.removeEventListener("pointercancel", u, true)
      window.removeEventListener("keydown", k, true)
    }
  }, [])
  useEffect(() => {
    if (!ready || done.current || !byPointer.current) return
    if (!window.matchMedia("(max-width: 1023.98px)").matches) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const go = () => {
      timer = setTimeout(() => {
        if (done.current) return
        done.current = true
        const el = document.getElementById(id)
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.top >= 0 && r.top < window.innerHeight * 0.6) return
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
      }, 350)
    }
    if (!down.current) {
      go()
      return () => clearTimeout(timer)
    }
    const up = () => go()
    window.addEventListener("pointerup", up, { once: true })
    window.addEventListener("pointercancel", up, { once: true })
    return () => {
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      clearTimeout(timer)
    }
  }, [ready, id])
}
