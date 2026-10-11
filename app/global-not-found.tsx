import "katex/dist/katex.min.css"
import "./globals.css"

import type { Metadata } from "next"

import { NotFoundClient } from "@/components/not-found-client"
import { ThemeProvider } from "@/components/theme-provider"
import { getProfile } from "@/lib/content"
import { mono, sans, serif } from "@/lib/fonts"

/*
 * The site has two root layouts, one per language (app/(en), app/it), so an
 * address that matches no route at all has no layout to render a 404 in. This
 * is that page, with a document of its own (experimental.globalNotFound).
 */
export const metadata: Metadata = {
  // Both languages: the page learns which one it is in only in the browser.
  title: "Page not found · Pagina non trovata",
}

export default function GlobalNotFound() {
  const profiles = { en: getProfile("en"), it: getProfile("it") }
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${serif.variable} ${mono.variable} font-sans`}>
        <ThemeProvider attribute={["class", "data-theme"]} defaultTheme="system" enableSystem disableTransitionOnChange>
          <NotFoundClient profiles={profiles} />
        </ThemeProvider>
      </body>
    </html>
  )
}
