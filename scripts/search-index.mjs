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
 * Each entry is { t: type, l: label, s: subtitle, h: href, k: keys,
 * a?: aliases, n?: names, b?: body, w?: weight, x?: 1 }:
 *   h  site-relative, without the base path (the client adds it);
 *   k  hidden text that also finds it: spellings, the other language's names,
 *      a note's headings;
 *   a  what people type for it that the site does not call it ("underground",
 *      "gold", "Hoyle state": SYNONYMS below), and any `aliases:` or
 *      `keywords:` its YAML gives it; worth nearly as much as the label;
 *   n  a reaction's target and product written out ("14N · N14 ·
 *      nitrogen-14 · azoto … | 15O · …", target first), worth as much as the
 *      label, the target more than the product;
 *   b  the distinct words of its own text (a reaction's summary, role and
 *      details; a definition), worth least;
 *   x  an external link.
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

// Words too common to find anything with; left out of an entry's body.
const STOP = new Set(
  (
    "the and for are was were that this with from into its it's has have had not but can than then them they their there which what when where who how why also only more most such these those will would been being each other over under about after before between both very much many some any all one two three per via upon "
    + "il lo la gli le un una uno del della dello dei degli delle nel nella nei nelle nello sul sulla sui sulle con per tra fra che non come anche più meno sono era erano essere stato stata questo questa questi queste quello quella quelli quelle cui dove quando perché solo ogni altro altri altre poi già così molto molti molte due tre"
  ).split(" "),
)

/**
 * The distinct words of `texts`, for the hidden `body` field: what finds an
 * entry by what it says rather than by its name ("Hoyle state", "kilonova").
 * Markdown links and emphasis are dropped; case is kept as first seen, since
 * the client folds both sides anyway.
 */
function bodyWords(...texts) {
  const seen = new Set()
  const out = []
  for (const text of texts.flat(Infinity)) {
    const plain = clean(text).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`$\\{}]/g, " ")
    for (const raw of plain.split(/[\s.,;:!?()"“”«»'’\[\]/=]+|[-‐–—](?![\d])/)) {
      const w = raw.replace(/^[^\p{L}\p{N}⁰¹²³⁴⁵⁶⁷⁸⁹]+|[^\p{L}\p{N}⁰¹²³⁴⁵⁶⁷⁸⁹ᵐ]+$/gu, "")
      if (w.length < 3 && !/\d/.test(w)) continue
      // Bare numbers and ranges find nothing anyone types.
      if (!/[\p{L}]/u.test(w)) continue
      const key = w.toLowerCase()
      if (STOP.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push(w)
    }
  }
  return out.join(" ")
}

/** A YAML value that may be a string, a list, or absent, as a list. */
const list = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(String)

/**
 * Optional `aliases:` / `keywords:` on a content entry (in either language:
 * `aliases_it` too), read straight from the YAML so that the search finds an
 * entry by them whether or not the atlas passes them through.
 */
const extraKeys = (data) =>
  data && typeof data === "object"
    ? Object.keys(data)
        .filter((k) => /^(aliases|keywords)(_[a-z]{2})?$/.test(k))
        .flatMap((k) => list(data[k]))
    : []

/* -- synonyms ----------------------------------------------------------------- */

// What people type when they do not know the site's own word for a thing, by
// the (English, unlocalized) address of the entry it should find. Both
// languages in every line: a reader on the Italian site may type English and
// the other way round.
const UNDERGROUND = "underground · deep underground · why underground · sottoterra · sotto terra · sotterraneo · sotterranea · perché sottoterra · Gran Sasso · LNGS · cosmic rays · raggi cosmici · muons · muoni"
const SUN = "Sun · solar · the Sun · Sole · solare · il Sole · solar neutrinos · neutrini solari · how the Sun shines · come brilla il Sole"
const GOLD = "gold · oro · Au · heavy elements · elementi pesanti"
const CARBON_FUSION = "12C+12C · ¹²C+¹²C · 12C12C · C+C · carbon fusion · carbon–carbon fusion · fusione del carbonio · fusione carbonio-carbonio · carbon burning · combustione del carbonio"
const S_PROCESS = "isomer · isomers · isomeric state · isomero · isomeri · stato isomerico · branch point · branching · punto di diramazione · s-only · solo s · bound-state beta decay · bound-state β decay · decadimento beta in stato legato · stellar half-life · temperature-dependent half-life · tempo di dimezzamento stellare · thermometer · termometro · neutron capture · cattura di neutroni · AGB · slow neutron capture"
const SYNONYMS = {
  "/atlas/methods#direct-underground": UNDERGROUND,
  "/glossary#luna": UNDERGROUND,
  "/research#luna": UNDERGROUND,
  "/atlas/methods#luna-400": UNDERGROUND,
  "/atlas/methods#luna-50": UNDERGROUND,
  "/atlas/methods#bellotti-ibf": UNDERGROUND,
  "/atlas/methods": "laboratories · laboratori · how reactions are measured · come si misurano le reazioni",
  "/atlas#pp": SUN + " · hydrogen burning · combustione dell'idrogeno",
  "/atlas#cno": "Sun · solar · Sole · solare · CNO neutrinos · neutrini CNO · Bethe",
  "/atlas/14N-pg-15O": "CNO neutrinos · neutrini CNO · slowest step · passo più lento",
  "/atlas/7Be-pg-8B": "solar neutrinos · neutrini solari · boron-8 neutrinos · neutrini del boro-8",
  "/atlas/1H-pp-2H": "first step · primo passo",
  "/atlas/s-process": `${GOLD} · ${S_PROCESS} · lead · piombo · from iron to lead · dal ferro al piombo`,
  "/atlas/197Au-ng-198Au": GOLD,
  "/glossary#s-process": "gold · oro · heavy elements · elementi pesanti · slow neutron capture",
  "/glossary#branch-point": "isomer · isomero · bound-state beta decay · decadimento beta in stato legato · stellar half-life · thermometer · termometro",
  "/glossary#half-life": "bound-state beta decay · bound-state β decay · decadimento beta in stato legato · stellar half-life · tempo di dimezzamento stellare · ionised atoms · atomi ionizzati",
  "/glossary#s-only": "s-only · s only · solo s · r-only · solo r · shielded · schermati",
  "/glossary#r-process": "kilonova · kilonovae · neutron star merger · fusione di stelle di neutroni · GW170817 · rapid neutron capture · cattura rapida di neutroni · supernova",
  "/atlas#carbon": `${CARBON_FUSION} · supernova · type Ia supernova · supernova di tipo Ia · superburst`,
  "/atlas/12C-12Ca-20Ne": CARBON_FUSION,
  "/atlas/12C-12Cp-23Na": CARBON_FUSION,
  "/atlas/12C-12Cn-23Mg": CARBON_FUSION,
  "/atlas/12C-ag-16O": "carbon to oxygen ratio · rapporto carbonio ossigeno",
  "/atlas/4He-aa-12C": "Hoyle state · Hoyle · stato di Hoyle · triple alpha · triple-α · tre alfa · 3α · carbon production · produzione del carbonio",
  "/atlas#he": "Hoyle state · stato di Hoyle · triple alpha · tre alfa · red giant · gigante rossa",
  "/glossary#gamow-window": "Gamow peak · picco di Gamow · Gamow energy · energia di Gamow",
  "/glossary#electron-screening": "screening · schermaggio · schermatura elettronica · schermo elettronico · CRYRING",
  "/research#agata": "lifetime · vita media · DSAM · Doppler · gamma-ray tracking · tracciamento",
}
const synonyms = (href) => SYNONYMS[href] ?? ""

/**
 * The nuclides the s-process page discusses (¹⁷⁶Lu, ¹⁵¹Sm, ⁸⁵Kr…), read off
 * the page's own text so that a reader looking for one finds the page.
 */
function sProcessNuclides() {
  const file = path.join(ROOT, "components", "pages", "s-process.tsx")
  if (!fs.existsSync(file)) return []
  const text = fs.readFileSync(file, "utf8")
  const out = new Set()
  for (const m of text.matchAll(/([⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})([A-Z][a-z]?)(ᵐ)?/g)) {
    const digits = [...m[1]].map((c) => Object.keys(SUP).find((k) => SUP[k] === c)).join("")
    // The heavy ones only: ¹⁴N or ⁷Be in passing should not find this page.
    if ((parseParticle(`${digits}${m[2]}`)?.Z ?? 0) < 26) continue
    out.add(`${m[1]}${m[2]}`)
    out.add(`${digits}${m[2]}`)
    out.add(`${m[2]}${digits}`)
  }
  return [...out]
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
  { href: "/evaluations", en: ["Evaluations", "Live R-matrix fits you can adjust"], it: ["Valutazioni", "Modelli R-matrix da esplorare dal vivo"], k: "evaluations valutazioni azure2 r-matrix fit live" },
  { href: "/publications", en: ["Publications", "Articles and conference proceedings"], it: ["Pubblicazioni", "Articoli e atti di congressi"], k: "publications pubblicazioni papers articoli bibliography" },
  { href: "/cv", en: ["CV", "Employment, education, talks and teaching"], it: ["CV", "Impieghi, formazione, seminari e didattica"], k: "cv curriculum vitae resume" },
  { href: "/software", en: ["Software", "AZURE2, LunaSRIM and other code"], it: ["Software", "AZURE2, LunaSRIM e altro codice"], k: "software code codice azure2 lunasrim srim github" },
  { href: "/notes", en: ["Notes", "R-matrix theory written out, with worked examples"], it: ["Note", "La teoria R-matrix per esteso, con esempi svolti (in inglese)"], k: "notes note theory teoria" },
  { href: "/glossary", en: ["Glossary", "The words the atlas uses, in plain language"], it: ["Glossario", "Le parole dell'atlante, in linguaggio semplice"], k: "glossary glossario terms termini definitions" },
  { href: "/atlas/methods", en: ["Methods and laboratories", "How reactions are measured, and where"], it: ["Metodi e laboratori", "Come si misurano le reazioni, e dove"], k: "methods metodi laboratories laboratori facilities" },
  { href: "/atlas/timeline", en: ["Timeline", "A century of nuclear astrophysics"], it: ["Cronologia", "Un secolo di astrofisica nucleare"], k: "timeline cronologia history storia" },
  { href: "/atlas/s-process", en: ["The s-process", "How stars make half the heavy elements"], it: ["Il processo s", "Come le stelle producono metà degli elementi pesanti"], k: "s-process processo s slow neutron capture cattura neutronica lenta lead piombo bismuth bismuto barium bario strontium stronzio heavy elements elementi pesanti from iron to lead dal ferro al piombo" },
  // --- r11 site ---
  { href: "/about", en: ["About this site", "How it was made and checked, its data, and how to cite it"], it: ["Informazioni sul sito", "Come è stato fatto e verificato, i dati e come citarlo"], k: "about informazioni colophon AI artificial intelligence intelligenza artificiale Claude Anthropic verification verifica sources fonti licence licenza cite citare citation citazione DOI Zenodo github open source codice aperto report error segnala errore contribute contribuire" },
  // --- r11 sec ---
  { href: "/privacy", en: ["Privacy", "What is logged and for how long; no cookies or trackers"], it: ["Privacy", "Che cosa viene registrato e per quanto; niente cookie né tracciamento"], k: "privacy GDPR RGPD cookie cookies tracking tracciamento analytics statistiche log registro dati personali personal data IP" },
  // --- rates ---
  { href: "/atlas/rates/s-process", en: ["The s-process, what if", "Neutron sources, poisons and seeds, from iron to bismuth"], it: ["Il processo s, e se…", "Sorgenti di neutroni, veleni e semi, dal ferro al bismuto"], k: "s-process processo s lead piombo bismuth bismuto iron ferro seed seme neutron poison veleno neutronico neutron source sorgente di neutroni 13C(a,n) 22Ne(a,n) 14N(n,p) exposure esposizione what if" },
  // --- r13 final ---
  { href: "/atlas/rates/curiosities", en: ["Rate curiosities", "What a reaction twice as fast would change, in sixteen sentences"], it: ["Curiosità sui tassi", "Che cosa cambierebbe una reazione due volte più veloce, in sedici frasi"], k: "curiosities curiosity curiosità what if e se twice as fast due volte più veloce ×2 neutrinos neutrini" },
  // --- data public ---
  { href: "/data", en: ["Nuclear data explorer", "What has been measured, and what nobody has measured yet"], it: ["Esploratore dei dati nucleari", "Che cosa è stato misurato, e che cosa nessuno ha ancora misurato"], k: "nuclear data dati nucleari EXFOR ENSDF measurements misure measured misurato unmeasured non misurato never measured mai misurato gap vuoto Gamow window finestra di Gamow lowest energy energia più bassa levels livelli nuclear levels livelli nucleari experiments esperimenti IAEA NRDC NNDC element elemento" },
  { href: "/data/path/sun-shines-slowly", w: -6, en: ["Why does the Sun shine slowly?", "A guided path: the slowest reaction in the Sun"], it: ["Perché il Sole brilla lentamente?", "Un percorso guidato: la reazione più lenta del Sole"], k: "guided path percorso guidato proton-proton protone-protone slowest reaction reazione più lenta" },
  { href: "/data/path/sodium-in-salt", w: -6, en: ["Where does the sodium in salt come from?", "A guided path: from neon-22 to sodium-23"], it: ["Da dove viene il sodio del sale?", "Un percorso guidato: dal neon-22 al sodio-23"], k: "guided path percorso guidato sodium sodio salt sale 22Ne(p,g) NeNa globular clusters ammassi globulari" },
  { href: "/data/path/iron-to-lead", w: -6, en: ["From iron to lead", "A guided path: the neutrons of the s-process"], it: ["Dal ferro al piombo", "Un percorso guidato: i neutroni del processo s"], k: "guided path percorso guidato s-process processo s neutron source sorgente di neutroni 13C(a,n)" },
  { href: "/atlas/rates", en: ["Reaction rates", "How fast each reaction runs, and what if it were different"], it: ["Tassi di reazione", "Quanto è veloce ogni reazione, e se fosse diversa"], k: "reaction rates tassi di reazione rate tasso reaclib pynucastro what if sensitivity sensibilità bottleneck collo di bottiglia waiting time tempo di attesa lifetime network rete pp CNO NeNa MgAl" },
  // --- find ---
  { href: "/learn/exercises", en: ["Exercises", "Three problems to solve with the atlas, the rates and an evaluation"], it: ["Esercizi", "Tre problemi da risolvere con l'atlante, i tassi e una valutazione"], k: "exercises esercizi problems problemi homework compiti students studenti teaching didattica solution soluzione Gamow peak picco di Gamow underground sotterraneo LUNA background fondo muons muoni R-matrix level livello 13N 14N" },
  { href: "/news", en: ["News", "What is new on the site, with an Atom feed"], it: ["Novità", "Le novità del sito, con un feed Atom"], k: "news novità changelog what's new updates aggiornamenti feed rss atom" },
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

function reactionEntries(atlas, other, lang, raw) {
  return atlas.reactions.map((r) => {
    const o = other.reactions.find((x) => x.id === r.id)
    const data = raw.reactions?.find((x) => x.data?.id === r.id)?.data
    const label = r.label
    const ascii = label.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (s) => [...s].map((c) => Object.keys(SUP).find((k) => SUP[k] === c)).join(""))
    const keys = [
      r.id,
      r.id.replace(/-/g, " "),
      ascii,
      ...channelAliases(label),
      r.plain,
      o?.plain,
      ...(r.networks ?? []),
      ...atlas.networks.filter((n) => r.networks?.includes(n.id)).map((n) => n.name),
      ...other.networks.filter((n) => r.networks?.includes(n.id)).map((n) => n.name),
      r.luna ? "LUNA" : "",
      ...(KIND_WORDS[r.kind] ?? []),
    ]
    // Target first, then product: "N14" finds ¹⁴N(p,γ)¹⁵O before ¹³C(p,γ)¹⁴N.
    const names = [nuclideAliases(r.target), nuclideAliases(r.product)].map((a) => [...new Set(a)].join(" · "))
    return {
      t: "reaction",
      l: label,
      s: short(r.summary || r.role || r.plain, 110),
      h: loc(lang, `/atlas/${r.id}`),
      k: clean([...new Set(keys.filter(Boolean))].join(" · ")),
      n: names.join(" | "),
      a: clean(extraKeys(data).join(" · ")),
      b: bodyWords(r.summary, r.role, r.details, r.statusPlain, r.statusNote),
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
      // The summary's first sentence; else the paper, whole ("Phys. Rev. C"
      // is not the end of a sentence).
      s: summary ? short(summary, 110) : clean([paper.authors, paper.journal, paper.year].filter(Boolean).join(", ")),
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
    const extra = p.href === "/atlas/s-process" ? sProcessNuclides().join(" · ") : ""
    entries.push({
      t: "page",
      l: label,
      s: sub,
      h: loc(lang, p.href),
      k: clean([p[other][0], p.k, extra].filter(Boolean).join(" · ")),
      // --- data public --- a guided path ranks after the page it is a path through
      ...(p.w ? { w: p.w } : {}),
    })
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
      b: bodyWords(f.summary, networks.map((n) => n.summary)),
    })
  }

  entries.push(...reactionEntries(atlas, atlasOther, lang, raw))
  entries.push(...evaluationEntries(lang))

  for (const term of atlas.glossary ?? []) {
    const o = atlasOther.glossary?.find((x) => x.id === term.id)
    entries.push({
      t: "glossary",
      l: clean(term.term),
      s: short(term.text, 120),
      h: loc(lang, `/glossary#${term.id}`),
      k: clean(
        [term.also, o?.term, o?.also, term.id.replace(/-/g, " ")]
          .filter(Boolean)
          .join(" · "),
      ),
      a: clean(extraKeys(raw.glossary?.terms?.find((x) => x.id === term.id)).join(" · ")),
      b: bodyWords(term.text),
    })
  }

  entries.push(...noteEntries(lang))

  for (const m of atlas.methods ?? []) {
    const o = atlasOther.methods?.find((x) => x.id === m.id)
    entries.push({
      t: "method",
      l: clean(m.name),
      s: short(m.summary, 110),
      h: loc(lang, `/atlas/methods#${m.id}`),
      k: clean([o?.name, m.id.replace(/-/g, " ")].filter(Boolean).join(" · ")),
      b: bodyWords(m.summary, m.details, m.strengths, m.limits),
    })
  }
  for (const f of atlas.facilities ?? []) {
    entries.push({
      t: "facility",
      l: clean(f.name),
      s: short([f.lab, f.location, f.country].filter(Boolean).join(", "), 110),
      h: loc(lang, `/atlas/methods#${f.id}`),
      k: clean([f.id.replace(/-/g, " "), f.accelerator, f.underground ? "underground sotterraneo sottoterra" : "", f.luna ? "LUNA" : ""].join(" · ")),
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
      b: bodyWords(thread.summary, thread.body, thread.highlights ?? []),
    })
  }

  // "What comes next", the research outlook at the end of /research.
  const outlook = readYaml("research.yaml", lang).outlook
  if (outlook?.title) {
    const o = readYaml("research.yaml", other).outlook
    entries.push({
      t: "research",
      l: clean(outlook.title),
      s: short(outlook.line || outlook.intro, 120),
      h: loc(lang, "/research#outlook"),
      k: clean([o?.title, "outlook research statement future plans prospettive programma futuro"].filter(Boolean).join(" · ")),
      b: bodyWords(outlook.intro, (outlook.items ?? []).map((i) => [i.lead, i.text])),
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
  const entries = build(lang).map((e) => {
    // The synonyms, by the entry's English address; with any `aliases:` the
    // content gave it, in `a`.
    const base = e.x ? e.h : e.h === "/it" ? "/" : e.h.replace(/^\/it(?=\/)/, "")
    const a = clean([e.a, synonyms(base)].filter(Boolean).join(" · "))
    const { a: _, ...rest } = e
    return a ? { ...rest, a } : rest
  })
  const json = JSON.stringify({ v: 1, entries })
  fs.writeFileSync(path.join(OUT, `${lang}.json`), json)
  console.log(`search index: ${entries.length} entries → ${path.relative(ROOT, path.join(OUT, `${lang}.json`))} (${(json.length / 1024).toFixed(0)} kB)`)
}
