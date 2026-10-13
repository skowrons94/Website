#!/usr/bin/env node
/**
 * Validate content/atlas before a build: `npm run check:atlas`.
 *
 * Errors are things the site cannot show correctly — a field of the wrong kind,
 * an id that points nowhere, a file whose name is not its id, a reference that
 * was never checked. They print and exit 1, which stops `npm run build`.
 *
 * Warnings are things that are merely unfinished — a reaction listed in a
 * network with no file yet, a facility with only a name. They print and the
 * build goes on.
 *
 *   node scripts/atlas-check.mjs [--quiet] [--dir path/to/atlas]
 */

import fs from "node:fs"
import path from "node:path"

import {
  ATLAS_DIR,
  ENUMS,
  balanced,
  buildAtlas,
  initialParticles,
  mergeReferences,
  parseParticle,
  parseParticles,
  readRaw,
} from "../lib/atlas-core.mjs"
import { TRANSLATIONS, isTranslationKey } from "../lib/localize.mjs"

const args = process.argv.slice(2)
const quiet = args.includes("--quiet")
const dirArg = args.indexOf("--dir")
const dir = dirArg >= 0 ? path.resolve(args[dirArg + 1]) : ATLAS_DIR

const tty = process.stdout.isTTY
const paint = (code) => (text) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text)
const red = paint("31")
const yellow = paint("33")
const green = paint("32")
const dim = paint("2")
const bold = paint("1")

const errors = []
const warnings = []
const error = (file, message) => errors.push({ file, message })
const warn = (file, message) => warnings.push({ file, message })

/* -- helpers --------------------------------------------------------------- */

const isList = (v) => Array.isArray(v)
const isText = (v) => typeof v === "string" && v.trim() !== ""
const isYear = (v) => Number.isInteger(v) && v > 1800 && v < 2100

function requireFields(file, entry, fields, where = "") {
  for (const field of fields) {
    const value = entry?.[field]
    const missing =
      value === undefined || value === null || (typeof value === "string" && value.trim() === "" && field !== "projectile")
    if (missing) error(file, `${where}missing required field \`${field}\``)
  }
}

function checkEnum(file, value, name, where = "") {
  if (value === undefined || value === null) return
  if (!ENUMS[name].includes(value)) {
    error(file, `${where}\`${name}: ${value}\` is not one of ${ENUMS[name].join(" | ")}`)
  }
}

function checkList(file, entry, field, where = "") {
  const value = entry?.[field]
  if (value !== undefined && value !== null && !isList(value)) {
    error(file, `${where}\`${field}\` must be a list`)
    return []
  }
  return value ?? []
}

/*
 * Translations: `summary_it` beside `summary`, and so on (lib/localize.mjs).
 * They are optional. A translation of the wrong kind (text for a list), or one
 * whose English field does not exist, is an error; a reader-facing field with
 * no translation is only counted, and reported as one warning per file.
 */
const untranslated = new Map() // file -> ["id: field", ...]
/**
 * `keywords:` (optional): other names a reader may search for, a list of
 * short text entries; `keywords_it:` the Italian list (checked as a
 * translation). Indexed by the site search.
 */
function checkKeywords(file, entry, where = "") {
  if (!entry || typeof entry !== "object" || entry.keywords === undefined) return
  if (!isList(entry.keywords) || !entry.keywords.every(isText)) {
    error(file, `${where}\`keywords\` must be a list of text`)
  } else if (entry.keywords.some((k) => String(k).length > 60)) {
    warn(file, `${where}a keyword longer than 60 characters`)
  }
}

function checkTranslations(file, entry, fields, where = "") {
  if (!entry || typeof entry !== "object" || isList(entry)) return
  for (const key of Object.keys(entry)) {
    if (!isTranslationKey(key)) continue
    const base = key.replace(/_[a-z]{2}$/, "")
    const english = entry[base]
    const translated = entry[key]
    if (english === undefined || english === null) {
      warn(file, `${where}\`${key}\` translates \`${base}\`, which is not there`)
    } else if (isList(english) !== isList(translated) || (!isList(translated) && !isText(translated))) {
      error(file, `${where}\`${key}\` must be ${isList(english) ? "a list" : "text"}, like \`${base}\``)
    } else if (isList(translated) && !translated.every(isText)) {
      error(file, `${where}\`${key}\`: every entry must be text`)
    }
  }
  for (const lang of TRANSLATIONS) {
    for (const field of fields) {
      const english = entry[field]
      const present = isList(english) ? english.length > 0 : isText(english)
      if (present && (entry[`${field}_${lang}`] === undefined || entry[`${field}_${lang}`] === null)) {
        if (!untranslated.has(file)) untranslated.set(file, [])
        untranslated.get(file).push(`${where.replace(/: $/, "") || "(top)"} ${field}_${lang}`)
      }
    }
  }
}

/* -- read ------------------------------------------------------------------ */

const raw = readRaw(dir)
for (const e of raw.errors) error(e.file, e.message)

/* -- networks.yaml --------------------------------------------------------- */

const familyIds = new Set()
const networkIds = new Set()
const listedReactions = new Set()
{
  const file = "networks.yaml"
  const families = checkList(file, raw.networks, "families")
  const networks = checkList(file, raw.networks, "networks")
  if (families.length === 0) error(file, "no `families`")
  if (networks.length === 0) error(file, "no `networks`")
  families.forEach((f, i) => {
    const where = `families[${i}]: `
    requireFields(file, f, ["id", "name", "summary"], where)
    checkTranslations(file, f, ["name", "summary"], where)
    if (familyIds.has(f?.id)) error(file, `${where}duplicate family id \`${f.id}\``)
    familyIds.add(f?.id)
    if (f?.map !== undefined && typeof f.map !== "boolean") error(file, `${where}\`map\` must be true or false`)
    if (f?.page !== undefined && !/^\/[a-z0-9/-]*$/.test(String(f.page))) error(file, `${where}\`page\` must be a site path such as /atlas/s-process`)
  })
  families.forEach((f, i) => {
    for (const id of checkList(file, f, "see", `families[${i}]: `)) {
      const target = families.find((x) => x?.id === id)
      if (!target) error(file, `families[${i}]: \`see\` names unknown family \`${id}\``)
      else if (!target.page) warn(file, `families[${i}]: \`see\` names \`${id}\`, which has no \`page\` to link to`)
    }
  })
  networks.forEach((n, i) => {
    const where = `networks[${i}] (${n?.id ?? "?"}): `
    requireFields(file, n, ["id", "family", "name", "summary", "reactions"], where)
    checkTranslations(file, n, ["name", "summary"], where)
    if (networkIds.has(n?.id)) error(file, `${where}duplicate network id`)
    networkIds.add(n?.id)
    if (n?.family && !familyIds.has(n.family)) error(file, `${where}unknown family \`${n.family}\``)
    for (const [j, t] of checkList(file, n, "temperatures", where).entries()) {
      if (!(typeof t?.T9 === "number" && t.T9 > 0)) error(file, `${where}temperatures[${j}].T9 must be a positive number (GK)`)
      if (!isText(t?.label)) warn(file, `${where}temperatures[${j}] has no label`)
      checkTranslations(file, t, ["label"], `${where}temperatures[${j}]: `)
      if (t?.reactions !== undefined) {
        if (!Array.isArray(t.reactions)) error(file, `${where}temperatures[${j}].reactions must be a list of reaction ids`)
        else for (const id of t.reactions) if (!(Array.isArray(n.reactions) && n.reactions.includes(id))) error(file, `${where}temperatures[${j}].reactions: \`${id}\` is not in this network`)
      }
    }
    for (const id of checkList(file, n, "reactions", where)) listedReactions.add(String(id))
  })
}

/* -- references ------------------------------------------------------------ */

const { references, conflicts } = mergeReferences(raw.references)
for (const c of conflicts) {
  error(c.files[1], `reference \`${c.key}\` is also in ${c.files[0]} with a different DOI (${c.dois[0]} vs ${c.dois[1]})`)
}
for (const { file, data } of raw.references) {
  if (data === null || typeof data !== "object" || isList(data)) {
    error(file, "must be a map from reference key to entry")
    continue
  }
  for (const [key, ref] of Object.entries(data)) {
    const where = `${key}: `
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(key)) error(file, `${where}key should be letters, digits, - or _`)
    if (!ref || typeof ref !== "object") {
      error(file, `${where}must be a map`)
      continue
    }
    requireFields(file, ref, ["authors", "title", "year", "checked"], where)
    if (ref.year !== undefined && !isYear(ref.year)) error(file, `${where}\`year\` must be a four-digit integer`)
    if (ref.luna !== undefined && typeof ref.luna !== "boolean") error(file, `${where}\`luna\` must be true or false`)
    if (!ref.journal && !ref.doi && !ref.arxiv && !ref.url) warn(file, `${where}no journal, DOI, arXiv id or url to find it by`)
    if (ref.doi && !/^10\.\d{4,9}\//.test(String(ref.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""))) {
      error(file, `${where}\`doi\` does not look like a DOI (${ref.doi})`)
    }
  }
}

const refExists = (key) => Object.prototype.hasOwnProperty.call(references, key)
function checkRefs(file, keys, where) {
  for (const key of keys) if (!refExists(String(key))) error(file, `${where}unknown reference \`${key}\``)
}

/* -- facilities and methods ------------------------------------------------ */

const facilityIds = new Set()
{
  const file = "facilities.yaml"
  const list = checkList(file, raw.facilities, "facilities")
  let stubs = 0
  list.forEach((f, i) => {
    const where = `facilities[${i}] (${f?.id ?? "?"}): `
    requireFields(file, f, ["id", "name"], where)
    if (facilityIds.has(f?.id)) error(file, `${where}duplicate id`)
    facilityIds.add(f?.id)
    for (const flag of ["underground", "luna"]) {
      if (f?.[flag] !== undefined && typeof f[flag] !== "boolean") error(file, `${where}\`${flag}\` must be true or false`)
    }
    if (f?.group !== undefined && !["underground", "surface", "other"].includes(f.group)) {
      error(file, `${where}\`group\` must be underground | surface | other`)
    }
    if (!isText(f?.summary)) stubs++
    checkTranslations(file, f, ["summary"], where)
  })
  if (stubs) warn(file, `${stubs} of ${list.length} facilities have no summary yet`)
}

const methodIds = new Set()
{
  const file = "methods.yaml"
  const list = checkList(file, raw.methods, "methods")
  let stubs = 0
  list.forEach((m, i) => {
    const where = `methods[${i}] (${m?.id ?? "?"}): `
    requireFields(file, m, ["id", "name"], where)
    if (methodIds.has(m?.id)) error(file, `${where}duplicate id`)
    methodIds.add(m?.id)
    for (const field of ["strengths", "limits"]) {
      const v = m?.[field]
      if (v !== undefined && !isText(v) && !(isList(v) && v.every(isText))) {
        error(file, `${where}\`${field}\` must be text or a list of text`)
      }
    }
    if (!isText(m?.summary)) stubs++
    checkTranslations(file, m, ["name", "summary", "strengths", "limits"], where)
  })
  if (stubs) warn(file, `${stubs} of ${list.length} methods have no summary yet`)
}

/* -- reactions ------------------------------------------------------------- */

const reactionFiles = new Map()
for (const { file, name, data } of raw.reactions) {
  if (!data) continue
  if (typeof data !== "object" || isList(data)) {
    error(file, "must be a map of fields")
    continue
  }
  if (data.id !== name) error(file, `file name must equal the id (\`${data.id}\`)`)
  if (reactionFiles.has(data.id)) error(file, `duplicate reaction id \`${data.id}\``)
  reactionFiles.set(data.id, { file, data })
}
const knownReaction = (id) => listedReactions.has(id) || reactionFiles.has(id)

for (const [id, { file, data: r }] of reactionFiles) {
  const decay = r.kind === "decay"
  requireFields(
    file,
    r,
    decay
      ? ["id", "label", "kind", "target", "product", "ejectile", "networks", "summary"]
      : ["id", "label", "kind", "target", "projectile", "ejectile", "product", "networks", "importance", "summary", "role", "status"],
  )
  checkEnum(file, r.kind, "kind")
  checkEnum(file, r.importance, "importance")
  // The general-reader fields are expected in Italian; the specialist ones
  // (details, measurement notes, open questions) may stay English.
  checkTranslations(file, r, ["summary", "role", "status_note", "status_plain", "keywords"])
  checkKeywords(file, r)
  checkEnum(file, r.status, "status")

  for (const field of ["target", "product"]) {
    if (r[field] !== undefined && !parseParticle(r[field])) error(file, `\`${field}: ${r[field]}\` is not a nuclide (write e.g. 14N, 1H, 4He, n)`)
  }
  for (const field of ["projectile", "ejectile"]) {
    const { unknown } = parseParticles(r[field])
    if (unknown.length) error(file, `\`${field}\`: unknown particle(s) ${unknown.join(", ")}`)
  }
  if (r.target && r.product) {
    const initial = [...parseParticles(r.target).particles, ...parseParticles(r.projectile).particles]
    const final = [...parseParticles(r.product).particles, ...parseParticles(r.ejectile).particles]
    if (!balanced(initial, final)) {
      if (balanced(initialParticles(r), final)) {
        warn(file, `projectile \`${r.projectile}\` must appear more than once to balance; write e.g. \`2 ${r.projectile}\``)
      } else {
        warn(file, "mass number or charge does not balance; no Q-value will be shown")
      }
    }
  }

  const networks = checkList(file, r, "networks")
  for (const n of networks) if (!networkIds.has(n)) error(file, `unknown network \`${n}\``)
  if (!listedReactions.has(id)) {
    warn(file, "not listed in any network in networks.yaml, so it is not on the map")
  } else {
    for (const n of networks) {
      const network = raw.networks.networks.find((x) => x.id === n)
      if (network && !(network.reactions ?? []).includes(id)) {
        warn(file, `lists network \`${n}\`, but networks.yaml does not list it there`)
      }
    }
  }

  for (const m of checkList(file, r, "methods")) if (!methodIds.has(m)) error(file, `unknown method \`${m}\``)
  checkRefs(file, checkList(file, r, "evaluations"), "evaluations: ")
  for (const ev of checkList(file, r, "rmatrix")) {
    if (!fs.existsSync(path.join(process.cwd(), "server", "evaluations", String(ev)))) {
      error(file, `rmatrix: no evaluation \`${ev}\` in server/evaluations/`)
    }
  }
  checkRefs(file, checkList(file, r, "refs"), "refs: ")
  for (const rel of checkList(file, r, "related")) {
    if (!knownReaction(String(rel))) error(file, `related: unknown reaction \`${rel}\``)
    if (rel === id) warn(file, "related: lists itself")
  }
  for (const q of checkList(file, r, "open_questions")) if (!isText(q)) error(file, "open_questions: every entry must be text")

  checkList(file, r, "measurements").forEach((m, i) => {
    const where = `measurements[${i}]: `
    if (!m || typeof m !== "object") return error(file, `${where}must be a map`)
    requireFields(file, m, ["year", "method", "refs"], where)
    if (m.year !== undefined && !isYear(m.year)) error(file, `${where}\`year\` must be a four-digit integer`)
    // A laboratory facilities.yaml does not describe is written
    // `facility: other` with the laboratory named in `lab`.
    if (m.facility === "other") {
      if (!isText(m.lab)) warn(file, `${where}\`facility: other\` without \`lab\` naming the laboratory`)
    } else if (m.facility && !facilityIds.has(m.facility)) {
      error(file, `${where}unknown facility \`${m.facility}\` (use \`facility: other\` with \`lab\` for one not in facilities.yaml)`)
    } else if (!m.facility && !isText(m.lab)) {
      warn(file, `${where}no \`facility\` and no \`lab\``)
    }
    if (m.method && !methodIds.has(m.method)) error(file, `${where}unknown method \`${m.method}\``)
    const refs = checkList(file, m, "refs", where)
    if (m.refs !== undefined && refs.length === 0) error(file, `${where}a measurement needs at least one reference`)
    checkRefs(file, refs, where)
    if (!isText(m.energy)) warn(file, `${where}no \`energy\` range`)
    if (!isText(m.note)) warn(file, `${where}no \`note\``)
    checkTranslations(file, m, [], where)
  })

  if (!decay) {
    if (!isText(r.status_note)) warn(file, "no `status_note`")
    if (!isText(r.details)) warn(file, "no `details`")
    if (!isList(r.measurements) || r.measurements.length === 0) warn(file, "no `measurements`")
  }
}

const missing = [...listedReactions].filter((id) => !reactionFiles.has(id))
if (missing.length) {
  warn("reactions/", `${missing.length} reaction(s) listed in networks.yaml have no file yet (shown as "entry in preparation"): ${missing.join(", ")}`)
}

/* -- timeline -------------------------------------------------------------- */

if (raw.timelineMissing) {
  warn("timeline.yaml", "does not exist yet; /atlas/timeline shows a placeholder")
} else if (raw.timeline) {
  const file = "timeline.yaml"
  const events = isList(raw.timeline) ? raw.timeline : checkList(file, raw.timeline, "events")
  events.forEach((e, i) => {
    const where = `events[${i}] (${e?.year ?? "?"}): `
    requireFields(file, e, ["year", "title", "category", "text"], where)
    if (e?.year !== undefined && !(Number.isInteger(e.year) && e.year > 0 && e.year < 2100)) error(file, `${where}\`year\` must be an integer`)
    if (e?.month !== undefined && !(Number.isInteger(e.month) && e.month >= 1 && e.month <= 12)) error(file, `${where}\`month\` must be 1–12`)
    for (const c of [e?.category, ...(isList(e?.categories) ? e.categories : [])].filter(Boolean)) checkEnum(file, c, "category", where)
    const refs = checkList(file, e, "refs", where)
    checkRefs(file, refs, where)
    if (refs.length === 0 && !e?.url) warn(file, `${where}no reference and no url`)
    for (const id of checkList(file, e, "reactions", where)) if (!knownReaction(String(id))) error(file, `${where}unknown reaction \`${id}\``)
    if (e?.facility && !facilityIds.has(e.facility)) error(file, `${where}unknown facility \`${e.facility}\``)
    checkTranslations(file, e, ["title", "text"], where)
  })
}

/* -- glossary and the atlas' own metadata ---------------------------------- */

if (raw.glossary && typeof raw.glossary === "object") {
  const file = "glossary.yaml"
  const terms = isList(raw.glossary) ? raw.glossary : checkList(file, raw.glossary, "terms")
  const ids = new Set()
  terms.forEach((t, i) => {
    const where = `terms[${i}] (${t?.id ?? "?"}): `
    requireFields(file, t, ["id", "term", "text"], where)
    if (t?.id && ids.has(t.id)) error(file, `${where}id \`${t.id}\` used twice`)
    if (t?.id) ids.add(t.id)
    checkTranslations(file, t, ["term", "text", "keywords"], where)
    checkKeywords(file, t, where)
    if (t?.page !== undefined && !/^\/[a-z0-9/-]*$/.test(String(t.page))) error(file, `${where}\`page\` must be a site path such as /atlas/s-process`)
  })
  terms.forEach((t, i) => {
    for (const see of checkList(file, t, "see", `terms[${i}]: `)) {
      if (!ids.has(String(see))) error(file, `terms[${i}] (${t?.id}): \`see\` names unknown term \`${see}\``)
    }
  })
}
if (raw.meta && typeof raw.meta === "object" && raw.meta.version !== undefined) {
  const v = raw.meta.version
  const ok = v instanceof Date || /^\d{4}-\d{2}-\d{2}$/.test(String(v))
  if (!ok) error("atlas.yaml", "`version` must be a date, YYYY-MM-DD")
}

for (const [file, missing] of untranslated) {
  warn(file, `${missing.length} field(s) without an Italian translation (English is shown on /it): ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}`)
}

/* -- a last pass through the loader the site uses -------------------------- */

try {
  buildAtlas(raw, { strict: false })
} catch (e) {
  error("(loader)", `the site's loader fails on this content: ${e.message}`)
}

/* -- report ---------------------------------------------------------------- */

function print(list, label, colour) {
  if (list.length === 0) return
  console.log(`\n${colour(bold(`${list.length} ${label}`))}`)
  const byFile = new Map()
  for (const item of list) {
    if (!byFile.has(item.file)) byFile.set(item.file, [])
    byFile.get(item.file).push(item.message)
  }
  for (const [file, messages] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${bold(file)}`)
    for (const message of messages) console.log(`    ${colour("•")} ${message}`)
  }
}

const counts = `${reactionFiles.size} reaction files, ${listedReactions.size} reactions in ${networkIds.size} networks, ${Object.keys(references).length} references, ${facilityIds.size} facilities, ${methodIds.size} methods`
console.log(`${bold("atlas")} ${dim(path.relative(process.cwd(), dir) || dir)}: ${counts}`)
// Warnings first and errors last, so the errors are what is on screen at the end.
if (!quiet) print(warnings, warnings.length === 1 ? "warning" : "warnings", yellow)
else if (warnings.length) console.log(yellow(`${warnings.length} warnings (run without --quiet to list them)`))
print(errors, errors.length === 1 ? "error" : "errors", red)

if (errors.length) {
  console.log(`\n${red("atlas check failed.")} Fix the errors above; warnings alone do not stop the build.\n`)
  process.exit(1)
}
console.log(`\n${green("atlas check passed")}${warnings.length ? dim(` with ${warnings.length} warning(s)`) : ""}.\n`)
