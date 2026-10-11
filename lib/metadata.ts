import type { Metadata } from "next"

import { getProfile } from "@/lib/content"

/**
 * Per-page metadata with matching Open Graph and Twitter cards.
 *
 * Next.js does not copy a page's `title` and `description` into the
 * `openGraph` block it inherits from the root layout, so without this every
 * shared link would preview as the landing page. `title` is the bare page
 * title; the site name is appended here, as the root template does for <title>.
 */
export function pageMetadata(title: string, description: string): Metadata {
  const { name } = getProfile()
  const full = `${title} · ${name}`
  return {
    title,
    description,
    openGraph: { title: full, description, siteName: name, type: "website" },
    twitter: { card: "summary", title: full, description },
  }
}
