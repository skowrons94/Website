#!/usr/bin/env node
/**
 * npm run pubs:check — compare content/publications.yaml with what ORCID and
 * Crossref know about the works of the site's ORCID iD, and write a proposal
 * for Jakub to review. It never edits publications.yaml.
 *
 *   npm run pubs:check                       # writes pubs-proposal.md and .json
 *   npm run pubs:check -- --out /tmp/p.md    # elsewhere (the .json beside it)
 *   npm run pubs:check -- --mailto me@x.org  # Crossref's "polite pool" (optional)
 *   npm run pubs:check -- --fixtures DIR     # recorded API answers, no network
 *
 * Sources, both public and without a key:
 *
 *   ORCID public API v3.0   GET https://pub.orcid.org/v3.0/<orcid>/works
 *                           (Accept: application/json): the works on the
 *                           record, grouped, each with its external ids (DOI),
 *                           title and publication date.
 *   Crossref REST API       GET https://api.crossref.org/works?filter=orcid:<orcid>
 *                           (works whose metadata carry the iD), and
 *                           GET https://api.crossref.org/works/<doi> for any DOI
 *                           ORCID lists that the first query did not return.
 *
 * The proposal lists:
 *   - new works: DOIs that ORCID or Crossref know and the YAML does not, with
 *     their metadata and a YAML entry ready to paste (check it first: the
 *     `kind`, the author list's form and the tags are guesses to correct);
 *   - year mismatches: the YAML's year against Crossref's issued year;
 *   - title mismatches: titles that differ once markup, Unicode
 *     super/subscripts, case and punctuation are set aside;
 *   - entries without a DOI (submitted, under review) whose title now matches
 *     a published work;
 *   - DOIs in the YAML that neither ORCID nor Crossref list (often only a
 *     record to complete on orcid.org).
 *
 * --fixtures DIR reads orcid-works.json, crossref-orcid.json and
 * crossref-works/<doi with / as _>.json from DIR instead of the network (the
 * test, scripts/pubs/test.mjs, does this). When the network is blocked, the
 * script says which host it could not reach and exits with status 2.
 */

import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"

const ROOT = process.cwd()

/* -- arguments ------------------------------------------------------------- */

export function parseArgs(argv) {
  const opts = { out: "pubs-proposal.md", fixtures: null, mailto: process.env.PUBS_MAILTO || "", orcid: null, publications: "content/publications.yaml", quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === "--out") opts.out = next()
    else if (a === "--fixtures") opts.fixtures = next()
    else if (a === "--mailto") opts.mailto = next() ?? ""
    else if (a === "--orcid") opts.orcid = next()
    else if (a === "--publications") opts.publications = next()
    else if (a === "--quiet") opts.quiet = true
    else if (a === "--help" || a === "-h") opts.help = true
    else throw new Error(`unknown argument ${a}`)
  }
  return opts
}

/* -- normalising ------------------------------------------------------------- */

const SUPERS = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-" }
const SUBS = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" }

export const normDoi = (doi) =>
  String(doi ?? "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .toLowerCase()

/** A title reduced to what two spellings of it share. */
export function normTitle(title) {
  return String(title ?? "")
    .replace(/<[^>]+>/g, "") // Crossref's <sub>, <sup>, <i>, <mml:…>
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (c) => SUPERS[c])
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => SUBS[c])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/γ/g, "g")
    .replace(/α/g, "a")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}

const plainTitle = (t) =>
  String(t ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()

/* -- fetching -------------------------------------------------------------- */

class Unreachable extends Error {}

function fixtureName(doi) {
  return `${normDoi(doi).replace(/[^a-z0-9.-]+/g, "_")}.json`
}

// The services' addresses; overridable only so the test can point at a closed port.
const ORCID_API = process.env.PUBS_ORCID_API || "https://pub.orcid.org/v3.0"
const CROSSREF_API = process.env.PUBS_CROSSREF_API || "https://api.crossref.org"

export function makeSource({ fixtures, mailto }) {
  const ua = `skowronski-site pubs:check (https://github.com/skowrons94/Website${mailto ? `; mailto:${mailto}` : ""})`
  async function get(url, accept = "application/json") {
    let res
    try {
      res = await fetch(url, { headers: { Accept: accept, "User-Agent": ua }, signal: AbortSignal.timeout(30000) })
    } catch (err) {
      throw new Unreachable(`could not reach ${new URL(url).host}: ${err.cause?.code ?? err.message}`)
    }
    if (res.status === 404) return null
    if (!res.ok) throw new Unreachable(`${new URL(url).host} answered HTTP ${res.status} for ${url}`)
    return res.json()
  }
  const read = (file) => {
    const p = path.join(fixtures, file)
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null
  }
  return {
    orcidWorks: (orcid) =>
      fixtures ? read("orcid-works.json") : get(`${ORCID_API}/${orcid}/works`),
    crossrefByOrcid: (orcid) =>
      fixtures
        ? read("crossref-orcid.json")
        : get(`${CROSSREF_API}/works?filter=orcid:${orcid}&rows=1000${mailto ? `&mailto=${encodeURIComponent(mailto)}` : ""}`),
    crossrefWork: (doi) =>
      fixtures
        ? read(path.join("crossref-works", fixtureName(doi)))
        : get(`${CROSSREF_API}/works/${encodeURIComponent(normDoi(doi))}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ""}`),
  }
}

/* -- reading the answers ------------------------------------------------------ */

/** ORCID v3.0 /works → [{doi, title, year, journal, type}] (one per group with a DOI). */
export function orcidEntries(doc) {
  const out = []
  for (const group of doc?.group ?? []) {
    const ids = [...(group["external-ids"]?.["external-id"] ?? [])]
    const summaries = group["work-summary"] ?? []
    for (const s of summaries) ids.push(...(s["external-ids"]?.["external-id"] ?? []))
    const doiId = ids.find((x) => String(x["external-id-type"]).toLowerCase() === "doi")
    const s = summaries[0] ?? {}
    out.push({
      doi: doiId ? normDoi(doiId["external-id-value"] ?? doiId["external-id-normalized"]?.value) : null,
      title: s.title?.title?.value ?? null,
      year: s["publication-date"]?.year?.value ? Number(s["publication-date"].year.value) : null,
      journal: s["journal-title"]?.value ?? null,
      type: s.type ?? null,
    })
  }
  return out
}

/** A Crossref work → the fields the proposal needs. */
export function crossrefEntry(w) {
  if (!w) return null
  const parts = (w.issued ?? w.published ?? w["published-print"] ?? w["published-online"])?.["date-parts"]?.[0] ?? []
  const pages = w["article-number"] ?? w.page ?? null
  return {
    doi: normDoi(w.DOI),
    title: plainTitle(Array.isArray(w.title) ? w.title[0] : w.title),
    year: parts[0] ? Number(parts[0]) : null,
    journal: (Array.isArray(w["short-container-title"]) && w["short-container-title"][0]) || (Array.isArray(w["container-title"]) ? w["container-title"][0] : null) || null,
    volume: w.volume ?? null,
    pages,
    type: w.type ?? null,
    authors: (w.author ?? []).map((a) => ({ given: a.given ?? "", family: a.family ?? a.name ?? "", orcid: a.ORCID ? String(a.ORCID).replace(/^https?:\/\/orcid\.org\//, "") : null })),
  }
}

/* -- comparing ----------------------------------------------------------------- */

const initials = (given) =>
  given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((g) => `${g[0].toUpperCase()}.`)
    .join(" ")

/** "J. Skowronski, R. J. deBoer, T. Szücs" for a few authors, "A. B, et al." for many, as the YAML writes them. */
export function authorLine(authors) {
  const names = authors.map((a) => `${initials(a.given)} ${a.family}`.trim())
  return names.length <= 5 ? names.join(", ") : `${names[0]}, et al.`
}

export function compare(publications, orcid, crossref) {
  const yamlDois = new Map()
  for (const p of publications) if (p.doi) yamlDois.set(normDoi(p.doi), p)
  const byDoi = new Map()
  for (const c of crossref) if (c?.doi) byDoi.set(c.doi, c)
  const orcidDois = new Map()
  for (const o of orcid) if (o.doi) orcidDois.set(o.doi, o)

  const known = new Set([...byDoi.keys(), ...orcidDois.keys()])
  const fresh = []
  for (const doi of [...known].sort()) {
    if (yamlDois.has(doi)) continue
    const c = byDoi.get(doi)
    const o = orcidDois.get(doi)
    fresh.push({
      doi,
      title: c?.title ?? o?.title ?? "",
      year: c?.year ?? o?.year ?? null,
      journal: c?.journal ?? o?.journal ?? null,
      volume: c?.volume ?? null,
      pages: c?.pages ?? null,
      type: c?.type ?? o?.type ?? null,
      authors: c?.authors ?? [],
      sources: [o && "ORCID", c && "Crossref"].filter(Boolean),
    })
  }

  const years = []
  const titles = []
  const missing = []
  for (const [doi, p] of yamlDois) {
    const c = byDoi.get(doi)
    const o = orcidDois.get(doi)
    if (!c && !o) {
      missing.push({ doi, title: p.title, year: p.year })
      continue
    }
    const year = c?.year ?? o?.year
    if (year && Number(p.year) !== year) years.push({ doi, title: p.title, yaml: Number(p.year), found: year, source: c?.year ? "Crossref" : "ORCID" })
    const title = c?.title ?? o?.title
    if (title && normTitle(title) !== normTitle(p.title)) titles.push({ doi, yaml: plainTitle(p.title), found: plainTitle(title), source: c?.title ? "Crossref" : "ORCID" })
  }

  // A submitted paper that has since appeared: same title, a DOI the YAML lacks.
  const published = []
  for (const p of publications) {
    if (p.doi) continue
    const match = fresh.find((f) => normTitle(f.title) === normTitle(p.title))
    if (match) published.push({ title: plainTitle(p.title), status: p.status ?? null, doi: match.doi, year: match.year, journal: [match.journal, [match.volume, match.pages].filter(Boolean).join(", ")].filter(Boolean).join(" ") || null })
  }

  // Those are proposed once, as the update of their entry, not again as new.
  const matched = new Set(published.map((p) => p.doi))
  return { fresh: fresh.filter((f) => !matched.has(f.doi)), years, titles, published, missing }
}

/* -- writing ------------------------------------------------------------------- */

// Everything from ORCID and Crossref (titles, journals, DOIs, types) is
// someone else's text and goes into a GitHub issue: it is shown as text, never
// as Markdown, so it cannot ping anyone (@user, @org/team), link anywhere or
// reference an issue (#1). A word joiner (U+2060) after "@", "#" and in "://"
// and "www." stops GitHub's autolinking without changing what one reads.
const WJ = "\u2060"
export const mdText = (t) =>
  String(t ?? "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/[\\`*_{}\[\]()<>#+!|~=-]/g, (c) => `\\${c}`)
    .replace(/@/g, `@${WJ}`)
    .replace(/#/g, `#${WJ}`)
    .replace(/:\/\//g, `:/${WJ}/`)
    .replace(/\bwww\./gi, (w) => `${w.slice(0, 3)}${WJ}.`)
    .replace(/&/g, "&amp;")
    .replace(/\s+/g, " ")
    .trim()

/** A link to a DOI: shown escaped, the URL percent-encoded (no ")" or space can end it early). */
const doiLink = (doi, label = doi) => {
  const href = `https://doi.org/${String(doi ?? "").split("/").map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/")}`
  return `[${mdText(label)}](${href})`
}

/** A fenced block that the text inside cannot close (a fence longer than any run of backticks in it). */
const fence = (lang, text) => {
  const longest = Math.max(0, ...(String(text).match(/`+/g) ?? []).map((r) => r.length))
  const f = "`".repeat(Math.max(3, longest + 1))
  return [`${f}${lang}`, text, f]
}

const KIND = (type) => (/proceedings|conference/i.test(type ?? "") ? "proceedings" : "article")

function yamlEntry(f) {
  const journal = [f.journal, f.volume, f.pages].filter(Boolean).join(" ").replace(/^(.+?) (\S+) (\S+)$/, "$1 $2, $3")
  const lines = [
    `  - kind: ${KIND(f.type)}`,
    `    authors: ${f.authors.length ? authorLine(f.authors) : "TODO"}`,
    `    title: ${JSON.stringify(f.title)}`,
    ...(journal ? [`    journal: ${journal}`] : []),
    `    doi: ${f.doi}`,
    `    year: ${f.year ?? "TODO"}`,
  ]
  return lines.join("\n")
}

export function proposal(result, { orcid, date }) {
  const { fresh, years, titles, published, missing } = result
  const count = fresh.length + years.length + titles.length + published.length
  const md = [
    `# Publications: what ORCID and Crossref know that publications.yaml does not`,
    ``,
    `ORCID iD ${orcid}, checked on ${date} by \`npm run pubs:check\`. Nothing has been changed:`,
    `this is a proposal to review. Copy what is right into content/publications.yaml.`,
    ``,
  ]
  if (count === 0 && missing.length === 0) md.push(`Nothing to do: every work matches.`, ``)
  if (published.length) {
    md.push(`## Submitted papers that now have a DOI (${published.length})`, ``)
    for (const p of published) md.push(`- **${mdText(p.title)}** (was: ${mdText(p.status ?? "no DOI")}) → ${doiLink(p.doi)}${p.journal ? `, ${mdText(p.journal)}` : ""}${p.year ? ` (${mdText(p.year)})` : ""}: replace \`status\` with \`journal\`, \`doi\` and the year.`)
    md.push(``)
  }
  if (fresh.length) {
    md.push(`## New works (${fresh.length})`, ``)
    for (const f of fresh) {
      md.push(`### ${mdText(f.title || f.doi)}`, ``)
      md.push(`${doiLink(f.doi, `doi:${f.doi}`)} · ${[f.journal, f.year, f.type].filter(Boolean).map(mdText).join(" · ")} · from ${f.sources.map(mdText).join(" and ")}`, ``)
      md.push(...fence("yaml", yamlEntry(f)), ``)
    }
    md.push(`Check each entry before pasting: \`kind\`, the form of the author list and any \`tags\` (\`[luna]\`) are for you to decide.`, ``)
  }
  if (years.length) {
    md.push(`## Years that differ (${years.length})`, ``, `| DOI | title | publications.yaml | ${"found"} |`, `|---|---|---|---|`)
    for (const y of years) md.push(`| ${doiLink(y.doi)} | ${mdText(plainTitle(y.title))} | ${mdText(y.yaml)} | ${mdText(y.found)} (${mdText(y.source)}) |`)
    md.push(``, `Crossref's year is the first publication (online or in print); the YAML may deliberately give the volume's year.`, ``)
  }
  if (titles.length) {
    md.push(`## Titles that differ (${titles.length})`, ``)
    for (const t of titles) md.push(`- ${doiLink(t.doi)}`, `  - publications.yaml: ${mdText(t.yaml)}`, `  - ${mdText(t.source)}: ${mdText(t.found)}`)
    md.push(``)
  }
  if (missing.length) {
    md.push(`## In publications.yaml but not on ORCID or Crossref's ORCID list (${missing.length})`, ``)
    for (const m of missing) md.push(`- ${doiLink(m.doi)} ${mdText(plainTitle(m.title))} (${mdText(m.year)})`)
    md.push(``, `Usually nothing to change here: the work is just not on the ORCID record yet (add it on orcid.org).`, ``)
  }
  return { markdown: md.join("\n"), count }
}

/* -- main ------------------------------------------------------------------- */

export async function run(opts) {
  const pubsFile = path.resolve(ROOT, opts.publications)
  const publications = yaml.load(fs.readFileSync(pubsFile, "utf8"))?.publications ?? []
  const profile = yaml.load(fs.readFileSync(path.join(ROOT, "content", "profile.yaml"), "utf8"))
  const orcid = opts.orcid ?? profile?.orcid
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid ?? "")) throw new Error(`no valid ORCID iD (profile.yaml or --orcid): ${orcid}`)
  const source = makeSource(opts)

  const orcidDoc = await source.orcidWorks(orcid)
  if (!orcidDoc) throw new Unreachable(`ORCID has no record for ${orcid}`)
  const orcidList = orcidEntries(orcidDoc)
  const crDoc = await source.crossrefByOrcid(orcid)
  const crossref = (crDoc?.message?.items ?? []).map(crossrefEntry).filter(Boolean)
  // DOIs ORCID lists that Crossref's ORCID filter did not return (the iD is
  // often missing from the publisher's metadata): fetched one by one.
  const have = new Set(crossref.map((c) => c.doi))
  for (const o of orcidList) {
    if (!o.doi || have.has(o.doi)) continue
    const w = await source.crossrefWork(o.doi)
    const entry = crossrefEntry(w?.message ?? null)
    if (entry) {
      crossref.push(entry)
      have.add(entry.doi)
    }
  }
  const result = compare(publications, orcidList, crossref)
  const date = opts.date ?? new Date().toISOString().slice(0, 10)
  const { markdown, count } = proposal(result, { orcid, date })
  return { result, markdown, count, orcid, date }
}

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`pubs:check: ${err.message}`)
    process.exit(64)
  }
  if (opts.help) {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0])
    return
  }
  try {
    const { result, markdown, count, orcid, date } = await run(opts)
    const out = path.resolve(ROOT, opts.out)
    const json = out.replace(/\.md$/, "") + ".json"
    fs.writeFileSync(out, markdown)
    fs.writeFileSync(json, JSON.stringify({ orcid, date, count, ...result }, null, 2) + "\n")
    if (!opts.quiet) {
      console.log(
        `pubs:check: ${result.fresh.length} new, ${result.years.length} year and ${result.titles.length} title differences, ` +
          `${result.published.length} submitted now published, ${result.missing.length} not on ORCID → ${path.relative(ROOT, out)}`,
      )
    }
  } catch (err) {
    if (err instanceof Unreachable) {
      console.error(`pubs:check: ${err.message}. Nothing written. Run it where pub.orcid.org and api.crossref.org can be reached (the scheduled GitHub Action does), or with --fixtures.`)
      process.exit(2)
    }
    throw err
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
