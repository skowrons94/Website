"use client"

import { usePathname } from "next/navigation"

import { englishPath, localePath } from "@/lib/i18n"

/**
 * `<link rel="alternate" hreflang>` for the page in each language, and
 * `x-default` pointing at the English. React hoists `<link>` into `<head>`
 * wherever it is rendered. The URLs carry the base path, and are absolute when
 * SITE_URL is set at build time.
 */
export function Alternates() {
  const pathname = usePathname() ?? "/"
  const english = englishPath(pathname)
  const origin = process.env.SITE_URL?.replace(/\/$/, "") ?? ""
  const slash = process.env.TRAILING_SLASH === "1"
  const url = (path: string) => {
    const full = `${process.env.BASE_PATH ?? ""}${path === "/" ? "" : path}`
    return `${origin}${full === "" ? "/" : slash && !full.endsWith("/") ? `${full}/` : full}`
  }
  return (
    <>
      <link rel="alternate" hrefLang="en" href={url(english)} />
      <link rel="alternate" hrefLang="it" href={url(localePath("it", english))} />
      <link rel="alternate" hrefLang="x-default" href={url(english)} />
    </>
  )
}
