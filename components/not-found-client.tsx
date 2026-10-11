"use client"

import { useEffect, useState } from "react"

import { LangProvider } from "@/components/lang-provider"
import { NotFoundBody } from "@/components/not-found-body"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import type { Profile } from "@/lib/content"
import { langOf, type Lang } from "@/lib/i18n"

/**
 * The 404 for an address no route matches. One file serves every such address
 * (the static export has a single 404.html), so the language is read from the
 * address itself once the page is in the browser: /it/… gets the Italian page.
 */
export function NotFoundClient({ profiles }: { profiles: Record<Lang, Profile> }) {
  const [lang, setLang] = useState<Lang>("en")

  useEffect(() => {
    const base = process.env.BASE_PATH ?? ""
    const path = window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname
    const detected = langOf(path.replace(/\/$/, "") || "/")
    setLang(detected)
    document.documentElement.lang = detected
  }, [profiles])

  return (
    <LangProvider lang={lang}>
      <div className="flex min-h-screen flex-col">
        <SiteHeader name={profiles[lang].name} lang={lang} />
        <main id="content" tabIndex={-1} className="flex-1 focus:outline-none">
          <NotFoundBody lang={lang} />
        </main>
        <SiteFooter profile={profiles[lang]} lang={lang} />
      </div>
    </LangProvider>
  )
}
