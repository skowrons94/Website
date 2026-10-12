"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Menu, X } from "lucide-react"

import { LanguageSwitch } from "@/components/language-switch"
import { SearchButton } from "@/components/search/search-button"
import { ThemeToggle } from "@/components/theme-toggle"
import type { ChromeStrings } from "@/lib/chrome-strings"
import { localePath, type Lang } from "@/lib/locale"

/*
 * The header.
 *
 * Five destinations in the bar (Research, Atlas, Evaluations, Publications,
 * CV) and a "Learn" disclosure for the explanatory pages (Notes, Glossary,
 * Methods, Timeline, the s-process); search, EN/IT and the theme always
 * visible. Below the desktop breakpoint the destinations move into a menu
 * that lists every page, in three groups, each with one line saying what is
 * there. Software is in that menu, the footer and search, not in the bar.
 *
 * Sized in rem and switched at a breakpoint in em (64em, 1024 px at the
 * default text size), so with text enlarged to 200% the bar becomes the menu
 * rather than running off the screen (WCAG 1.4.4); the row wraps and the name
 * truncates (or shortens, on a phone) before a control can be pushed out of
 * reach. It sticks to the top only where the window is tall enough for that
 * to help: on a phone held sideways it scrolls away with the page.
 *
 * No strings from lib/i18n.ts here: they come from the server as `strings`
 * (lib/chrome-strings.ts), which keeps the dictionaries out of every page's
 * JavaScript.
 */

type Item = { href: string; label: string; description: string }

// `[@media(min-width:64em)]`: the desktop bar. Literals, so Tailwind sees them.
const DESKTOP_FLEX = "hidden [@media(min-width:64em)]:flex"
const MOBILE_ONLY = "[@media(min-width:64em)]:hidden"

export function SiteHeader({
  name,
  lang,
  strings,
}: {
  name: string
  lang: Lang
  strings: ChromeStrings
}) {
  const pathname = usePathname() ?? "/"
  const [open, setOpen] = useState(false)
  const t = strings.nav
  const d = t.descriptions
  const to = (path: string) => localePath(lang, path)
  const item = (path: string, label: string, description: string): Item => ({ href: to(path), label, description })

  const research = item("/research", t.research, d.research)
  const atlas = item("/atlas", t.atlas, d.atlas)
  const evaluations = item("/evaluations", t.evaluations, d.evaluations)
  const publications = item("/publications", t.publications, d.publications)
  const cv = item("/cv", t.cv, d.cv)
  const software = item("/software", t.software, d.software)
  const learn: Item[] = [
    item("/notes", t.notes, d.notes),
    item("/glossary", t.glossary, d.glossary),
    item("/atlas/methods", t.methods, d.methods),
    item("/atlas/timeline", t.timeline, d.timeline),
    item("/atlas/s-process", t.sProcess, d.sProcess),
  ]
  const bar: Item[] = [research, atlas, evaluations, publications, cv]
  const groups: { id: string; title: string; items: Item[] }[] = [
    { id: "work", title: t.groups.work, items: [research, publications, cv, software] },
    { id: "explore", title: t.groups.explore, items: [atlas, evaluations] },
    { id: "learn", title: t.groups.learn, items: learn },
  ]

  // The atlas' own pages that live under Learn do not light up "Atlas".
  const isActive = (href: string) => {
    const on = pathname === href || pathname.startsWith(`${href}/`)
    if (!on) return false
    if (href === atlas.href) return !learn.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    return true
  }
  const learnActive = learn.some((l) => isActive(l.href))

  // A new page closes the menu; so does Escape, which hands focus back to the
  // button that opened it.
  useEffect(() => setOpen(false), [pathname])
  const menuButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const shortName = name.replace(/^(\S)\S*\s+/, "$1. ")

  return (
    <header className="z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 print:hidden [@media(min-height:30em)]:sticky [@media(min-height:30em)]:top-0">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:gap-x-5 sm:px-8 xl:max-w-7xl">
        {/* The name gives way first: it truncates, and on a phone it is
            "J. Skowronski". Its basis is what makes the controls wrap onto a
            line of their own before they could be squeezed out. */}
        <div className="min-w-0 flex-1 basis-24">
          <Link
            href={to("/")}
            className="-my-2 inline-block max-w-full truncate py-2 align-middle font-serif text-[1.0625rem] font-semibold tracking-tight"
            onClick={() => setOpen(false)}
          >
            <span className="sm:hidden" aria-hidden>
              {shortName}
            </span>
            <span className="sr-only sm:not-sr-only">{name}</span>
          </Link>
        </div>

        <nav aria-label={t.label} className={`${DESKTOP_FLEX} items-center`}>
          <ul className="flex items-center gap-5 xl:gap-6">
            {bar.map((entry) => (
              <li key={entry.href}>
                <BarLink item={entry} active={isActive(entry.href)} />
              </li>
            ))}
            <li>
              <LearnMenu label={t.learn} items={learn} active={learnActive} isActive={isActive} />
            </li>
          </ul>
        </nav>

        {/* With very large text on a narrow screen the controls wrap among
            themselves too, rather than run off the edge. */}
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-0.5">
          <SearchButton lang={lang} strings={strings.search} />
          <LanguageSwitch lang={lang} strings={strings.language} />
          <ThemeToggle label={t.theme} />
          <button
            ref={menuButton}
            type="button"
            aria-label={open ? t.closeMenu : t.openMenu}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-accent ${MOBILE_ONLY}`}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label={t.label}
          className={`max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-border/70 ${MOBILE_ONLY}`}
        >
          <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-5 px-4 pb-5 pt-4 sm:grid-cols-2 sm:px-8 xl:max-w-7xl">
            {groups.map((group) => (
              <section key={group.id} aria-labelledby={`menu-${group.id}`}>
                <h2
                  id={`menu-${group.id}`}
                  className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {group.title}
                </h2>
                <ul>
                  {group.items.map((entry) => (
                    <li key={entry.href}>
                      <Link
                        href={entry.href}
                        aria-current={isActive(entry.href) ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={`-ml-3 block border-l-2 py-2 pl-[calc(0.75rem-2px)] pr-2 ${
                          isActive(entry.href)
                            ? "border-l-foreground"
                            : "border-l-transparent hover:border-l-border"
                        }`}
                      >
                        <span
                          className={`block text-[0.9375rem] ${
                            isActive(entry.href) ? "font-medium text-foreground" : "text-foreground/90"
                          }`}
                        >
                          {entry.label}
                        </span>
                        <span className="block text-pretty text-[0.8125rem] leading-snug text-muted-foreground">
                          {entry.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
      )}
    </header>
  )
}

// A 40px-tall target, and the current section marked the same way here and
// in the menu: foreground ink plus a rule under it.
const BAR =
  "relative inline-flex h-10 items-center whitespace-nowrap text-sm transition-colors hover:text-foreground after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:rounded-full after:content-['']"
const BAR_ON = "font-medium text-foreground after:bg-foreground"
const BAR_OFF = "text-muted-foreground after:bg-transparent hover:after:bg-border"

function BarLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={`${BAR} ${active ? BAR_ON : BAR_OFF}`}>
      {item.label}
    </Link>
  )
}

/**
 * "Learn ▾": a disclosure (a button that shows and hides a list of links),
 * not an ARIA menu, since what it holds is navigation. Escape closes it and
 * returns focus to the button; so does a click outside it, or focus leaving
 * it. The arrow keys move between its links, and Down on the button opens it
 * on the first one.
 */
function LearnMenu({
  label,
  items,
  active,
  isActive,
}: {
  label: string
  items: Item[]
  active: boolean
  isActive: (href: string) => boolean
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [open])

  const links = () => [...(root.current?.querySelectorAll<HTMLAnchorElement>("[data-learn-link]") ?? [])]
  const focusLink = (i: number) => {
    const all = links()
    all[(i + all.length) % all.length]?.focus()
  }

  return (
    <div
      ref={root}
      className="relative"
      onBlur={(e) => {
        if (open && !root.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation()
          setOpen(false)
          button.current?.focus()
          return
        }
        const all = links()
        const at = all.indexOf(document.activeElement as HTMLAnchorElement)
        if (e.key === "ArrowDown") {
          e.preventDefault()
          if (!open) {
            setOpen(true)
            requestAnimationFrame(() => focusLink(0))
          } else focusLink(at + 1)
        } else if (e.key === "ArrowUp" && open) {
          e.preventDefault()
          focusLink(at <= 0 ? -1 : at - 1)
        } else if ((e.key === "Home" || e.key === "End") && open && at >= 0) {
          e.preventDefault()
          focusLink(e.key === "Home" ? 0 : -1)
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`${BAR} gap-1 ${active ? BAR_ON : BAR_OFF}`}
      >
        {label}
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id={id}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-2 w-[21rem] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
      >
        <ul>
          {items.map((entry) => (
            <li key={entry.href}>
              <Link
                data-learn-link=""
                href={entry.href}
                aria-current={isActive(entry.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block rounded-md px-3 py-2 transition-colors hover:bg-accent focus-visible:bg-accent ${
                  isActive(entry.href) ? "bg-accent/70" : ""
                }`}
              >
                <span className={`block text-sm ${isActive(entry.href) ? "font-medium text-foreground" : "text-foreground"}`}>
                  {entry.label}
                </span>
                <span className="block text-pretty text-[0.8125rem] leading-snug text-muted-foreground">
                  {entry.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
