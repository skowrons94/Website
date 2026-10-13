"use client"

import { usePathname } from "next/navigation"

import { englishPath, localePath } from "@/lib/locale"
import { pageUrl } from "@/lib/site-url"

/**
 * `<link rel="alternate" hreflang>` for the page in each language, and
 * `x-default` pointing at the English; the page's canonical address and its
 * `og:url`. React hoists `<link>` and `<meta>` into `<head>` wherever they
 * are rendered. The URLs carry the base path, and are absolute when SITE_URL
 * is set at build time (lib/site-url.ts). Each language is canonical for
 * itself: the Italian page is a translation, not a duplicate.
 */
export function Alternates() {
  const pathname = usePathname() ?? "/"
  const english = englishPath(pathname)
  const self = pageUrl(pathname)
  return (
    <>
      <link rel="canonical" href={self} />
      <meta property="og:url" content={self} />
      <link rel="alternate" hrefLang="en" href={pageUrl(english)} />
      <link rel="alternate" hrefLang="it" href={pageUrl(localePath("it", english))} />
      <link rel="alternate" hrefLang="x-default" href={pageUrl(english)} />
    </>
  )
}
