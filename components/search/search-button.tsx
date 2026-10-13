"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"

import type { ChromeStrings } from "@/lib/chrome-strings"
import type { Lang } from "@/lib/locale"

// The dialog, the matcher and the index are fetched the first time search is
// opened (or the button is hovered or focused), never with the page.
const loadPalette = () => import("@/components/search/command-palette")
const CommandPalette = dynamic(loadPalette, { ssr: false })

/** Typing into something: "/" is then a character, not a shortcut. */
function editing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * The header's search button, and the two shortcuts that do the same: "/"
 * anywhere outside a text field, and Ctrl-K / ⌘-K anywhere.
 */
export function SearchButton({ lang, strings }: { lang: Lang; strings: ChromeStrings["search"] }) {
  const [open, setOpen] = useState(false)
  const [initialQuery, setInitialQuery] = useState("")
  const button = useRef<HTMLButtonElement>(null)

  // --- find ---: an address with ?q=… (the WebSite SearchAction in the home
  // page's structured data) opens search with that query typed in.
  useEffect(() => {
    let q: string | null = null
    try {
      q = new URLSearchParams(window.location.search).get("q")
    } catch {
      q = null
    }
    if (q && q.trim()) {
      setInitialQuery(q.trim().slice(0, 200))
      setOpen(true)
    }
  }, [])

  const warm = useCallback(() => {
    loadPalette().then((m) => m.loadIndex(lang)).catch(() => {})
  }, [lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === "k") {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !editing(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={warm}
        onFocus={warm}
        aria-haspopup="dialog"
        aria-keyshortcuts="/ Control+K Meta+K"
        aria-label={strings.button}
        className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [@media(min-width:64em)]:border [@media(min-width:64em)]:border-border [@media(min-width:64em)]:px-3 [@media(min-width:64em)]:mr-1.5"
      >
        <Search aria-hidden className="h-[1.05rem] w-[1.05rem] shrink-0" />
        <span aria-hidden className="hidden text-sm [@media(min-width:64em)]:inline">
          {strings.button}
        </span>
        <kbd
          aria-hidden
          className="hidden rounded border border-border bg-muted px-1.5 font-sans text-[0.6875rem] leading-5 text-muted-foreground [@media(min-width:80em)]:inline"
        >
          /
        </kbd>
      </button>
      {open && (
        <CommandPalette
          lang={lang}
          strings={strings}
          initialQuery={initialQuery}
          onClose={() => {
            setOpen(false)
            setInitialQuery("")
            // Back where search was opened from: the button, if that was it.
            requestAnimationFrame(() => {
              if (document.activeElement === document.body) button.current?.focus()
            })
          }}
        />
      )}
    </>
  )
}
