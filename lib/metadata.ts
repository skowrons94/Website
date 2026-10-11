import type { Metadata } from "next"

import { getProfile } from "@/lib/content"
import type { Lang } from "@/lib/i18n"

const OG_LOCALE: Record<Lang, string> = { en: "en_GB", it: "it_IT" }

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
    openGraph: {
      title,
      description: profile.tagline,
      siteName: profile.name,
      type: "profile",
      locale: OG_LOCALE[lang],
      alternateLocale: OG_LOCALE[lang === "en" ? "it" : "en"],
    },
    twitter: { card: "summary", title, description: profile.tagline },
  }
}

/**
 * Per-page metadata with matching Open Graph and Twitter cards.
 *
 * Next.js does not copy a page's `title` and `description` into the
 * `openGraph` block it inherits from the root layout, so without this every
 * shared link would preview as the landing page. `title` is the bare page
 * title; the site name is appended here, as the root template does for <title>.
 */
export function pageMetadata(title: string, description: string, lang: Lang = "en"): Metadata {
  const { name } = getProfile(lang)
  const full = `${title} · ${name}`
  return {
    title,
    description,
    openGraph: {
      title: full,
      description,
      siteName: name,
      type: "website",
      locale: OG_LOCALE[lang],
      alternateLocale: OG_LOCALE[lang === "en" ? "it" : "en"],
    },
    twitter: { card: "summary", title: full, description },
  }
}
