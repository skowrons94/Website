import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google"

// KaTeX first, so the tuning in globals.css (which sizes maths against the
// surrounding prose) wins over the stylesheet's own defaults.
import "katex/dist/katex.min.css"
import "./globals.css"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { SessionProvider } from "@/contexts/session-context"
import { getProfile } from "@/lib/content"

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" })
const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
})
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

const profile = getProfile()

export const metadata: Metadata = {
  title: {
    default: `${profile.name} — ${profile.role}`,
    template: `%s · ${profile.name}`,
  },
  description: profile.tagline,
  authors: [{ name: profile.name }],
  openGraph: {
    title: `${profile.name} — ${profile.role}`,
    description: profile.tagline,
    siteName: profile.name,
    type: "profile",
  },
  twitter: {
    card: "summary",
    title: `${profile.name} — ${profile.role}`,
    description: profile.tagline,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sans.variable} ${serif.variable} ${mono.variable} font-sans`}
      >
        <ThemeProvider
          // Both attributes: `class` is what the Tailwind tokens key off, and
          // `data-theme` is what the chart tokens in globals.css key off.
          attribute={["class", "data-theme"]}
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SessionProvider>
            {/* First stop for a keyboard: past the eight header links to the page. */}
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
            >
              Skip to content
            </a>
            <div className="flex min-h-screen flex-col">
              <SiteHeader name={profile.name} />
              <main id="content" tabIndex={-1} className="flex-1 focus:outline-none">
                {children}
              </main>
              <SiteFooter profile={profile} />
            </div>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
