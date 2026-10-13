"use client"

import { Download } from "lucide-react"

import { localePath, type Lang } from "@/lib/i18n"

/**
 * "BibTeX of this page's references": saves the entries written at build time
 * (lib/atlas-bibtex.ts) as a .bib file, with the page's own address filled in
 * the way the citation box shows it (SITE_URL, else where the page is read).
 */
export function BibtexDownload({
  text,
  filename,
  path,
  lang,
  label,
  hint,
}: {
  text: string
  filename: string
  path: string
  lang: Lang
  label: string
  hint: string
}) {
  const onClick = async () => {
    const local = `${process.env.BASE_PATH ?? ""}${localePath(lang, path)}`
    const url = process.env.SITE_URL ? `${process.env.SITE_URL.replace(/\/$/, "")}${local}` : `${window.location.origin}${local}`
    const { save } = await import("@/lib/data/client")
    save(text.replace("__PAGE_URL__", url), filename, "application/x-bibtex")
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-foreground/30 hover:text-link"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {label} <span className="font-normal text-muted-foreground">· {hint}</span>
    </button>
  )
}
