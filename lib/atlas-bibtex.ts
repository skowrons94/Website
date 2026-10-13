/**
 * BibTeX for an atlas page: an entry for the page itself, then one for each
 * reference it cites, in the page's order. The entries are written by the
 * data explorer's `bibEntry` (lib/data/export.ts), so the two exports share
 * one format and one escaping rule.
 *
 * The page's own address is left as PAGE_URL: the download button fills it in
 * (from SITE_URL, else the address the page is read at), as the citation box
 * does.
 */
import { bibEntry, bibEscape } from "@/lib/data/export"
import type { Reference } from "@/lib/atlas"

export const PAGE_URL = "__PAGE_URL__"

/** "A. B. Name, C. Other et al. (LUNA Collaboration)" → BibTeX `author`, plus the collaboration. */
function authors(text: string): { author: { raw: string }; collaboration: string } {
  let rest = text.trim()
  let collaboration = ""
  const collab = rest.match(/\s*\(([^)]*)\)\s*$/)
  if (collab) {
    collaboration = collab[1]
    rest = rest.slice(0, collab.index).trim()
  }
  const others = /\s*et al\.?$/.test(rest)
  rest = rest.replace(/\s*et al\.?$/, "")
  const names = rest
    .split(/,\s*|\s+and\s+/)
    .map((n) => n.trim())
    .filter(Boolean)
    // A name without initials ("Borexino Collaboration") stays whole, in braces.
    .map((n) => (/\./.test(n) ? bibEscape(n) : `{${bibEscape(n)}}`))
  if (others) names.push("others")
  return { author: { raw: names.join(" and ") }, collaboration }
}

/** "Phys. Rev. C 83, 045804 (2011); erratum …" → journal, volume, pages; the rest goes to `note`. */
function journalFields(journal: string): { kind: string; fields: [string, string][] } {
  const [main, ...extra] = journal.split(/;\s*/)
  const note: [string, string][] = extra.length ? [["note", extra.join("; ")]] : []
  const full = main.match(/^(.+?)\s+(\d+(?:\(\d+\))?),\s*(\S+?)\s*\((\d{4})\)$/)
  if (full) return { kind: "article", fields: [["journal", full[1]], ["volume", full[2]], ["pages", full[3]], ...note] }
  const short = main.match(/^(.+?)\s+(\d+)\s*\((\d{4})\)$/)
  if (short && !/preprint/i.test(short[1])) return { kind: "article", fields: [["journal", short[1]], ["volume", short[2]], ...note] }
  return { kind: "misc", fields: [["howpublished", journal]] }
}

export function referenceBib(ref: Reference): string {
  const { kind, fields } = ref.journal ? journalFields(ref.journal) : { kind: "misc", fields: [] as [string, string][] }
  const { author, collaboration } = authors(ref.authors)
  const entry: [string, unknown][] = [["author", author], ["title", ref.title], ...fields, ["year", String(ref.year)]]
  if (ref.doi) entry.push(["doi", ref.doi])
  if (ref.arxiv) entry.push(["eprint", ref.arxiv], ["archiveprefix", "arXiv"])
  if (ref.url && !ref.doi) entry.push(["url", ref.url])
  if (collaboration) {
    const i = entry.findIndex(([k]) => k === "note")
    if (i >= 0) entry[i] = ["note", `${collaboration}; ${entry[i][1]}`]
    else entry.push(["note", collaboration])
  }
  return bibEntry(kind, ref.key, entry)
}

export function pageBib(
  page: { key: string; author: string; title: string; container: string; version?: string },
  keys: string[],
  references: Record<string, Reference>,
): string {
  const year = page.version?.slice(0, 4) ?? ""
  const self = bibEntry("misc", page.key, [
    ["author", page.author],
    ["title", page.title],
    ["howpublished", page.container],
    ["year", year],
    ["note", page.version ? `Version ${page.version}` : ""],
    ["url", { raw: PAGE_URL }],
  ])
  const refs = keys.map((k) => references[k]).filter((r): r is Reference => Boolean(r)).map(referenceBib)
  return [self, ...refs].join("\n\n") + "\n"
}
