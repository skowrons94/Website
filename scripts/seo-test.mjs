#!/usr/bin/env node
/**
 * npm run test:seo — after a build, checks every page the build produced
 * (scripts/seo-pages.mjs reads them back from out/ or .next/server/app):
 *
 *   - its <head>: a title, a description, a canonical address that is the
 *     page's own, og:title/description/type/url/locale, a Twitter card, and
 *     hreflang alternates (en, it, x-default) that point at pages that exist;
 *   - its JSON-LD: every block parses, every node has a schema.org type with
 *     the properties search engines require of it (Person, WebSite with its
 *     SearchAction, BreadcrumbList, ScholarlyArticle, SoftwareSourceCode,
 *     Dataset, DataCatalog, Article, ProfilePage, LearningResource), every
 *     `{"@id": …}` reference is defined on some page, and every address is
 *     absolute under SITE_URL + BASE_PATH when SITE_URL is set;
 *   - coverage: the home page has the Person and the WebSite, /publications
 *     one ScholarlyArticle per DOI in publications.yaml, /software one
 *     SoftwareSourceCode per entry of software.yaml, /atlas the atlas Dataset
 *     with its licence, each evaluation a Dataset;
 *   - sitemap.xml lists exactly the indexable pages, with reciprocal
 *     alternates, and robots.txt points at it;
 *   - the news feeds parse and link back to the site; content/news.yaml's
 *     links lead to pages that exist.
 *
 * Run it with the same SITE_URL, BASE_PATH and STATIC_EXPORT as the build:
 *   SITE_URL=https://example.org npm run build && SITE_URL=https://example.org npm run test:seo
 *   STATIC_EXPORT=1 BASE_PATH=/Website SITE_URL=https://u.github.io npm run build && (same env) npm run test:seo
 */

import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"

import { THIRTEEN_N, exercise1, exercise2 } from "../lib/exercises.ts"
import { BASE, ORIGIN, STATIC, builtPages, fileUrl, pageUrl } from "./seo-pages.mjs"

const failures = []
let checks = 0
const fail = (where, what) => failures.push(`${where}: ${what}`)
const ok = (cond, where, what) => {
  checks++
  if (!cond) fail(where, what)
  return cond
}

const built = builtPages()
if (!built) {
  console.error("test:seo: no build output (out/ or .next/server/app); run `npm run build` first")
  process.exit(1)
}
const { pages, dir } = built
const byPath = new Map(pages.map((p) => [p.path, p]))
const byCanonical = new Map(pages.map((p) => [p.canonical, p]))
const prefix = `${ORIGIN}${BASE}`

/* -- addresses ----------------------------------------------------------------- */

function isSiteUrl(u) {
  if (typeof u !== "string") return false
  if (ORIGIN) return u === `${prefix}/` || u.startsWith(`${prefix}/`) || u === prefix
  return u.startsWith(`${BASE}/`) || u === "/" || u === BASE
}

/* -- the head of every page --------------------------------------------------- */

for (const p of pages) {
  const at = p.path
  ok(p.title && p.title.length > 3, at, "no <title>")
  const desc = p.meta("description")
  ok(desc && desc.length >= 40, at, `description missing or short (${desc?.length ?? 0} chars)`)
  ok(desc ? desc.length <= 320 : true, at, `description too long (${desc?.length} chars)`)
  if (p.noindex) continue
  ok(p.canonical === pageUrl(at), at, `canonical ${p.canonical} is not the page's own address ${pageUrl(at)}`)
  ok(p.meta("og:url") === p.canonical, at, `og:url ${p.meta("og:url")} differs from the canonical`)
  for (const k of ["og:title", "og:description", "og:type", "og:locale", "og:site_name", "twitter:card", "twitter:title", "twitter:description"])
    ok(Boolean(p.meta(k)), at, `no ${k}`)
  ok(["website", "article", "profile"].includes(p.meta("og:type")), at, `og:type ${p.meta("og:type")}`)
  ok(p.lang === "en" || p.lang === "it", at, `<html lang> ${p.lang}`)
  ok(p.meta("og:locale") === (p.lang === "it" ? "it_IT" : "en_GB"), at, `og:locale ${p.meta("og:locale")} for lang ${p.lang}`)
  if (p.meta("og:type") === "article") ok(Boolean(p.meta("article:published_time")), at, "article without article:published_time")
  const langs = Object.fromEntries(p.alternates.map((a) => [a.hreflang.toLowerCase(), a.href]))
  for (const l of ["en", "it", "x-default"]) {
    if (ok(Boolean(langs[l]), at, `no hreflang ${l}`)) ok(byCanonical.has(langs[l]), at, `hreflang ${l} → ${langs[l]}, which the build did not produce`)
  }
  ok(langs[p.lang] === p.canonical, at, `the hreflang for its own language (${p.lang}) is not the page itself`)
  for (const k of ["og:image", "twitter:image"]) {
    const img = p.meta(k)
    if (img && ORIGIN) ok(img.startsWith(`${prefix}/`), at, `${k} ${img} is not under ${prefix}`)
  }
}

/* -- JSON-LD ------------------------------------------------------------------------ */

const defined = new Map() // @id → page
const references = [] // [page, id]
const typesOn = new Map() // path → Map(type → nodes)

const REQUIRED = {
  Person: ["name"],
  WebSite: ["url", "name"],
  BreadcrumbList: ["itemListElement"],
  ScholarlyArticle: ["headline", "author", "datePublished", "identifier"],
  Article: ["headline", "author", "datePublished"],
  SoftwareSourceCode: ["name", "description"],
  Dataset: ["name", "description", "license", "creator", "url"],
  DataCatalog: ["name", "dataset"],
  ProfilePage: ["mainEntity"],
  LearningResource: ["name", "description", "author", "url"],
}

const isIdRef = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every((k) => k === "@id" || k === "name") && "@id" in v

function walkRefs(value, page) {
  if (Array.isArray(value)) return value.forEach((v) => walkRefs(v, page))
  if (!value || typeof value !== "object") return
  if (isIdRef(value)) references.push([page, value["@id"]])
  else for (const v of Object.values(value)) walkRefs(v, page)
}

function checkNode(node, page) {
  const at = `${page.path} JSON-LD`
  const type = node["@type"]
  if (!ok(typeof type === "string", at, `node without a single @type: ${JSON.stringify(node).slice(0, 80)}`)) return
  ok(type in REQUIRED, at, `unexpected type ${type}`)
  for (const k of REQUIRED[type] ?? []) {
    const v = node[k]
    ok(v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0), at, `${type} without ${k}`)
  }
  if (node["@id"]) {
    ok(isSiteUrl(node["@id"]) || /^https:\/\/doi\.org\//.test(node["@id"]), at, `${type} @id ${node["@id"]} is neither under the site nor a DOI`)
    if (!defined.has(node["@id"])) defined.set(node["@id"], page.path)
  }
  if (node.url && type !== "ScholarlyArticle") ok(isSiteUrl(node.url), at, `${type} url ${node.url} is not under ${prefix || "the base path"}`)
  if (!typesOn.has(page.path)) typesOn.set(page.path, new Map())
  const t = typesOn.get(page.path)
  t.set(type, [...(t.get(type) ?? []), node])

  switch (type) {
    case "Person":
      ok(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(node.identifier?.value ?? ""), at, "Person without an ORCID identifier")
      ok(Array.isArray(node.sameAs) && node.sameAs.includes(`https://orcid.org/${node.identifier?.value}`), at, "Person.sameAs lacks the ORCID record")
      for (const s of node.sameAs ?? []) ok(/^https:\/\//.test(s) && !/\/authors?\/?$/.test(s), at, `sameAs ${s} is not a real profile address`)
      ok(node.affiliation?.name, at, "Person without an affiliation")
      break
    case "WebSite": {
      const action = node.potentialAction
      ok(action?.["@type"] === "SearchAction", at, "WebSite without a SearchAction")
      const tpl = action?.target?.urlTemplate ?? action?.target
      ok(typeof tpl === "string" && tpl.includes("{search_term_string}") && isSiteUrl(tpl.split("?")[0]), at, `SearchAction target ${tpl}`)
      ok(action?.["query-input"] === "required name=search_term_string", at, "SearchAction query-input")
      break
    }
    case "BreadcrumbList": {
      const items = node.itemListElement ?? []
      ok(items.length >= 2, at, "a breadcrumb trail of fewer than two items")
      items.forEach((it, i) => {
        ok(it["@type"] === "ListItem" && it.position === i + 1 && it.name, at, `breadcrumb item ${i + 1} malformed`)
        ok(isSiteUrl(it.item), at, `breadcrumb item ${i + 1} → ${it.item} not under the site`)
        ok(byCanonical.has(it.item), at, `breadcrumb item ${i + 1} → ${it.item}, which the build did not produce`)
      })
      ok(items.at(-1)?.item === page.canonical, at, `the last breadcrumb (${items.at(-1)?.item}) is not the page itself`)
      break
    }
    case "ScholarlyArticle":
      ok(node.identifier?.propertyID === "DOI" && /^10\.\d{4,9}\/\S+$/.test(node.identifier?.value ?? ""), at, `bad DOI ${node.identifier?.value}`)
      ok(/^\d{4}(-\d{2}(-\d{2})?)?$/.test(node.datePublished ?? ""), at, `datePublished ${node.datePublished}`)
      ok(node.url === `https://doi.org/${node.identifier?.value}`, at, "url is not the DOI resolver")
      break
    case "SoftwareSourceCode":
      if (node.codeRepository) ok(/^https:\/\//.test(node.codeRepository), at, `codeRepository ${node.codeRepository}`)
      if (node.license) ok(/^https:\/\//.test(node.license), at, `license is not a URL: ${node.license}`)
      break
    case "Dataset":
      ok(/^https:\/\//.test(node.license ?? ""), at, `Dataset license is not a URL: ${node.license}`)
      ok(String(node.description ?? "").length >= 50, at, "Dataset description shorter than 50 characters (Google's minimum)")
      if (node.distribution) ok(isSiteUrl(node.distribution.contentUrl), at, `distribution ${node.distribution.contentUrl}`)
      if (node.identifier) ok(/^https:\/\/doi\.org\/10\./.test(node.identifier), at, `identifier ${node.identifier}`)
      break
    case "ProfilePage":
      ok(node.mainEntity?.["@type"] === "Person", at, "ProfilePage whose mainEntity is not a Person")
      if (node.mainEntity) checkNode(node.mainEntity, page)
      break
  }
}

for (const p of pages) {
  for (const raw of p.jsonld) {
    let doc
    try {
      doc = JSON.parse(raw)
    } catch (err) {
      fail(`${p.path} JSON-LD`, `does not parse: ${err.message}`)
      continue
    }
    checks++
    ok(doc["@context"] === "https://schema.org", `${p.path} JSON-LD`, `@context ${doc["@context"]}`)
    const nodes = doc["@graph"] ?? [doc]
    for (const n of nodes) checkNode(n, p)
    walkRefs(nodes, p)
  }
}

for (const [page, id] of references) ok(defined.has(id) || /^https:\/\/doi\.org\//.test(id), `${page.path} JSON-LD`, `reference to ${id}, defined on no page`)

/* -- coverage -------------------------------------------------------------------- */

const types = (p) => typesOn.get(p) ?? new Map()
const home = "/"
ok(types(home).has("Person"), home, "no Person")
ok(types(home).has("WebSite"), home, "no WebSite")
ok(types("/it").has("Person") && types("/it").has("WebSite"), "/it", "no Person or WebSite")

const pubs = yaml.load(fs.readFileSync("content/publications.yaml", "utf8")).publications
const withDoi = pubs.filter((p) => p.doi).length
for (const at of ["/publications", "/it/publications"]) ok((types(at).get("ScholarlyArticle") ?? []).length === withDoi, at, `${(types(at).get("ScholarlyArticle") ?? []).length} ScholarlyArticle for ${withDoi} DOIs`)

const software = yaml.load(fs.readFileSync("content/software.yaml", "utf8")).software
for (const at of ["/software", "/it/software"]) {
  const nodes = types(at).get("SoftwareSourceCode") ?? []
  ok(nodes.length === software.length, at, `${nodes.length} SoftwareSourceCode for ${software.length} programs`)
  for (const s of software) {
    const node = nodes.find((n) => n.name === s.name)
    if (!ok(Boolean(node), at, `no SoftwareSourceCode for ${s.name}`)) continue
    if (s.license) ok(Boolean(node.license), at, `${s.name}: licence ${s.license} not in the markup`)
    const repo = (s.links ?? []).find((l) => /github\.com/.test(l.href))
    if (repo) ok(node.codeRepository === repo.href, at, `${s.name}: codeRepository ${node.codeRepository}, expected ${repo.href}`)
  }
}

const atlasSets = types("/atlas").get("Dataset") ?? []
ok(atlasSets.length === 1 && /creativecommons\.org\/licenses\/by\/4\.0/.test(atlasSets[0]?.license ?? ""), "/atlas", "no atlas Dataset under CC BY 4.0")
ok(atlasSets[0]?.distribution?.contentUrl === fileUrl("/atlas/data.json"), "/atlas", `distribution ${atlasSets[0]?.distribution?.contentUrl}`)

const evalPages = pages.filter((p) => /^\/(it\/)?evaluations\/[^/]+$/.test(p.path))
ok(evalPages.length > 0, "/evaluations", "no evaluation pages built")
for (const p of evalPages) ok((types(p.path).get("Dataset") ?? []).length === 1, p.path, "no Dataset")

for (const at of ["/learn/exercises", "/it/learn/exercises", "/news", "/it/news"]) ok(byPath.has(at), at, "page not built")

/* -- sitemap and robots ----------------------------------------------------------- */

const outDir = STATIC ? path.join(process.cwd(), "out") : path.join(process.cwd(), "public")
const sitemapFile = path.join(outDir, "sitemap.xml")
if (ok(fs.existsSync(sitemapFile), "sitemap.xml", `missing (${path.relative(process.cwd(), sitemapFile)})`)) {
  const xml = fs.readFileSync(sitemapFile, "utf8")
  ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(xml), "sitemap.xml", "not a sitemap")
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1])
  const locs = blocks.map((b) => /<loc>([^<]+)<\/loc>/.exec(b)?.[1].replace(/&amp;/g, "&"))
  const expected = pages.filter((p) => !p.noindex).map((p) => p.canonical)
  ok(locs.length === new Set(locs).size, "sitemap.xml", "duplicate <loc>")
  for (const e of expected) ok(locs.includes(e), "sitemap.xml", `missing ${e}`)
  for (const l of locs) ok(expected.includes(l), "sitemap.xml", `lists ${l}, which is not an indexable page of the build`)
  if (ORIGIN) for (const l of locs) ok(l.startsWith(`${prefix}/`) || l === prefix, "sitemap.xml", `${l} not absolute under ${prefix}`)
  ok(locs.length <= 50000 && Buffer.byteLength(xml) < 50 * 1024 * 1024, "sitemap.xml", "over the protocol's limits")
  // alternates: reciprocal, and each page lists itself
  const altOf = new Map(blocks.map((b, i) => [locs[i], [...b.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]])]))
  for (const [loc, alts] of altOf) {
    if (alts.length === 0) continue
    ok(alts.some(([, h]) => h === loc), "sitemap.xml", `${loc} does not list itself among its alternates`)
    for (const [, h] of alts) ok((altOf.get(h) ?? []).some(([, x]) => x === loc), "sitemap.xml", `${h} does not list ${loc} back`)
  }
  for (const req of ["/atlas/14N-pg-15O", "/it/atlas/14N-pg-15O", "/evaluations/13N", "/atlas/rates/curiosities", "/learn/exercises", "/news"])
    ok(locs.includes(pageUrl(req)), "sitemap.xml", `does not list ${req}`)
  const curiosity = pages.find((p) => /^\/atlas\/rates\/curiosities\/[^/]+$/.test(p.path))
  ok(Boolean(curiosity) && locs.includes(curiosity.canonical), "sitemap.xml", "no curiosity page")
}
const robotsFile = path.join(outDir, "robots.txt")
if (ok(fs.existsSync(robotsFile), "robots.txt", "missing")) {
  const robots = fs.readFileSync(robotsFile, "utf8")
  ok(robots.includes(`Sitemap: ${fileUrl("/sitemap.xml")}`), "robots.txt", "no Sitemap line for this build")
  ok(/User-agent: \*/.test(robots) && !/Disallow: \/\s*$/m.test(robots), "robots.txt", "blocks the whole site")
}

/* -- the news ------------------------------------------------------------------------ */

const news = yaml.load(fs.readFileSync("content/news.yaml", "utf8"))?.news ?? []
news.forEach((item, i) => {
  const at = `content/news.yaml item ${i + 1}`
  const date = item.date instanceof Date ? item.date.toISOString().slice(0, 10) : String(item.date)
  ok(/^\d{4}-\d{2}-\d{2}$/.test(date), at, `date ${date}`)
  ok(typeof item.text === "string" && item.text.trim().length > 10, at, "no text")
  ok(typeof item.text_it === "string" && item.text_it.trim().length > 10, at, "no text_it (the Italian page would show English)")
  if (typeof item.link === "string" && item.link.startsWith("/")) {
    const target = item.link.split("#")[0]
    ok(byPath.has(target) && byPath.has(target === "/" ? "/it" : target.startsWith("/it") ? target : `/it${target}`), at, `link ${item.link} is not a page of the build`)
  }
})
const homeHtml = byPath.get("/")
ok(Boolean(homeHtml?.links.find((l) => l.rel === "alternate" && l.type === "application/atom+xml")), "/", "no feed <link>")
for (const lang of ["en", "it"]) {
  const rel = lang === "en" ? "news/feed.xml" : "it/news/feed.xml"
  const file = STATIC ? path.join(dir, rel) : path.join(dir, `${rel}.body`)
  if (!ok(fs.existsSync(file), `feed ${lang}`, `missing (${path.relative(process.cwd(), file)})`)) continue
  const feed = fs.readFileSync(file, "utf8")
  ok(feed.startsWith('<?xml version="1.0" encoding="utf-8"?>') && feed.includes('<feed xmlns="http://www.w3.org/2005/Atom"'), `feed ${lang}`, "not Atom")
  const entries = (feed.match(/<entry>/g) ?? []).length
  ok(entries === news.length, `feed ${lang}`, `${entries} entries for ${news.length} items`)
  for (const tag of ["title", "id", "updated"]) ok(new RegExp(`<${tag}>[^<]+</${tag}>`).test(feed), `feed ${lang}`, `no feed <${tag}>`)
  ok(feed.includes(`href="${fileUrl(lang === "en" ? "/news/feed.xml" : "/it/news/feed.xml")}"`), `feed ${lang}`, "no rel=self link")
  if (ORIGIN) for (const m of feed.matchAll(/<link rel="alternate" type="text\/html" href="([^"]+)"/g)) ok(m[1].startsWith(prefix), `feed ${lang}`, `link ${m[1]} not under ${prefix}`)
  // well-formed enough: every opened element is closed
  const open = (feed.match(/<(entry|title|summary|id|updated|published)[\s>]/g) ?? []).length
  const close = (feed.match(/<\/(entry|title|summary|id|updated|published)>/g) ?? []).length
  ok(open === close, `feed ${lang}`, "unbalanced elements")
}

/* -- the exercises' numbers (lib/exercises.ts) ------------------------------------- */

{
  const at = "/learn/exercises"
  const x1 = exercise1()
  const x2 = exercise2()
  const near = (a, b, tol) => Math.abs(a - b) <= tol
  // The same window the atlas shows for ¹⁴N(p,γ)¹⁵O at the centre of the Sun.
  const atlas = JSON.parse(fs.readFileSync("public/atlas/data.json", "utf8"))
  const sun = atlas.reactions.find((r) => r.id === "14N-pg-15O")?.gamow?.find((g) => g.T9 === 0.0157)
  ok(sun && near(sun.E0, x1.atlasE0, 1e-9) && near(sun.width, x1.atlasWidth, 1e-9), at, "the atlas' Gamow window for ¹⁴N(p,γ) at T₉ = 0.0157 differs from the exercise's")
  ok(near(x1.E0, x1.scaledE0, 0.02) && near(x1.width, x1.scaledWidth, 0.02), at, "E₀ and Δ at 15 MK disagree with the atlas' window scaled by T^(2/3), T^(5/6)")
  ok(near(x1.E0, 26.6, 0.05) && near(x1.width, 13.5, 0.05) && near(x1.EG / 1000, 45.1, 0.05), at, `E₀ ${x1.E0}, Δ ${x1.width}, E_G ${x1.EG}`)
  ok(near(x2.sigma_b * 1e12, 0.23, 0.005), at, `σ(70 keV) ${x2.sigma_b} b`)
  // Exercise 3 quotes the shipped 13N model: its 1/2⁺ level and the proton threshold.
  const azr = fs.readFileSync("server/evaluations/13N/13N.azr", "utf8")
  const row = azr.split("\n").map((l) => l.trim().split(/\s+/)).find((f) => f[0] === "0.5" && f[1] === "1" && Math.abs(Number(f[2]) - THIRTEEN_N.level.Ex_MeV) < 1e-6 && f[5] === "1")
  ok(Boolean(row) && Number(row[11]) === THIRTEEN_N.level.gammaP_keV * 1000, at, "13N.azr no longer has the 1/2⁺ level at 2.3682 MeV with Γp = 34 keV: rerun scripts/exercises/thirteen-n.py and update THIRTEEN_N")
  if (row) ok(near((Number(row[2]) - Number(row[21])) * 1000, THIRTEEN_N.level.ER_keV, 0.5), at, `E_R = E_x − S_p is ${(Number(row[2]) - Number(row[21])) * 1000} keV, not ${THIRTEEN_N.level.ER_keV}`)
  // The page prints them.
  const html = (p) => (byPath.get(p) ? fs.readFileSync(byPath.get(p).file, "utf8") : "")
  const printed = (h, value) => new RegExp(`${value.replace(".", "\\.")}(\\s|&nbsp;|\u00a0|\u202f)keV`).test(h)
  ok(printed(html(at), x1.E0.toFixed(1)), at, `does not print E₀ = ${x1.E0.toFixed(1)} keV`)
  ok(printed(html(`/it${at}`), x1.E0.toFixed(1).replace(".", ",")), `/it${at}`, "does not print E₀ with a decimal comma")
}

/* -- result ------------------------------------------------------------------------- */

const indexable = pages.filter((p) => !p.noindex).length
if (failures.length) {
  for (const f of failures.slice(0, 80)) console.log(`FAIL  ${f}`)
  if (failures.length > 80) console.log(`… and ${failures.length - 80} more`)
  console.log(`\ntest:seo: ${failures.length} of ${checks} checks failed (${pages.length} pages, ${STATIC ? "static export" : "server build"}${ORIGIN ? `, ${prefix}` : ", no SITE_URL"})`)
  process.exit(1)
}
console.log(`test:seo: ${checks} checks passed on ${pages.length} pages (${indexable} indexable; ${STATIC ? "static export" : "server build"}${ORIGIN ? `, ${prefix}` : ", no SITE_URL"})`)
