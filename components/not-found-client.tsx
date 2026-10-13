"use client"

import { useEffect, useState } from "react"

import { langOf, type Lang } from "@/lib/locale"

/**
 * The 404 for an address no route matches. One file serves every such address
 * (the static export has a single 404.html), so the language is read from the
 * address itself once the page is in the browser: /it/… gets the Italian page.
 *
 * Both languages' pages are rendered on the server (app/global-not-found.tsx)
 * and handed in as `pages`; this only chooses one, so no dictionary is sent to
 * the browser.
 */
export function NotFoundClient({
  pages,
  evaluations = [],
}: {
  pages: Record<Lang, React.ReactNode>
  /** The evaluation ids: /evaluations/7be goes on to /evaluations/7Be (next.config.mjs does it on the server). */
  evaluations?: string[]
}) {
  const [lang, setLang] = useState<Lang>("en")

  useEffect(() => {
    const base = process.env.BASE_PATH ?? ""
    const path = window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname
    const misspelt = /^(\/it)?\/evaluations\/([^/]+)(\/?)$/.exec(path)
    let asked: string | null = null
    if (misspelt) {
      try {
        asked = decodeURIComponent(misspelt[2]).toLowerCase()
      } catch {
        // A malformed escape (/evaluations/%E0): no evaluation has that name.
      }
    }
    const id = asked !== null && evaluations.find((e) => e.toLowerCase() === asked)
    if (misspelt && id && id !== misspelt[2]) {
      const { search, hash } = window.location
      window.location.replace(`${base}${misspelt[1] ?? ""}/evaluations/${id}${misspelt[3]}${search}${hash}`)
      return
    }
    const detected = langOf(path.replace(/\/$/, "") || "/")
    setLang(detected)
    document.documentElement.lang = detected
  }, [])

  return <>{pages[lang]}</>
}
