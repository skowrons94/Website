"use client"

import { useEffect, useState } from "react"

import { localePath, type Lang } from "@/lib/i18n"

/**
 * The absolute address of a page of this site, for a citation. Taken from
 * `fixed` (the atlas' own `url:`), else SITE_URL as set at build time, else
 * the address the page is being read at, filled in once the page has loaded.
 */
export function SiteUrl({ path, lang, fixed }: { path: string; lang: Lang; fixed?: string }) {
  const base = process.env.BASE_PATH ?? ""
  const local = `${base}${localePath(lang, path)}`
  const built = fixed || (process.env.SITE_URL ? `${process.env.SITE_URL.replace(/\/$/, "")}${local}` : "")
  const [url, setUrl] = useState(built || local)
  useEffect(() => {
    if (!built) setUrl(`${window.location.origin}${local}`)
  }, [built, local])
  return <span className="break-all">{url}</span>
}
