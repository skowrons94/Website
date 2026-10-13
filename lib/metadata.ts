import type { Metadata, Viewport } from "next"

import { getProfile } from "@/lib/content"
import type { Lang } from "@/lib/i18n"

const OG_LOCALE: Record<Lang, string> = { en: "en_GB", it: "it_IT" }

const BASE = process.env.BASE_PATH ?? ""

/**
 * The social-preview card (public/og.png, drawn by scripts/og-image.py).
 *
 * Only when SITE_URL is known: Open Graph wants an absolute address, and
 * without a metadataBase Next.js would make one up against localhost, which
 * is worse than no image at all.
 */
const ogImages = (alt: string) =>
  process.env.SITE_URL ? [{ url: `${BASE}/og.png`, width: 1200, height: 630, alt }] : undefined

/** The browser chrome in the page's own paper and ink (globals.css). */
export const rootViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfcfa" },
    { media: "(prefers-color-scheme: dark)", color: "#151413" },
  ],
}

/**
 * Metadata for a root layout: the site title and description in `lang`.
 *
 * The `<link rel="alternate" hreflang>` pairs are not here but in
 * `components/alternates.tsx`: the metadata API would make them absolute
 * against a `metadataBase` the static build does not know.
 */
export function rootMetadata(lang: Lang): Metadata {
  const profile = getProfile(lang)
  const title = `${profile.name} — ${profile.role}`
  return {
    title: { default: title, template: `%s · ${profile.name}` },
    description: profile.tagline,
    authors: [{ name: profile.name }],
    ...(process.env.SITE_URL ? { metadataBase: new URL(process.env.SITE_URL) } : {}),
    // Small icons (the old favicon.ico was 410 kB, the largest file of a first
    // visit), and under the base path on GitHub Pages.
    icons: {
      icon: [
        { url: `${BASE}/favicon.ico`, sizes: "16x16 32x32 48x48" },
        { url: `${BASE}/icon.png`, type: "image/png", sizes: "96x96" },
      ],
      apple: `${BASE}/apple-touch-icon.png`,
    },
    openGraph: {
      title,
      description: profile.tagline,
      siteName: profile.name,
      type: "profile",
      locale: OG_LOCALE[lang],
      alternateLocale: OG_LOCALE[lang === "en" ? "it" : "en"],
      images: ogImages(title),
    },
    twitter: {
      card: process.env.SITE_URL ? "summary_large_image" : "summary",
      title,
      description: profile.tagline,
      images: ogImages(title),
    },
  }
}

/** What a page is, for its Open Graph card (`og:type` and the article's dates). */
export type PageKind = {
  type?: "website" | "article" | "profile"
  /** ISO date, for an article. */
  publishedTime?: string
  modifiedTime?: string
  section?: string
}

/**
 * Per-page metadata with matching Open Graph and Twitter cards.
 *
 * Next.js does not copy a page's `title` and `description` into the
 * `openGraph` block it inherits from the root layout, so without this every
 * shared link would preview as the landing page. `title` is the bare page
 * title; the site name is appended here, as the root template does for <title>.
 */
/**
 * A description short enough for a search result or a link preview, which
 * show about 160–200 characters: whole sentences up to `max`, else words.
 */
export function clipDescription(text: string, max = 220): string {
  const s = text.replace(/\s+/g, " ").trim()
  if (s.length <= max) return s
  const sentences = s.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []
  let out = ""
  for (const sentence of sentences) {
    if ((out + sentence).trim().length > max) break
    out += sentence
  }
  if (out.trim().length >= 80) return out.trim()
  const cut = s.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}…`
}

export function pageMetadata(title: string, fullDescription: string, lang: Lang = "en", kind: PageKind = {}): Metadata {
  // --- find ---: long summaries (an atlas entry, a curiosity) are clipped.
  const description = clipDescription(fullDescription)
  const { name } = getProfile(lang)
  const full = `${title} · ${name}`
  // --- find ---: the card's type follows the page (a note is an article, the
  // CV a profile); an article carries its date and author.
  const type = kind.type ?? "website"
  const typed =
    type === "article"
      ? {
          type,
          ...(kind.publishedTime ? { publishedTime: kind.publishedTime } : {}),
          ...(kind.modifiedTime ? { modifiedTime: kind.modifiedTime } : {}),
          authors: [name],
          ...(kind.section ? { section: kind.section } : {}),
        }
      : type === "profile"
        ? { type, firstName: name.split(/\s+/)[0], lastName: name.split(/\s+/).slice(1).join(" ") }
        : { type }
  return {
    title,
    description,
    openGraph: {
      title: full,
      description,
      siteName: name,
      ...typed,
      locale: OG_LOCALE[lang],
      alternateLocale: OG_LOCALE[lang === "en" ? "it" : "en"],
      images: ogImages(full),
    },
    twitter: {
      card: process.env.SITE_URL ? "summary_large_image" : "summary",
      title: full,
      description,
      images: ogImages(full),
    },
  }
}
