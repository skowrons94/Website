#!/usr/bin/env node
/**
 * The site search's index: public/search/en.json and public/search/it.json,
 * written before every build from content/ (and the evaluations' info.json),
 * and fetched by the search dialog the first time it is opened
 * (components/search/command-palette.tsx). Nothing here is shipped with the
 * pages themselves.
 *
 *   node scripts/search-index.mjs [--out public/search]
 *
 * Each entry is { t: type, l: label, s: subtitle, h: href, k: keys, x?: 1 }:
 * `href` is site-relative without the base path (the client adds it), `keys`
 * is extra text that should find the entry but is not shown (aliases, the
 * other language's names, a note's headings), and `x` marks an external link.
 * Labels keep their Unicode (¹⁴N(p,γ)¹⁵O); the client folds both sides of a
 * comparison to plain ASCII, so "14N(p,g)", "N14" or "nitrogen-14" all match.
 */

import fs from "node:fs"
import path from "node:path"

import GithubSlugger from "github-slugger"
import matter from "gray-matter"
import yaml from "js-yaml"

import { buildAtlas, ELEMENT_NAMES, parseParticle, readRaw } from "../lib/atlas-core.mjs"
import { localize } from "../lib/localize.mjs"

const ROOT = process.cwd()
const args = process.argv.slice(2)
const outArg = args.indexOf("--out")
const OUT = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(ROOT, "public", "search")
const LANGS = ["en", "it"]

const readYaml = (rel, lang) => localize(yaml.load(fs.readFileSync(path.join(ROOT, "content", rel), "utf8")), lang)
const loc = (lang, href) => (lang === "en" || !href.startsWith("/") ? href : href === "/" ? "/it" : `/it${href}`)
const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim()
/** The first sentence, at most ~140 characters: a subtitle. */
const short = (text, max = 140) => {
  const t = clean(text).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "")
  const first = /^(.{20,}?[.!?])\s/.exec(t)?.[1] ?? t
  return first.length > max ? `${first.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : first
}

/* -- pages ----------------------------------------------------------------- */

// Titles and one-line descriptions, as in the header menu (lib/i18n.ts,
// nav.descriptions): keep the two in step. Repeated here rather than imported
// because i18n.ts is TypeScript, which this script runs without; `k` is what
// else should find each page.
const PAGES = [
  { href: "/", en: ["Home", "Who I am and what I work on"], it: ["Home", "Chi sono e di cosa mi occupo"], k: "start landing index" },
  { href: "/research", en: ["Research", "Underground measurements, R-matrix theory, γ-ray tracking"], it: ["Ricerca", "Misure sotterranee, teoria R-matrix, tracciamento dei raggi γ"], k: "research ricerca luna agata" },
  { href: "/atlas", en: ["Reaction atlas", "The reactions that power stars, on the chart of nuclides"], it: ["Atlante delle reazioni", "Le reazioni che alimentano le stelle, sulla carta dei nuclidi"], k: "atlas atlante map mappa chart carta nuclides nuclidi network rete" },
  { href: "/evaluations", en: ["Evaluations", "Live R-matrix fits you can adjust"], it: ["Valutazioni", "Fit R-matrix dal vivo, da modificare"], k: "evaluations valutazioni azure2 r-matrix fit live" },
  { href: "/publications", en: ["Publications", "Articles and conference proceedings"], it: ["Pubblicazioni", "Articoli e atti di congressi"], k: "publications pubblicazioni papers articoli bibliography" },
  { href: "/cv", en: ["CV", "Employment, education, talks and teaching"], it: ["CV", "Impieghi, formazione, seminari e didattica"], k: "cv curriculum vitae resume" },
  { href: "/software", en: ["Software", "AZURE2, LunaSRIM and other code"], it: ["Software", "AZURE2, LunaSRIM e altro codice"], k: "software code codice azure2 lunasrim srim github" },
  { href: "/notes", en: ["Notes", "R-matrix theory written out, with worked examples"], it: ["Note", "La teoria R-matrix per esteso, con esempi svolti (in inglese)"], k: "notes note theory teoria" },
  { href: "/glossary", en: ["Glossary", "The words the atlas uses, in plain language"], it: ["Glossario", "Le parole dell'atlante, in linguaggio semplice"], k: "glossary glossario terms termini definitions" },
  { href: "/atlas/methods", en: ["Methods and laboratories", "How reactions are measured, and where"], it: ["Metodi e laboratori", "Come si misurano le reazioni, e dove"], k: "methods metodi laboratories laboratori facilities" },
  { href: "/atlas/timeline", en: ["Timeline", "A century of nuclear astrophysics"], it: ["Cronologia", "Un secolo di astrofisica nucleare"], k: "timeline cronologia history storia" },
  { href: "/atlas/s-process", en: ["The s-process", "How stars make half the heavy elements"], it: ["Il processo s", "Come le stelle producono metà degli elementi pesanti"], k: "s-process processo s slow neutron capture cattura neutronica lenta" },
]

/* -- reactions: every way of writing one --------------------------------- */

const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }

/** `14N` → ["14N", "N14", "N-14", "nitrogen-14", "azoto-14"]. */
function nuclideAliases(code) {
  const p = parseParticle(code)
  if (!p || p.lepton || !p.symbol) return [code]
  const out = [`${p.A}${p.symbol}`, `${p.symbol}${p.A}`, `${p.symbol}-${p.A}`]
  for (const lang of LANGS) {
    const name = ELEMENT_NAMES[lang]?.[p.Z]
    if (name && p.Z > 0) out.push(`${name}-${p.A}`, `${name} ${p.A}`, `${name}${p.A}`, name)
  }
  if (p.Z === 1 && p.A === 1) out.push("proton", "protone", "p")
  if (p.Z === 1 && p.A === 2) out.push("deuterium", "deuterio", "deuteron", "d")
  if (p.Z === 1 && p.A === 3) out.push("tritium", "trizio", "triton", "t")
  if (p.Z === 2 && p.A === 4) out.push("alpha", "alfa")
  return out
}

/** `¹⁴N(p,γ)¹⁵O` → its channel, `(p,γ)`, and the ASCII spellings of it. */
function channelAliases(label) {
  const m = /\(([^)]*)\)/.exec(label)
  if (!m) return []
  const inner = m[1]
  const ascii = inner.replace(/γ/g, "g").replace(/α/g, "a").replace(/β/g, "b").replace(/ν/g, "nu")
  const words = inner.replace(/γ/g, "gamma").replace(/α/g, "alpha").replace(/β/g, "beta").replace(/ν/g, "nu")
  return [`(${inner})`, inner, `(${ascii})`, ascii, words, inner.replace(",", " ")]
}

// What kind of step it is, in words a reader might type.
const KIND_WORDS = {
  capture: ["capture", "cattura", "radiative capture"],
  transfer: ["transfer", "trasferimento"],
  fusion: ["fusion", "fusione"],
  weak: ["weak interaction", "interazione debole"],
  decay: ["decay", "decadimento", "beta decay", "decadimento beta", "radioactive", "radioattivo"],
}

function reactionEntries(atlas, other, lang) {
  return atlas.reactions.map((r) => {
    const o = other.reactions.find((x) => x.id === r.id)
    const label = r.label
    const ascii = label.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (s) => [...s].map((c) => Object.keys(SUP).find((k) => SUP[k] === c)).join(""))
    const keys = [
      r.id,
      r.id.replace(/-/g, " "),
      ascii,
      ...nuclideAliases(r.target),
      ...nuclideAliases(r.product),
      ...channelAliases(label),
      r.plain,
      o?.plain,
      ...(r.networks ?? []),
      ...atlas.networks.filter((n) => r.networks?.includes(n.id)).map((n) => n.name),
      ...other.networks.filter((n) => r.networks?.includes(n.id)).map((n) => n.name),
      r.luna ? "LUNA" : "",
      ...(KIND_WORDS[r.kind] ?? []),
    ]
    return {
      t: "reaction",
      l: label,
      s: short(r.summary || r.role || r.plain, 110),
      h: loc(lang, `/atlas/${r.id}`),
      k: clean([...new Set(keys.filter(Boolean))].join(" · ")),
      ...(r.importance === "key" ? { w: 2 } : r.importance === "major" ? { w: 1 } : {}),
    }
  })
}

/* -- evaluations (server/evaluations/<id>/info.json) --------------------- */

function evaluationEntries(lang) {
  const dir = path.join(ROOT, "server", "evaluations")
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const id of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, id, "info.json")
    if (!fs.existsSync(file)) continue
    let info
    try {
      info = JSON.parse(fs.readFileSync(file, "utf8"))
    } catch {
      continue
    }
    const reactions = Array.isArray(info.reactions) ? info.reactions : []
    const nucleus = /^(\d+)([A-Z][a-z]?)$/.exec(id)
    const display = nucleus ? `${[...nucleus[1]].map((c) => SUP[c]).join("")}${nucleus[2]}` : id
    const summary = (lang === "it" && info.summary_it) || info.summary || ""
    const paper = info.paper ?? {}
    out.push({
      t: "evaluation",
      l: `${display}: ${reactions.join(", ")}`,
      s: short(summary || [paper.authors, paper.journal].filter(Boolean).join(", "), 110),
      h: loc(lang, `/evaluations/${id}`),
      k: clean(
        [
          id,
          ...(nucleus ? nuclideAliases(id) : []),
          ...reactions.flatMap((r) => [r, ...channelAliases(r), r.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (s) => [...s].map((c) => Object.keys(SUP).find((k) => SUP[k] === c)).join(""))]),
          paper.title,
          paper.authors,
          paper.journal,
          info.reference,
          "R-matrix AZURE2",
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    })
  }
  return out
}

/* -- notes: title, summary, and each section ----------------------------- */

function noteEntries(lang) {
  const dir = path.join(ROOT, "content", "notes")
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const slug = name.replace(/\.md$/, "")
    const { data, content } = matter(fs.readFileSync(path.join(dir, name), "utf8"))
    const title = clean(data.title ?? slug)
    const href = loc(lang, `/notes/${slug}`)
    // The same ids as the rendered page (lib/content.ts, collectHeadings).
    const slugger = new GithubSlugger()
    const headings = []
    let fence = false
    for (const line of content.split("\n")) {
      if (/^```/.test(line)) fence = !fence
      if (fence) continue
      const m = /^(#{2,3})\s+(.*)$/.exec(line)
      if (!m) continue
      const id = slugger.slug(
        m[2].replace(/\$([^$]*)\$/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim(),
      )
      const text = clean(m[2].replace(/\$[^$]*\$/g, "").replace(/[*_`]/g, ""))
      if (m[1].length === 2 && text) headings.push({ id, text })
    }
    out.push({ t: "note", l: title, s: short(data.summary, 120), h: href, k: clean([data.topic, ...headings.map((h) => h.text)].join(" · ")) })
    for (const h of headings) out.push({ t: "section", l: h.text, s: title, h: `${href}#${h.id}`, k: "" })
  }
  return out
}

/* -- the rest of content/ ------------------------------------------------- */

function build(lang) {
  const other = lang === "en" ? "it" : "en"
  const raw = readRaw()
  const atlas = buildAtlas(raw, { lang })
  const atlasOther = buildAtlas(raw, { lang: other })
  const entries = []

  for (const p of PAGES) {
    const [label, sub] = p[lang]
    entries.push({ t: "page", l: label, s: sub, h: loc(lang, p.href), k: clean(`${p[other][0]} · ${p.k}`) })
  }

  // The processes (CNO cycles, helium burning…): the map opened on them, or
  // their own page.
  for (const f of atlas.families ?? []) {
    // One with a page of its own is already among the pages.
    if (f.page && PAGES.some((p) => p.href === f.page)) continue
    const o = atlasOther.families?.find((x) => x.id === f.id)
    const networks = atlas.networks.filter((n) => n.family === f.id)
    entries.push({
      t: "process",
      l: clean(f.name),
      s: short(f.summary, 110),
      h: loc(lang, f.page || `/atlas#${f.id}`),
      k: clean([f.id, o?.name, ...networks.map((n) => n.name), ...atlasOther.networks.filter((n) => n.family === f.id).map((n) => n.name)].filter(Boolean).join(" · ")),
    })
  }

  entries.push(...reactionEntries(atlas, atlasOther, lang))
  entries.push(...evaluationEntries(lang))

  for (const term of atlas.glossary ?? []) {
    const o = atlasOther.glossary?.find((x) => x.id === term.id)
    entries.push({
      t: "glossary",
      l: clean(term.term),
      s: short(term.text, 120),
      h: loc(lang, `/glossary#${term.id}`),
      k: clean([term.also, o?.term, o?.also, term.id.replace(/-/g, " ")].filter(Boolean).join(" · ")),
    })
  }

  entries.push(...noteEntries(lang))

  for (const m of atlas.methods ?? []) {
    const o = atlasOther.methods?.find((x) => x.id === m.id)
    entries.push({ t: "method", l: clean(m.name), s: short(m.summary, 110), h: loc(lang, `/atlas/methods#${m.id}`), k: clean([o?.name, m.id.replace(/-/g, " ")].join(" · ")) })
  }
  for (const f of atlas.facilities ?? []) {
    entries.push({
      t: "facility",
      l: clean(f.name),
      s: short([f.lab, f.location, f.country].filter(Boolean).join(", "), 110),
      h: loc(lang, `/atlas/methods#${f.id}`),
      k: clean([f.id.replace(/-/g, " "), f.accelerator, f.underground ? "underground sotterraneo" : "", f.luna ? "LUNA" : ""].join(" · ")),
    })
  }

  const research = readYaml("research.yaml", lang).threads ?? []
  const researchOther = readYaml("research.yaml", other).threads ?? []
  for (const thread of research) {
    const o = researchOther.find((x) => x.id === thread.id)
    entries.push({
      t: "research",
      l: clean(thread.title),
      s: short(thread.summary, 120),
      h: loc(lang, `/research#${thread.id}`),
      k: clean([thread.role, thread.venue, o?.title].filter(Boolean).join(" · ")),
    })
  }

  const publications = (readYaml("publications.yaml", lang).publications ?? []).slice().sort((a, b) => b.year - a.year)
  for (const p of publications) {
    const link = p.doi ? `https://doi.org/${p.doi}` : p.arxiv ? `https://arxiv.org/abs/${p.arxiv}` : null
    entries.push({
      t: "publication",
      l: clean(p.title),
      s: clean(`${p.journal || p.status || ""} (${p.year})`),
      h: link ?? loc(lang, "/publications"),
      k: clean([p.authors, p.year, p.doi, (p.tags ?? []).join(" ")].filter(Boolean).join(" · ")),
      ...(link ? { x: 1 } : {}),
    })
  }

  return entries
}

fs.mkdirSync(OUT, { recursive: true })
for (const lang of LANGS) {
  const entries = build(lang)
  const json = JSON.stringify({ v: 1, entries })
  fs.writeFileSync(path.join(OUT, `${lang}.json`), json)
  console.log(`search index: ${entries.length} entries → ${path.relative(ROOT, path.join(OUT, `${lang}.json`))} (${(json.length / 1024).toFixed(0)} kB)`)
}
