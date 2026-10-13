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
 * subtitle, its hidden keys or the words of its text), except words like
 * "why" or "perché" that find nothing on their own. A word matches at the
 * start of a word, never in the middle of one ("oro" finds "oro", not
 * "fluoro"), unless it holds a digit or a bracket, as reaction notation does
 * ("(p,g)" inside "14n(p,g)15o"); a word of five letters or more may also
 * match with one typo (two from eight letters), and a word of one to three
 * letters must match a whole word in an entry's text.
 *
 * The label counts most, and a reaction's target and product written out
 * ("nitrogen-14", "N14", "azoto") count as much as its label, the target more
 * than the product: "N14" puts ¹⁴N(p,γ)¹⁵O before ¹³C(p,γ)¹⁴N. Then the hidden
 * keys (aliases, synonyms, the other language's names), the subtitle, and
 * least, the text. When a reaction matches by its label or its nuclei, the
 * reactions lead the results.
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
  // --- lit ---
  | "question"

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
  /** A reaction's target and product written out, "target · … | product · …". */
  n?: string
  /** The distinct words of the entry's text. */
  b?: string
  /** What people type for it that the site does not call it ("gold", "underground"). */
  a?: string
}

/** The order of the groups when their best results score alike. */
export const TYPE_ORDER: EntryType[] = [
  "page",
  "process",
  "reaction",
  "evaluation",
  "glossary",
  // --- lit ---
  "question",
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
  // --- lit ---
  question: 1,
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
  aliases: string
  /** The target's and the product's names, folded. */
  target: string
  product: string
  targetNames: string[]
  productNames: string[]
  body: string
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
      const [t = "", p = ""] = (entry.n ?? "").split("|")
      const targetNames = t.split("·").map(fold).filter(Boolean)
      const productNames = p.split("·").map(fold).filter(Boolean)
      return {
        entry,
        label,
        sub: fold(entry.s),
        keys,
        aliases: fold(entry.a ?? ""),
        target: targetNames.join(" · "),
        product: productNames.join(" · "),
        targetNames,
        productNames,
        body: fold(entry.b ?? ""),
        words: [...new Set([...(label.match(WORD) ?? []), ...(keys.match(WORD) ?? [])])].filter((w) => w.length >= 3),
      }
    }),
  }
}

// Words of a question that find nothing by themselves ("why underground",
// "perché sottoterra", "stato di Hoyle"); dropped when the query has others.
const QUERY_STOP = new Set(
  "a an the of in on at to for and or is are why what how where which who does do il lo la i gli le un una uno di da del della dello dei degli delle in nel nella con per tra fra e o che perché cosa come dove quale chi".split(
    " ",
  ),
)

/** Types whose labels are long titles rather than names. */
const LONG_LABEL = new Set<EntryType>(["publication", "section"])

const isAlnum = (c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c)

/**
 * Where `token` occurs in `text`: 3 as a whole word, 2 at the start of a
 * word, 1 inside one (only when `inside` allows it), 0 not at all.
 */
function occurs(text: string, token: string, inside: boolean): 0 | 1 | 2 | 3 {
  let i = text.indexOf(token)
  let best: 0 | 1 | 2 | 3 = 0
  while (i >= 0) {
    if (!isAlnum(text[i - 1])) {
      if (!isAlnum(text[i + token.length])) return 3
      best = 2
    } else if (inside && best === 0) best = 1
    i = text.indexOf(token, i + 1)
  }
  return best
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

/** How a token matched: its score, and whether it was by name (label or nuclei). */
type Hit = { score: number; byName: boolean }
const MISS: Hit = { score: 0, byName: false }

function tokenScore(item: Prepared, token: string): Hit {
  const letters = /^[a-z]+$/.test(token)
  // Notation ("14n", "(p,g)", "12c+12c") may sit inside a longer run; a plain
  // word may not ("oro" is not in "fluoro").
  const inside = !letters
  // One to three letters: whole words only, except at the start of the label
  // or of a name ("cno" → "cno1", "pp" → "pp chains").
  const short = letters && token.length <= 3

  const inLabel = occurs(item.label, token, inside)
  if (inLabel && !(short && token.length === 1 && inLabel < 3)) {
    const score = item.label.startsWith(token) ? 14 : inLabel >= 2 ? 10 : 6
    // A paper's title is long and says many things: a word in it is worth
    // half a word in the name of a page or a reaction.
    return { score: LONG_LABEL.has(item.entry.t) ? score / 2 : score, byName: true }
  }
  const inTarget = occurs(item.target, token, false)
  if (inTarget && !(short && inTarget < 3 && token.length === 1)) return { score: 12, byName: true }
  const inProduct = occurs(item.product, token, false)
  if (inProduct && !(short && inProduct < 3 && token.length === 1)) return { score: 8, byName: true }
  const inAliases = occurs(item.aliases, token, inside)
  if (inAliases >= 2) return { score: 9, byName: false }
  const inKeys = occurs(item.keys, token, inside)
  if (inKeys && !(short && token.length === 1 && inKeys < 3)) return { score: inKeys >= 2 ? 5 : 3, byName: false }
  const inSub = occurs(item.sub, token, inside)
  if (inSub && !(short && inSub < 3)) return { score: inSub >= 2 ? 3 : 1.5, byName: false }
  const inBody = occurs(item.body, token, false)
  if (inBody && !(short && inBody < 3)) return { score: 2, byName: false }
  // A typo: a word of the label or keys, or the start of one. Not for short
  // words, where one letter off is a different word ("sole" is not "solo").
  if (token.length < 5 || !letters) return MISS
  const max = token.length >= 8 ? 2 : 1
  for (const word of item.words) {
    if (Math.abs(word.length - token.length) <= max && distance(token, word, max) <= max) return { score: 2, byName: false }
    if (token.length >= 6 && word.length > token.length && distance(token, word.slice(0, token.length), 1) <= 1) return { score: 1.5, byName: false }
  }
  return MISS
}

/** The query's words, less those that find nothing on their own. */
export function queryTokens(query: string): string[] {
  const all = fold(query).split(" ").filter(Boolean)
  const kept = all.filter((t) => !QUERY_STOP.has(t))
  return kept.length ? kept : all
}

export interface Group {
  type: EntryType
  entries: SearchEntry[]
}

/**
 * The entries matching `query`, best first, grouped by type; the groups are
 * ordered by their best result, except that the reactions come first when one
 * matched by its label or its nuclei alone (every word of the query). `perGroup` caps each group (more when
 * only one type matches).
 */
export function search(index: PreparedIndex, query: string, perGroup = 5): Group[] {
  const q = fold(query)
  if (!q) return []
  const tokens = queryTokens(query)
  const phrase = tokens.join(" ")
  const scored: { item: Prepared; score: number; byName: boolean }[] = []
  for (const item of index.items) {
    let score = 0
    let byName = true
    let ok = true
    for (const token of tokens) {
      const hit = tokenScore(item, token)
      if (hit.score === 0) {
        ok = false
        break
      }
      score += hit.score
      byName &&= hit.byName
    }
    if (!ok) continue
    if (item.label === q || item.label === phrase) score += 30
    else if (tokens.length > 1 && occurs(item.label, phrase, false)) score += 10
    // The whole query is a name of the target (or the product): "carbon-12",
    // "N14", "azoto".
    if (item.targetNames.includes(phrase)) score += 16
    else if (item.productNames.includes(phrase)) score += 8
    else if (tokens.length > 1 && (occurs(item.aliases, phrase, false) || occurs(item.keys, phrase, false))) score += 6
    score += TYPE_WEIGHT[item.entry.t] + (item.entry.w ?? 0)
    scored.push({ item, score, byName })
  }
  scored.sort((a, b) => b.score - a.score)

  const groups = new Map<EntryType, { best: number; entries: SearchEntry[] }>()
  let reactionByName = false
  for (const { item, score, byName } of scored) {
    if (item.entry.t === "reaction" && byName) reactionByName = true
    const g = groups.get(item.entry.t)
    if (!g) groups.set(item.entry.t, { best: score, entries: [item.entry] })
    else g.entries.push(item.entry)
  }
  const cap = groups.size === 1 ? perGroup * 3 : perGroup
  const lead = (t: EntryType) => (reactionByName && t === "reaction" ? 1 : 0)
  return [...groups.entries()]
    .sort((a, b) => lead(b[0]) - lead(a[0]) || b[1].best - a[1].best || TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]))
    .map(([type, g]) => ({ type, entries: g.entries.slice(0, cap) }))
}

/* -- highlighting ------------------------------------------------------------ */

/**
 * The parts of `text` (a label, as shown) that the query matched, as
 * [start, end) ranges in `text` itself: each character is folded on its own,
 * so the ranges land on the original "¹⁴N(p,γ)", not on "14n(p,g)".
 */
export function matchRanges(text: string, query: string): [number, number][] {
  const tokens = queryTokens(query).filter((t) => t.length >= 2 || /\d/.test(t))
  if (!tokens.length) return []
  let folded = ""
  const at: number[] = []
  let i = 0
  for (const ch of text) {
    // A separator ("-", "→", a space) folds to nothing on its own: keep it
    // as a space, so word boundaries survive.
    const f = fold(ch) || " "
    for (let k = 0; k < f.length; k++) at.push(i)
    folded += f
    i += ch.length
  }
  at.push(text.length)
  const ranges: [number, number][] = []
  for (const token of tokens) {
    const inside = !/^[a-z]+$/.test(token)
    let j = folded.indexOf(token)
    while (j >= 0) {
      if (inside || !isAlnum(folded[j - 1])) {
        const end = j + token.length
        ranges.push([at[j], end < at.length ? at[end] : text.length])
      }
      j = folded.indexOf(token, j + 1)
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}
