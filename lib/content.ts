/**
 * Content loading.
 *
 * Everything the site says about itself lives in `content/` — Markdown for the
 * notes, YAML for the lists. Nothing is registered anywhere: a note appears
 * because its file exists, a paper appears because its entry exists. This module
 * is the only place that knows the shapes, and it runs at build time only, so
 * `fs` here is fine.
 */

import fs from "node:fs"
import path from "node:path"

import matter from "gray-matter"
import yaml from "js-yaml"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import rehypeKatex from "rehype-katex"
import rehypeSlug from "rehype-slug"
import GithubSlugger from "github-slugger"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"

import type { Lang } from "@/lib/i18n"
import { localize } from "@/lib/localize.mjs"

const CONTENT_DIR = path.join(process.cwd(), "content")
const NOTES_DIR = path.join(CONTENT_DIR, "notes")

/* -- types ----------------------------------------------------------------- */

export interface NoteMeta {
  slug: string
  title: string
  /** One line under the title, and the card blurb on the index. */
  summary: string
  /** ISO date; used for ordering and for the dateline. */
  date: string
  /** Free-form, e.g. "R-matrix theory", "Statistics". Drives index grouping. */
  topic: string
  /** Rough reading time in minutes, computed if absent. */
  readingTime: number
  /** Shown as a "further reading" list at the foot of the note. */
  references?: string[]
  /** Pin to the top of the index and surface on the landing page. */
  featured?: boolean
}

export interface Note extends NoteMeta {
  html: string
  headings: { depth: number; text: string; id: string }[]
}

export interface Publication {
  authors: string
  title: string
  journal?: string
  year: number
  doi?: string
  arxiv?: string
  /** "article" | "proceedings"; anything else lands in its own section. */
  kind: string
  /** Marks the entry with a rule and heavier weight in the list. */
  highlight?: boolean
  /** Free text shown in place of a journal, e.g. "under review at Nature Physics". */
  status?: string
}

export interface Profile {
  name: string
  role: string
  affiliation: string
  department: string
  location: string
  email: string
  orcid: string
  tagline: string
  intro: string[]
  links: { label: string; href: string }[]
  cv: { label: string; file: string }
}

export interface ResearchThread {
  id: string
  title: string
  venue: string
  period: string
  role: string
  summary: string
  body: string[]
  highlights?: string[]
  link?: { label: string; href: string }
}

export interface TimelineEntry {
  period: string
  title: string
  detail?: string
  bullets?: string[]
}

export interface TalkEntry {
  date: string
  event: string
  place?: string
  title?: string
  role?: string
}

export interface SoftwareEntry {
  id: string
  name: string
  /** One line under the name. */
  tagline?: string
  /** My part in it, e.g. "Maintainer and lead developer since 2025". */
  role?: string
  version?: string
  license?: string
  summary: string[]
  /** What it is for, as a short list. */
  uses?: string[]
  links?: { label: string; href: string }[]
  snippets?: { caption?: string; lang?: string; code: string }[]
  list?: { title: string; items: { name: string; text: string }[] }
  note?: string
}

/* -- YAML ------------------------------------------------------------------ */

/**
 * A content file in `lang`: every field replaced by its `*_<lang>` translation
 * where the file has one, English otherwise (see `lib/localize.mjs`).
 */
function readYaml<T>(name: string, lang: Lang = "en"): T {
  const file = path.join(CONTENT_DIR, name)
  return localize(yaml.load(fs.readFileSync(file, "utf8")), lang) as T
}

export const getProfile = (lang: Lang = "en") => readYaml<Profile>("profile.yaml", lang)

export const getResearch = (lang: Lang = "en") =>
  readYaml<{ threads: ResearchThread[] }>("research.yaml", lang).threads

export const getPublications = (lang: Lang = "en") =>
  // Newest first; ties keep their file order, which is where the manual
  // ordering of same-year entries lives.
  readYaml<{ publications: Publication[] }>("publications.yaml", lang)
    .publications.map((p, i) => ({ ...p, _i: i }))
    .sort((a, b) => b.year - a.year || a._i - b._i)
    .map(({ _i, ...p }) => p)

export const getSoftware = (lang: Lang = "en") =>
  readYaml<{ software: SoftwareEntry[] }>("software.yaml", lang).software

export const getExperience = (lang: Lang = "en") =>
  readYaml<{
    employment: TimelineEntry[]
    education: TimelineEntry[]
    research: TimelineEntry[]
    awards: TimelineEntry[]
    teaching: TimelineEntry[]
    supervision: TimelineEntry[]
    projects: TimelineEntry[]
    outreach: TimelineEntry[]
    skills: { label: string; items: string }[]
  }>("experience.yaml", lang)

export const getTalks = (lang: Lang = "en") =>
  readYaml<{
    invited: TalkEntry[]
    organisation: TalkEntry[]
    participation: TalkEntry[]
  }>("talks.yaml", lang)

/* -- notes ----------------------------------------------------------------- */

/** ~200 wpm on prose, discounting display math which is not read word by word. */
function estimateReadingTime(markdown: string): number {
  const prose = markdown.replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/`[^`]*`/g, " ")
  return Math.max(1, Math.round(prose.split(/\s+/).length / 200))
}

function collectHeadings(markdown: string) {
  const headings: { depth: number; text: string; id: string }[] = []
  const slugger = new GithubSlugger()
  const fences = /^```/
  let inFence = false
  for (const line of markdown.split("\n")) {
    if (fences.test(line)) inFence = !inFence
    if (inFence) continue
    const match = /^(#{2,3})\s+(.*)$/.exec(line)
    if (!match) continue
    const text = match[2]
      .replace(/\$[^$]*\$/g, "")
      .replace(/[*_`]/g, "")
      .trim()
    // The id is rehype-slug's own: the same slugger, fed the heading's text
    // as the rendered tree has it (inline maths as its source). A hand-rolled
    // slug drifted from it on "—" and on Greek letters, and those table of
    // contents links pointed nowhere.
    const id = slugger.slug(
      match[2]
        .replace(/\$([^$]*)\$/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_`]/g, "")
        .trim(),
    )
    headings.push({ depth: match[1].length, text, id })
  }
  return headings
}

/**
 * Report maths KaTeX could not parse.
 *
 * `throwOnError: false` keeps one bad expression from failing the whole build,
 * but it also means a malformed note renders as red source text and ships
 * looking merely ugly rather than broken. The commonest cause is a `$$` block
 * opened with content on the same line and closed on a later one, which the
 * Markdown parser cannot recognise as a block — it then swallows the rest of the
 * file into a single expression. Surfacing it at build time is the difference
 * between noticing and not.
 */
function warnOnMathErrors(html: string, slug: string): void {
  const errors = [...html.matchAll(/class="katex-error"[^>]*title="([^"]*)"/g)].map(
    (m) => m[1],
  )
  if (errors.length === 0) return
  console.warn(
    `\n  ⚠ ${slug}.md — ${errors.length} expression(s) KaTeX could not parse:`,
  )
  for (const error of errors.slice(0, 5)) {
    // The title attribute is HTML-escaped; decode it so the message is readable
    // in a terminal. &amp; must go last or it would double-decode the others.
    const readable = error
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
    console.warn(`      ${readable.slice(0, 160)}`)
  }
  console.warn(
    "    A $$ block must have its delimiters on their own lines, or sit entirely on one line.\n",
  )
}

/**
 * Unicode super- and subscripts in prose, as real `<sup>`/`<sub>` elements.
 *
 * The same problem the `Sci` component solves for the YAML content, solved once
 * here for the notes: the web fonts' `latin` subset stops at U+206F, so `¹²C`
 * sets correctly while `¹⁵O` and `MeV⁻¹` fall through to a system font at the
 * wrong size and baseline. See `components/sci.tsx` for the full account.
 *
 * Runs after `rehype-katex`, and steps over anything inside maths, code or an
 * existing `<sup>`/`<sub>`: KaTeX has already produced its own markup for the
 * first, and rewriting a character inside a code span would misquote it.
 */
function rehypeUnicodeScripts() {
  const SUPERSCRIPTS: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "−", "⁼": "=", "⁽": "(", "⁾": ")", "ⁿ": "n",
  }
  const SUBSCRIPTS: Record<string, string> = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    "₊": "+", "₋": "−", "₌": "=", "₍": "(", "₎": ")",
  }
  const MARKS = /[⁰-ₜ²³¹]+/g
  const SKIP = new Set(["code", "pre", "sup", "sub", "math", "svg", "annotation"])

  const rewrite = (value: string) => {
    const out: any[] = []
    let last = 0
    for (const match of value.matchAll(MARKS)) {
      const run = match[0]
      const start = match.index ?? 0
      if (start > last) out.push({ type: "text", value: value.slice(last, start) })
      const isSub = run[0] in SUBSCRIPTS
      const table = isSub ? SUBSCRIPTS : SUPERSCRIPTS
      const plain = [...run].map((c) => table[c] ?? c).join("")
      out.push({
        type: "element",
        tagName: isSub ? "sub" : "sup",
        properties: {},
        children: [{ type: "text", value: plain }],
      })
      last = start + run.length
    }
    if (last < value.length) out.push({ type: "text", value: value.slice(last) })
    return out
  }

  const walk = (node: any) => {
    if (!node.children) return
    // KaTeX output carries its own scripts; so does anything the author put in
    // a code span. Neither is prose.
    if (node.type === "element") {
      if (SKIP.has(node.tagName)) return
      const className = node.properties?.className
      if (Array.isArray(className) && className.some((c: string) => String(c).startsWith("katex")))
        return
    }
    const children: any[] = []
    for (const child of node.children) {
      if (child.type === "text" && MARKS.test(child.value)) {
        MARKS.lastIndex = 0
        children.push(...rewrite(child.value))
      } else {
        walk(child)
        children.push(child)
      }
      MARKS.lastIndex = 0
    }
    node.children = children
  }

  return (tree: any) => walk(tree)
}

export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: { className: ["heading-anchor"], ariaHidden: true, tabIndex: -1 },
      content: { type: "text", value: "#" },
    })
    // `strict: false` keeps one unsupported macro from blanking a whole note;
    // `throwOnError: false` renders the offending source in red instead of
    // failing the build.
    .use(rehypeKatex, { strict: false, throwOnError: false })
    // After KaTeX, so its own markup is already in place and can be stepped over.
    .use(rehypeUnicodeScripts)
    .use(rehypeStringify)
    .process(markdown)
  // Root-relative links and images need the site's base path when it is
  // served from a subdirectory (the GitHub Pages build).
  const base = process.env.BASE_PATH ?? ""
  const html = String(file)
  return base ? html.replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`) : html
}

export function getNoteSlugs(): string[] {
  if (!fs.existsSync(NOTES_DIR)) return []
  return fs
    .readdirSync(NOTES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
}

/**
 * Frontmatter dates to `YYYY-MM-DD`.
 *
 * YAML parses an unquoted `2026-07-20` into a `Date`, whose `toString()` is
 * `"Sat Jul 20 2026 …"` — slicing that gives `"Sat Jul 2"`, which is not a date
 * any parser will take. A quoted value arrives as a plain string and passes
 * through. Both forms must work, because both are natural things to write.
 */
function normaliseDate(value: unknown): string {
  if (!value) return ""
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}

function readNoteFile(slug: string) {
  const raw = fs.readFileSync(path.join(NOTES_DIR, `${slug}.md`), "utf8")
  const { data, content } = matter(raw)
  const meta: NoteMeta = {
    slug,
    title: data.title ?? slug,
    summary: data.summary ?? "",
    date: normaliseDate(data.date),
    topic: data.topic ?? "Notes",
    readingTime: data.readingTime ?? estimateReadingTime(content),
    references: data.references,
    featured: data.featured ?? false,
  }
  return { meta, content }
}

/** Index entries, newest first, featured pinned above the rest. */
export function getAllNotes(): NoteMeta[] {
  return getNoteSlugs()
    .map((slug) => readNoteFile(slug).meta)
    .sort(
      (a, b) =>
        Number(b.featured ?? false) - Number(a.featured ?? false) ||
        b.date.localeCompare(a.date),
    )
}

export async function getNote(slug: string): Promise<Note> {
  const { meta, content } = readNoteFile(slug)
  const html = await renderMarkdown(content)
  warnOnMathErrors(html, slug)
  return { ...meta, html, headings: collectHeadings(content) }
}

/* -- formatting ------------------------------------------------------------ */

export function formatDate(iso: string, lang: Lang = "en"): string {
  if (!iso) return ""
  const date = new Date(`${iso}T00:00:00Z`)
  // A malformed frontmatter date should cost the dateline, not print
  // "Invalid Date" into the page.
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(lang === "it" ? "it-IT" : "en-GB", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}
