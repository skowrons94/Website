// KaTeX first, so the tuning in globals.css (which sizes maths against the
// surrounding prose) wins over the stylesheet's own defaults.
import "katex/dist/katex.min.css"
import "@/app/globals.css"

import { Alternates } from "@/components/alternates"
import { LangProvider } from "@/components/lang-provider"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { SessionProvider } from "@/contexts/session-context"
import { getProfile } from "@/lib/content"
import { mono, sans, serif } from "@/lib/fonts"
import { dict, type Lang } from "@/lib/i18n"

/**
 * The document for one language: `<html lang>`, the header, the footer.
 *
 * Each language has a root layout of its own (`app/(en)/layout.tsx` for the
 * English pages at the root, `app/it/layout.tsx` for /it), because `<html
 * lang>` belongs to the root layout and a single one cannot know the path it
 * is rendering. Both render this.
 */
export function RootShell({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const profile = getProfile(lang)
  const t = dict(lang)
  return (
    <html lang={lang} suppressHydrationWarning>
      <body className={`${sans.variable} ${serif.variable} ${mono.variable} font-sans`}>
        <ThemeProvider
          // Both attributes: `class` is what the Tailwind tokens key off, and
          // `data-theme` is what the chart tokens in globals.css key off.
          attribute={["class", "data-theme"]}
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LangProvider lang={lang}>
            <Alternates />
            <SessionProvider>
              {/* First stop for a keyboard: past the header links to the page. */}
              <a
                href="#content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
              >
                {t.skip}
              </a>
              <div className="flex min-h-screen flex-col">
                <SiteHeader name={profile.name} lang={lang} />
                <main id="content" tabIndex={-1} className="flex-1 focus:outline-none">
                  {children}
                </main>
                <SiteFooter profile={profile} lang={lang} />
              </div>
            </SessionProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
