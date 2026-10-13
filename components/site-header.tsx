"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Menu, X } from "lucide-react"

import { LanguageSwitch } from "@/components/language-switch"
import { Sci } from "@/components/sci"
import { SearchButton } from "@/components/search/search-button"
import { ThemeToggle } from "@/components/theme-toggle"
import type { ChromeStrings } from "@/lib/chrome-strings"
import { localePath, type Lang } from "@/lib/locale"

/*
 * The header.
 *
 * Six destinations in the bar (Research, Atlas, Evaluations, Publications,
 * Software, CV) and a "Learn" disclosure for the explanatory pages (Notes,
 * Glossary, Methods, Timeline, the s-process). Software is in the bar rather
 * than under Learn because it is work, not an explanation, and it fits: the
 * bar only appears from 64em (1024 px at the default text size), where the
 * six links, Learn, search, EN/IT and the theme take about 900 px in either
 * language. Below that breakpoint the destinations move into a menu that
 * lists every page, in three groups, each with one line saying what is there.
 *
 * Sized in rem and switched at breakpoints in em, so with text enlarged to
 * 200% the bar becomes the menu rather than running off the screen (WCAG
 * 1.4.4). Below 30em (a phone, or a tablet at 200% text) the bar keeps to one
 * row, the name, search and the menu button, and EN/IT and the theme move
 * into the menu; above it they stay in the bar. The name truncates (or
 * shortens, on a phone) before a control can be pushed out of reach.
 *
 * It sticks to the top only where the window is tall enough for that to help:
 * on a phone held sideways it scrolls away with the page. Its current height
 * is published as `--header-h` on <html> (0 when it is not sticky or is
 * hidden), for anything else that sticks below it. A page can ask for more
 * room by putting `data-hide-header-on-scroll` on <body> (the evaluation's
 * plot does, on a phone): the header then slides away while the page scrolls
 * down and comes back as soon as it scrolls up.
 *
 * No strings from lib/i18n.ts here: they come from the server as `strings`
 * (lib/chrome-strings.ts), which keeps the dictionaries out of every page's
 * JavaScript.
 */

type Item = { href: string; label: string; description: string }

// `[@media(min-width:64em)]`: the desktop bar; below 30em, a phone (or larger
// text), where EN/IT and the theme live in the menu. Literals, so Tailwind
// sees them.
const DESKTOP_FLEX = "hidden [@media(min-width:64em)]:flex"
const MOBILE_ONLY = "[@media(min-width:64em)]:hidden"
const NARROW_HIDDEN = "hidden [@media(min-width:30em)]:flex"
const NARROW_ONLY = "[@media(min-width:30em)]:hidden"

/** The opt-in on <body> for a header that gets out of the way on scroll. */
const HIDE_ON_SCROLL = "data-hide-header-on-scroll"

/**
 * Keeps `--header-h` on <html> equal to the height the header covers at the
 * top of the window (0 when it scrolls with the page or is hidden), and, on a
 * page that opts in, hides it while scrolling down and shows it on the way
 * back up. Returns whether it is hidden.
 */
function useHeaderSpace(header: React.RefObject<HTMLElement | null>, menuOpen: boolean): boolean {
  const [hidden, setHidden] = useState(false)
  const hiddenRef = useRef(false)
  hiddenRef.current = hidden

  // The variable follows the header's size, whether it sticks, and `hidden`.
  useEffect(() => {
    const el = header.current
    if (!el) return
    const root = document.documentElement
    // Writing a custom property on <html> restyles the whole document, so it
    // is written only when the value actually changes.
    const update = () => {
      const sticky = getComputedStyle(el).position === "sticky"
      const h = sticky && !hiddenRef.current ? Math.round(el.getBoundingClientRect().height) : 0
      const value = `${h}px`
      // Before the first write the stylesheet's default applies (globals.css):
      // 4rem plus the border, or 0 on a short window.
      const fallback = window.matchMedia("(max-height: 30em)").matches
        ? "0px"
        : `${Math.round(4 * parseFloat(getComputedStyle(root).fontSize) + 1)}px`
      const current = root.style.getPropertyValue("--header-h") || fallback
      if (current !== value) root.style.setProperty("--header-h", value)
      if (root.hasAttribute("data-header-hidden") !== hiddenRef.current)
        root.toggleAttribute("data-header-hidden", hiddenRef.current)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [header, hidden])

  // Hide on the way down, show on the way up; only where <body> asks for it,
  // which can change while the page is open (a tab switch).
  useEffect(() => {
    const el = header.current
    if (!el) return
    let enabled = document.body.hasAttribute(HIDE_ON_SCROLL)
    let lastY = window.scrollY
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const dy = y - lastY
        if (Math.abs(dy) < 6) return
        lastY = y
        if (!enabled || getComputedStyle(el).position !== "sticky") {
          if (hiddenRef.current) setHidden(false)
          return
        }
        // Never while the menu is open or something in the header has focus.
        const busy = menuOpen || el.contains(document.activeElement)
        if (dy > 0 && y > el.offsetHeight && !busy) setHidden(true)
        else if (dy < 0 || busy) setHidden(false)
      })
    }
    const mo = new MutationObserver(() => {
      enabled = document.body.hasAttribute(HIDE_ON_SCROLL)
      if (!enabled) setHidden(false)
    })
    mo.observe(document.body, { attributes: true, attributeFilter: [HIDE_ON_SCROLL] })
    // Tabbing into a hidden header brings it back.
    const onFocus = () => setHidden(false)
    window.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("focusin", onFocus)
    return () => {
      mo.disconnect()
      el.removeEventListener("focusin", onFocus)
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [header, menuOpen])

  return hidden
}

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
    // --- lit ---
    item("/atlas/open-questions", t.openQuestions, t.openQuestionsDescription),
    item("/atlas/rates", t.rates, t.ratesDescription),
    item("/atlas/rates/curiosities", t.curiosities, t.curiositiesDescription),
    // --- data public ---
    item("/data", t.data, t.dataDescription),
    // --- find ---
    item("/learn/exercises", t.exercises, t.exercisesDescription),
    item("/about", t.about, t.aboutDescription),
  ]
  const bar: Item[] = [research, atlas, evaluations, publications, software, cv]
  const groups: { id: string; title: string; items: Item[] }[] = [
    { id: "work", title: t.groups.work, items: [research, publications, cv, software] },
    { id: "explore", title: t.groups.explore, items: [atlas, evaluations] },
    { id: "learn", title: t.groups.learn, items: learn },
  ]

  // The atlas' own pages that live under Learn do not light up "Atlas".
  const isActive = (href: string) => {
    const on = pathname === href || pathname.startsWith(`${href}/`)
    if (!on) return false
    const under = (l: Item) => pathname === l.href || pathname.startsWith(`${l.href}/`)
    if (href === atlas.href) return !learn.some(under)
    // The most specific item only: the curiosities, not also "Reaction rates".
    return !learn.some((l) => l.href.length > href.length && l.href.startsWith(`${href}/`) && under(l))
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
  const headerRef = useRef<HTMLElement>(null)
  const hidden = useHeaderSpace(headerRef, open)

  return (
    <header
      ref={headerRef}
      data-hidden={hidden ? "" : undefined}
      // Hidden, it is only moved up out of view: Tab still reaches it, and
      // focus inside brings it back.
      className="z-40 border-b border-border/70 bg-background/95 backdrop-blur transition-transform duration-200 ease-out supports-[backdrop-filter]:bg-background/85 motion-reduce:transition-none print:hidden data-[hidden]:-translate-y-full [@media(min-height:30em)]:sticky [@media(min-height:30em)]:top-0"
    >
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:gap-x-5 sm:px-8 xl:max-w-7xl [@media(max-width:29.999em)]:flex-nowrap">
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
            <span className="sr-only whitespace-nowrap sm:not-sr-only">{name}</span>
          </Link>
        </div>

        <nav aria-label={t.label} className={`${DESKTOP_FLEX} items-center`}>
          <ul className="flex items-center gap-4 xl:gap-6">
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
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-0.5 [@media(max-width:29.999em)]:flex-nowrap">
          <SearchButton lang={lang} strings={strings.search} />
          <div className={`${NARROW_HIDDEN} items-center gap-0.5`}>
            <LanguageSwitch lang={lang} strings={strings.language} />
            <ThemeToggle label={t.theme} />
          </div>
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
                          <Sci>{entry.description}</Sci>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {/* On a phone EN/IT and the theme are here rather than in the bar. */}
            <div className={`-mx-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/70 pt-3 ${NARROW_ONLY}`}>
              <LanguageSwitch lang={lang} strings={strings.language} variant="menu" />
              <ThemeToggle label={t.theme} withLabel />
            </div>
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
