"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { ArrowUpRight, CornerDownLeft, Search, X } from "lucide-react"

import { Sci } from "@/components/sci"
import type { ChromeStrings } from "@/lib/chrome-strings"
import type { Lang } from "@/lib/locale"
import { prepare, search, type Group, type PreparedIndex, type SearchEntry } from "@/lib/search"

/*
 * The search dialog. Loaded on demand by components/search/search-button.tsx,
 * so none of this, nor the index, is part of a page's own JavaScript.
 *
 * A modal <dialog> (which makes the page behind it inert and closes on
 * Escape) holding an ARIA 1.2 combobox: the text field owns a listbox of
 * results grouped by type, the active option is announced through
 * aria-activedescendant, the arrow keys move it, Enter opens it. On a phone
 * the dialog is a full-screen sheet.
 */

const indexes = new Map<Lang, Promise<PreparedIndex>>()

/** The index for `lang`, fetched once (public/search/<lang>.json). */
export function loadIndex(lang: Lang): Promise<PreparedIndex> {
  let p = indexes.get(lang)
  if (!p) {
    p = fetch(`${process.env.BASE_PATH ?? ""}/search/${lang}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`search index: HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { entries: SearchEntry[] }) => prepare(data.entries))
    p.catch(() => indexes.delete(lang))
    indexes.set(lang, p)
  }
  return p
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""))

export default function CommandPalette({
  lang,
  strings,
  onClose,
}: {
  lang: Lang
  strings: ChromeStrings["search"]
  onClose: () => void
}) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const uid = useId().replace(/:/g, "")
  const [index, setIndex] = useState<PreparedIndex | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [announce, setAnnounce] = useState("")

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
    input.current?.focus()
    let live = true
    loadIndex(lang).then(
      (i) => live && setIndex(i),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [lang])

  // Results, or with nothing typed yet, the site's pages as suggestions.
  const groups: Group[] = useMemo(() => {
    if (!index) return []
    if (!query.trim()) return [{ type: "page", entries: index.items.filter((i) => i.entry.t === "page").map((i) => i.entry) }]
    return search(index, query)
  }, [index, query])
  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups])
  const optionId = (i: number) => `${uid}-opt-${i}`

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    list.current?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: "nearest" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, groups])

  // The number of results, said once typing pauses.
  useEffect(() => {
    if (!index || !query.trim()) return setAnnounce("")
    const n = flat.length
    const id = setTimeout(
      () => setAnnounce(n === 0 ? fill(strings.none, { q: query.trim() }) : n === 1 ? strings.countOne : fill(strings.countMany, { n })),
      350,
    )
    return () => clearTimeout(id)
  }, [flat.length, index, query, strings])

  const close = () => {
    const el = dialog.current
    if (el?.open) el.close()
    else onClose()
  }

  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return
    if (entry.x) window.open(entry.h, "_blank", "noopener,noreferrer")
    else router.push(entry.h)
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0))
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault()
      setActive((a) => Math.max(0, Math.min(flat.length - 1, a + (e.key === "PageDown" ? 5 : -5))))
    } else if (e.key === "Enter") {
      e.preventDefault()
      go(flat[active])
    }
  }

  // The dialog holds two focusable things, the field and Close: Tab goes
  // between them and nowhere else.
  const trap = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab") return
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>("input, button") ?? [])]
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length]
    e.preventDefault()
    next.focus()
  }

  const expanded = flat.length > 0
  let n = -1

  return (
    <dialog
      ref={dialog}
      aria-label={strings.title}
      onClose={onClose}
      onKeyDown={trap}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(e) => {
        if (e.target === dialog.current) close()
      }}
      className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden bg-background p-0 text-foreground backdrop:bg-black/45 sm:mx-auto sm:mt-[10vh] sm:h-fit sm:max-h-[min(40rem,80vh)] sm:w-[min(40rem,calc(100%-2rem))] sm:rounded-xl sm:border sm:border-border sm:shadow-2xl [@media(max-height:30em)]:sm:mt-[3vh] [@media(max-height:30em)]:sm:max-h-[94vh]"
    >
      <div className="flex h-full max-h-[inherit] flex-col sm:max-h-[min(40rem,80vh)] [@media(max-height:30em)]:sm:max-h-[94vh]">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <Search aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-label={strings.title}
            aria-expanded={expanded}
            aria-controls={`${uid}-list`}
            aria-autocomplete="list"
            aria-activedescendant={expanded ? optionId(active) : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={strings.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            onClick={close}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X aria-hidden className="h-4 w-4 sm:hidden" />
            <span className="sr-only sm:not-sr-only">
              <kbd className="hidden rounded border border-border bg-muted px-1.5 font-sans text-[0.6875rem] leading-5 sm:inline" aria-hidden>
                Esc
              </kbd>
            </span>
            <span className="sr-only">{strings.close}</span>
          </button>
        </div>

        <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {!index && !failed && <p className="px-3 py-6 text-sm text-muted-foreground">{strings.loading}</p>}
          {failed && <p className="px-3 py-6 text-sm text-muted-foreground">{strings.error}</p>}
          {index && query.trim() && flat.length === 0 && (
            <p className="px-3 py-6 text-sm text-muted-foreground">{fill(strings.none, { q: query.trim() })}</p>
          )}
          <div id={`${uid}-list`} role="listbox" aria-label={strings.title} hidden={!expanded}>
            {groups.map((group) => (
              <div key={group.type} role="group" aria-labelledby={`${uid}-g-${group.type}`} className="pb-2">
                <div
                  id={`${uid}-g-${group.type}`}
                  role="presentation"
                  className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {query.trim() ? (strings.groups[group.type] ?? group.type) : strings.suggestions}
                </div>
                {group.entries.map((entry) => {
                  n++
                  const i = n
                  const on = i === active
                  return (
                    <div
                      key={`${entry.t}:${entry.h}:${entry.l}`}
                      id={optionId(i)}
                      role="option"
                      aria-selected={on}
                      onMouseMove={() => !on && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(entry)}
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${on ? "bg-accent" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          // Notes and paper titles are in English on every page.
                          lang={lang !== "en" && /^(note|section|publication)$/.test(entry.t) ? "en" : undefined}
                          className="truncate text-[0.9375rem] font-medium text-foreground"
                        >
                          <Sci>{entry.l}</Sci>
                          {entry.x && (
                            <>
                              <ArrowUpRight aria-hidden className="ml-1 inline h-3.5 w-3.5 align-[-0.1em] text-muted-foreground" />
                              <span className="sr-only"> ({strings.external})</span>
                            </>
                          )}
                        </div>
                        {entry.s && (
                          <div className="truncate text-[0.8125rem] text-muted-foreground">
                            <Sci>{entry.s}</Sci>
                          </div>
                        )}
                      </div>
                      <CornerDownLeft aria-hidden className={`h-4 w-4 shrink-0 text-muted-foreground ${on ? "opacity-100" : "opacity-0"}`} />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div
          aria-hidden
          className="hidden shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground [@media(pointer:fine)]:sm:flex"
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> {strings.hintMove}
          </span>
          <span>
            <Kbd>Enter</Kbd> {strings.hintOpen}
          </span>
          <span>
            <Kbd>Esc</Kbd> {strings.hintClose}
          </span>
        </div>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>
    </dialog>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1.5 font-sans text-[0.6875rem] leading-5">{children}</kbd>
}
