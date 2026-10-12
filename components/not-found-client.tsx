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
export function NotFoundClient({ pages }: { pages: Record<Lang, React.ReactNode> }) {
  const [lang, setLang] = useState<Lang>("en")

  useEffect(() => {
    const base = process.env.BASE_PATH ?? ""
    const path = window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname
    const detected = langOf(path.replace(/\/$/, "") || "/")
    setLang(detected)
    document.documentElement.lang = detected
  }, [])

  return <>{pages[lang]}</>
}
