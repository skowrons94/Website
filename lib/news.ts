/**
 * What is new on the site (content/news.yaml): /news, the home page's strip
 * and the Atom feed. Read at build time; a malformed entry stops the build
 * with the reason, as a broken atlas file does.
 */

import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"

import type { Lang } from "@/lib/i18n"
import { localize } from "@/lib/localize.mjs"

export interface NewsItem {
  /** YYYY-MM-DD. */
  date: string
  text: string
  /** A site path (English, to be localized) or an absolute https:// address. */
  link?: string
  /** The commit the date comes from, for the record. */
  commit?: string
  /** A stable anchor on /news, from the date and the commit (or the position). */
  id: string
}

const FILE = path.join(process.cwd(), "content", "news.yaml")

/** YAML reads an unquoted 2026-10-12 as a Date; the site wants the string. */
function isoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00Z`)
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value) return value
  }
  return null
}

let raw: unknown[] | null = null

function load(): unknown[] {
  if (raw) return raw
  if (!fs.existsSync(FILE)) return (raw = [])
  const doc = yaml.load(fs.readFileSync(FILE, "utf8")) as { news?: unknown[] } | null
  raw = Array.isArray(doc?.news) ? doc.news : []
  return raw
}

/** Every item in `lang`, newest first (file order within a day). */
export function getNews(lang: Lang = "en"): NewsItem[] {
  const items = localize(load(), lang) as Record<string, unknown>[]
  const out: NewsItem[] = items.map((item, i) => {
    const date = isoDate(item.date)
    if (!date) throw new Error(`content/news.yaml: item ${i + 1} has no valid date (YYYY-MM-DD): ${String(item.date)}`)
    const text = typeof item.text === "string" ? item.text.trim() : ""
    if (!text) throw new Error(`content/news.yaml: item ${i + 1} (${date}) has no text`)
    const link = typeof item.link === "string" && item.link.trim() ? item.link.trim() : undefined
    if (link && !link.startsWith("/") && !/^https:\/\//.test(link))
      throw new Error(`content/news.yaml: item ${i + 1} (${date}): a link is a site path (/…) or an https:// address, not ${link}`)
    const commit = item.commit ? String(item.commit) : undefined
    return { date, text, link, commit, id: `${date}-${commit ?? i + 1}` }
  })
  return out
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.date.localeCompare(a.item.date) || a.i - b.i)
    .map(({ item }) => item)
}

/** The first sentence of an item, for a feed entry's title. */
export function headline(text: string): string {
  const m = /^(.+?[.!?:])(\s|$)/.exec(text)
  const first = (m ? m[1] : text).replace(/[.:]$/, "")
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first
}
