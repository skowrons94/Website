/**
 * The site search's matcher: small, dependency-free, and loaded only with the
 * search dialog (components/search/command-palette.tsx).
 *
 * Both the query and the index are folded to plain lower-case ASCII before
 * they are compared, which is what lets the ways people actually type a
 * reaction find it: `¹⁴N(p,γ)¹⁵O` folds to `14n(p,g)15o`, so "14N(p,g)",
 * "(p,γ)", "p,gamma" and "p, γ" all match it, and the index adds `N14`,
 * `nitrogen-14` and `azoto-14` as keys (scripts/search-index.mjs).
 *
 * Every word of the query must match somewhere in an entry (its label, its
 * subtitle, or its hidden keys); a word that matches nowhere exactly may still
 * match a word of the label or keys with one typo (two for long words).
 * Matches in the label count most, at the start of a word more than inside
 * one, and the hidden keys (aliases, the other language's names) least.
 */

export type EntryType =
  | "page"
  | "process"
  | "reaction"
  | "evaluation"
  | "glossary"
  | "note"
  | "section"
  | "research"
  | "method"
  | "facility"
  | "publication"

export interface SearchEntry {
  t: EntryType
  /** Label, as shown. */
  l: string
  /** Subtitle, as shown. */
  s: string
  /** Site-relative href without the base path, or an absolute URL when `x`. */
  h: string
  /** Hidden text that should also find the entry. */
  k: string
  /** External link. */
  x?: 1
  /** Extra weight (a key reaction). */
  w?: number
}

/** The order of the groups when their best results score alike. */
export const TYPE_ORDER: EntryType[] = [
  "page",
  "process",
  "reaction",
  "evaluation",
  "glossary",
  "note",
  "section",
  "research",
  "method",
  "facility",
  "publication",
]

const TYPE_WEIGHT: Record<EntryType, number> = {
  page: 3,
  process: 3,
  reaction: 2,
  evaluation: 2,
  glossary: 2,
  note: 1.5,
  research: 1,
  method: 1,
  facility: 1,
  section: 0,
  publication: 0,
}

const GREEK: Record<string, string> = { γ: "g", α: "a", β: "b", ν: "nu", μ: "mu", π: "pi", η: "eta", σ: "sigma", χ: "chi" }

/** Plain lower-case ASCII, with the nuclear notation unfolded. */
export function fold(text: string): string {
  return (
    text
      // Superscript digits and signs to their plain forms, accents off.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[γαβνμπησχ]/g, (c) => GREEK[c] ?? c)
      .replace(/\bgamma\b/g, "g")
      .replace(/\b(alpha|alfa)\b/g, "a")
      .replace(/−/g, "-")
      // Hyphens, dashes, arrows and middle dots separate words.
      .replace(/[‐-―\-→·/]+/g, " ")
      .replace(/[“”"'’«»]/g, "")
      // `(p, γ)` and `( p,γ )` are `(p,g)`.
      .replace(/\s*,\s*/g, ",")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/\s+/g, " ")
      .trim()
  )
}

interface Prepared {
  entry: SearchEntry
  label: string
  sub: string
  keys: string
  words: string[]
}

export interface PreparedIndex {
  items: Prepared[]
}

const WORD = /[a-z0-9]+/g

export function prepare(entries: SearchEntry[]): PreparedIndex {
  return {
    items: entries.map((entry) => {
      const label = fold(entry.l)
      const keys = fold(entry.k)
      return {
        entry,
        label,
        sub: fold(entry.s),
        keys,
        words: [...new Set([...(label.match(WORD) ?? []), ...(keys.match(WORD) ?? [])])].filter((w) => w.length >= 3),
      }
    }),
  }
}

/** Where `token` occurs in `text`: 2 at the start of a word, 1 inside one, 0 not at all. */
function occurs(text: string, token: string): 0 | 1 | 2 {
  let i = text.indexOf(token)
  if (i < 0) return 0
  while (i >= 0) {
    if (i === 0 || !/[a-z0-9]/.test(text[i - 1])) return 2
    i = text.indexOf(token, i + 1)
  }
  return 1
}

/** Optimal-string-alignment distance, giving up early past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2 = new Array(b.length + 1).fill(0)
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
      if (v < best) best = v
    }
    if (best > max) return max + 1
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]
    prev = cur
  }
  return prev[b.length]
}

function tokenScore(item: Prepared, token: string): number {
  const inLabel = occurs(item.label, token)
  if (inLabel) return item.label.startsWith(token) ? 14 : inLabel === 2 ? 10 : 6
  const inKeys = occurs(item.keys, token)
  if (inKeys) return inKeys === 2 ? 5 : 3
  const inSub = occurs(item.sub, token)
  if (inSub) return inSub === 2 ? 3 : 1.5
  // A typo: a word of the label or keys, or the start of one.
  if (token.length < 4 || !/^[a-z]+$/.test(token)) return 0
  const max = token.length >= 8 ? 2 : 1
  for (const word of item.words) {
    if (Math.abs(word.length - token.length) <= max && distance(token, word, max) <= max) return 2
    if (word.length > token.length && distance(token, word.slice(0, token.length), 1) <= 1) return 1.5
  }
  return 0
}

export interface Group {
  type: EntryType
  entries: SearchEntry[]
}

/**
 * The entries matching `query`, best first, grouped by type; the groups are
 * ordered by their best result. `perGroup` caps each group (more when only
 * one type matches).
 */
export function search(index: PreparedIndex, query: string, perGroup = 5): Group[] {
  const q = fold(query)
  if (!q) return []
  const tokens = q.split(" ").filter(Boolean)
  const scored: { item: Prepared; score: number }[] = []
  for (const item of index.items) {
    let score = 0
    let ok = true
    for (const token of tokens) {
      const s = tokenScore(item, token)
      if (s === 0) {
        ok = false
        break
      }
      score += s
    }
    if (!ok) continue
    if (item.label === q) score += 30
    else if (tokens.length > 1 && item.label.includes(q)) score += 10
    else if (tokens.length > 1 && item.keys.includes(q)) score += 4
    score += TYPE_WEIGHT[item.entry.t] + (item.entry.w ?? 0)
    scored.push({ item, score })
  }
  scored.sort((a, b) => b.score - a.score)

  const groups = new Map<EntryType, { best: number; entries: SearchEntry[] }>()
  for (const { item, score } of scored) {
    const g = groups.get(item.entry.t)
    if (!g) groups.set(item.entry.t, { best: score, entries: [item.entry] })
    else g.entries.push(item.entry)
  }
  const cap = groups.size === 1 ? perGroup * 3 : perGroup
  return [...groups.entries()]
    .sort((a, b) => b[1].best - a[1].best || TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]))
    .map(([type, g]) => ({ type, entries: g.entries.slice(0, cap) }))
}
