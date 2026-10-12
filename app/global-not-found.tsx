import "katex/dist/katex.min.css"
import "./globals.css"

import type { Metadata } from "next"

import { LangProvider } from "@/components/lang-context"
import { NotFoundBody } from "@/components/not-found-body"
import { NotFoundClient } from "@/components/not-found-client"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { chromeStrings } from "@/lib/chrome-strings"
import { getProfile } from "@/lib/content"
import { mono, sans, serif } from "@/lib/fonts"
import type { Lang } from "@/lib/i18n"

/*
 * The site has two root layouts, one per language (app/(en), app/it), so an
 * address that matches no route at all has no layout to render a 404 in. This
 * is that page, with a document of its own (experimental.globalNotFound).
 */
export const metadata: Metadata = {
  // Both languages: the page learns which one it is in only in the browser.
  title: "Page not found · Pagina non trovata",
}

/** The whole page in one language, rendered here on the server. */
function Page({ lang }: { lang: Lang }) {
  const profile = getProfile(lang)
  return (
    <LangProvider lang={lang}>
      <div className="flex min-h-screen flex-col">
        <SiteHeader name={profile.name} lang={lang} strings={chromeStrings(lang)} />
        <main id="content" tabIndex={-1} className="flex-1 focus:outline-none">
          <NotFoundBody lang={lang} />
        </main>
        <SiteFooter profile={profile} lang={lang} />
      </div>
    </LangProvider>
  )
}

export default function GlobalNotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${serif.variable} ${mono.variable} font-sans`}>
        <ThemeProvider attribute={["class", "data-theme"]} defaultTheme="system" enableSystem disableTransitionOnChange>
          <NotFoundClient pages={{ en: <Page lang="en" />, it: <Page lang="it" /> }} />
        </ThemeProvider>
      </body>
    </html>
  )
}
