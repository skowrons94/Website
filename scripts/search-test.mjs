#!/usr/bin/env node
/**
 * The site search, tested on what people actually type: for each query, the
 * entries that must come first (or among the first few), and the ones that
 * must not appear at all. Runs lib/search.ts on the built index
 * (public/search/<lang>.json, written by scripts/search-index.mjs).
 *
 *   node scripts/search-index.mjs && node scripts/search-test.mjs
 *
 * Exit status 1 if any expectation fails.
 */

import fs from "node:fs"
import path from "node:path"

import ts from "typescript"

const ROOT = process.cwd()

// lib/search.ts is TypeScript with no imports: transpile it and load it as a module.
const source = fs.readFileSync(path.join(ROOT, "lib", "search.ts"), "utf8")
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { prepare, search, matchRanges } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)

const indexes = Object.fromEntries(
  ["en", "it"].map((lang) => [lang, prepare(JSON.parse(fs.readFileSync(path.join(ROOT, "public", "search", `${lang}.json`), "utf8")).entries)]),
)

/*
 * Each case: `first` — the first result's href; `top` — hrefs that must all
 * be within the first `n` results (default 3); `firstGroup` — the type of the
 * group shown first; `none` — patterns no result's href may match.
 * Hrefs are without the /it prefix; the Italian cases add it.
 */
const CASES = [
  // Plain-language questions
  { lang: "en", q: "underground", top: ["/atlas/methods#direct-underground", "/glossary#luna"], n: 5 },
  { lang: "en", q: "why underground", top: ["/atlas/methods#direct-underground", "/glossary#luna"], n: 5 },
  { lang: "it", q: "sottoterra", top: ["/atlas/methods#direct-underground", "/glossary#luna"], n: 4 },
  { lang: "it", q: "perché sottoterra", top: ["/atlas/methods#direct-underground", "/glossary#luna"], n: 4 },
  { lang: "en", q: "gold", top: ["/atlas/s-process", "/atlas/197Au-ng-198Au"], n: 2 },
  { lang: "it", q: "oro", top: ["/atlas/s-process", "/atlas/197Au-ng-198Au"], n: 2, none: [/19F|18O-pg-19F|fluor/i] },
  { lang: "en", q: "sun", first: "/atlas#pp", none: [/^https?:/] , nOnly: 3 },
  { lang: "it", q: "Sole", first: "/atlas#pp", none: [/s-only/] },
  { lang: "en", q: "supernova", top: ["/atlas#carbon"], n: 3 },
  // --- rates ---
  { lang: "en", q: "reaction rates", first: "/atlas/rates" },
  { lang: "it", q: "tassi di reazione", first: "/atlas/rates" },
  { lang: "en", q: "pynucastro", top: ["/atlas/rates"], n: 2 },
  // Physics
  { lang: "en", q: "Hoyle state", first: "/atlas/4He-aa-12C" },
  { lang: "it", q: "stato di Hoyle", first: "/atlas/4He-aa-12C" },
  { lang: "en", q: "kilonova", first: "/glossary#r-process" },
  { lang: "en", q: "r-process", first: "/glossary#r-process" },
  { lang: "en", q: "isomer", top: ["/atlas/s-process"], n: 3 },
  { lang: "it", q: "isomero", top: ["/atlas/s-process"], n: 3 },
  { lang: "en", q: "bound-state beta decay", top: ["/glossary#half-life"], n: 3 },
  { lang: "en", q: "12C+12C", top: ["/atlas/12C-12Ca-20Ne", "/atlas/12C-12Cp-23Na", "/atlas/12C-12Cn-23Mg"], n: 4 },
  { lang: "en", q: "C+C", top: ["/atlas/12C-12Ca-20Ne", "/atlas#carbon"], n: 4 },
  { lang: "en", q: "carbon fusion", top: ["/atlas#carbon", "/atlas/12C-12Ca-20Ne"], n: 4 },
  { lang: "it", q: "fusione del carbonio", top: ["/atlas#carbon", "/atlas/12C-12Ca-20Ne"], n: 5 },
  { lang: "en", q: "s-only", first: "/glossary#s-only" },
  { lang: "en", q: "¹⁷⁶Lu", first: "/atlas/s-process" },
  { lang: "en", q: "176Lu", first: "/atlas/s-process" },
  { lang: "en", q: "151Sm", top: ["/atlas/151Sm-ng-152Sm", "/atlas/s-process"], n: 2 },
  // Reactions: the target before the product, names as good as the label
  { lang: "en", q: "N14", first: "/atlas/14N-pg-15O", firstGroup: "reaction" },
  { lang: "en", q: "14N(p,g)", first: "/atlas/14N-pg-15O" },
  { lang: "en", q: "nitrogen-14", first: "/atlas/14N-pg-15O", firstGroup: "reaction" },
  { lang: "it", q: "azoto", first: "/atlas/14N-pg-15O", firstGroup: "reaction" },
  { lang: "en", q: "carbon-12", firstGroup: "reaction", top: ["/atlas/12C-ag-16O"], n: 3 },
  { lang: "en", q: "carbon", firstGroup: "reaction" },
  { lang: "it", q: "carbonio", firstGroup: "reaction" },
  { lang: "en", q: "12C(a,g)", first: "/atlas/12C-ag-16O" },
  // Site words
  { lang: "en", q: "LUNA", top: ["/glossary#luna", "/research#luna"], n: 5 },
  { lang: "en", q: "Gamow", first: "/glossary#gamow-window" },
  { lang: "en", q: "CNO", first: "/atlas#cno" },
  { lang: "it", q: "ricerca", first: "/research" },
]

let failed = 0
const rows = []
for (const c of CASES) {
  const prefix = (h) => (c.lang === "it" && h.startsWith("/") ? (h === "/" ? "/it" : `/it${h}`) : h)
  const groups = search(indexes[c.lang], c.q)
  const flat = groups.flatMap((g) => g.entries)
  const hrefs = flat.map((e) => e.h)
  const problems = []
  if (c.first && hrefs[0] !== prefix(c.first)) problems.push(`first is ${hrefs[0] ?? "nothing"}, expected ${prefix(c.first)}`)
  if (c.top) {
    const n = c.n ?? 3
    for (const h of c.top) if (!hrefs.slice(0, n).includes(prefix(h))) problems.push(`${prefix(h)} not in the first ${n}`)
  }
  if (c.firstGroup && groups[0]?.type !== c.firstGroup) problems.push(`first group is ${groups[0]?.type}, expected ${c.firstGroup}`)
  for (const re of c.none ?? []) {
    const bad = hrefs.filter((h) => re.test(h))
    if (bad.length) problems.push(`unexpected ${bad.join(", ")}`)
  }
  if (!flat.length) problems.push("no results")
  if (problems.length) failed++
  rows.push({ ok: problems.length === 0, lang: c.lang, q: c.q, got: flat.slice(0, 3).map((e) => `${e.l} [${e.t}]`).join(" · "), problems })
}

// Highlighting lands on the label as shown.
const label = "¹⁴N(p,γ)¹⁵O"
const r = matchRanges(label, "14N(p,g)")
const hl = r.map(([a, b]) => label.slice(a, b)).join("|")
const hlOk = hl === "¹⁴N(p,γ)"
if (!hlOk) failed++
const r2 = matchRanges("Fluorine", "oro")
if (r2.length) failed++

for (const row of rows) {
  console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.lang}  ${row.q.padEnd(24)} → ${row.got}`)
  for (const p of row.problems) console.log(`        ${p}`)
}
console.log(`${hlOk ? "PASS" : "FAIL"}  highlight "${label}" for "14N(p,g)" → "${hl}"`)
console.log(`${r2.length ? "FAIL" : "PASS"}  highlight: "oro" marks nothing in "Fluorine"`)
console.log(`\n${CASES.length + 2 - failed}/${CASES.length + 2} passed`)
process.exit(failed ? 1 : 0)
