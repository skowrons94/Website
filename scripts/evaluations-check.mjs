#!/usr/bin/env node
/**
 * Check every R-matrix evaluation before a build: `npm run check:evaluations`.
 *
 * The same checks as the server's `python -m app.check` (server/app/check.py),
 * against the same schema (server/app/info.schema.json), plus the site's own:
 * the reaction atlas links in both directions. Errors print last, with the
 * file and what to change, and exit 1, which stops `npm run build`; warnings
 * do not. docs/ADDING-AN-EVALUATION.md explains every field.
 *
 *   node scripts/evaluations-check.mjs [ids…] [--root server/evaluations] [--quiet]
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import yaml from "js-yaml"

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SCHEMA = JSON.parse(fs.readFileSync(path.join(REPO, "server", "app", "info.schema.json"), "utf8"))
const DOI = /^10\.\d{4,9}\/[^\s]+[^\s.,;]$/
const ID = /^[0-9A-Za-z][0-9A-Za-z_-]*$/
const TIMING_KEYS = ["open", "prepare_data", "prepare_fine", "prepare_extrap", "edit", "extrap_edit", "grid", "data", "fine"]

const shown = (v) => JSON.stringify(v)

/** The closest of `options` to `word` (a typo), or null. */
export function closest(word, options) {
  const w = String(word).toLowerCase()
  let best = null
  let score = Infinity
  for (const o of options) {
    const d = distance(w, String(o).toLowerCase())
    if (d < score) [best, score] = [o, d]
  }
  return best !== null && score <= Math.max(2, Math.floor(String(word).length / 3)) ? best : null
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = row[j]
      row[j] = next
    }
  }
  return row[b.length]
}

/* -- the JSON Schema subset info.schema.json uses (as server/app/check.py) -- */

const TYPES = {
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === "string",
  boolean: (v) => typeof v === "boolean",
  integer: Number.isInteger,
  number: (v) => typeof v === "number",
  null: (v) => v === null,
}
const WANTED = {
  string: "text",
  boolean: "true or false",
  array: "a list [...]",
  object: "an object {...}",
  integer: "a whole number",
  number: "a number",
  null: "null",
}
const typeName = (v) =>
  v === null ? "null" : Array.isArray(v) ? "a list" : typeof v === "string" ? "text" : typeof v === "boolean" ? "true/false" : typeof v === "number" ? "a number" : "an object"

export function validate(value, schema, where = "") {
  const here = where ? `\`${where}\`` : "the file"
  if (schema.anyOf) {
    const options = schema.anyOf.map((s) => validate(value, s, where))
    if (options.some((o) => o.length === 0)) return []
    // The option for the value's own type explains best ({"doi": …} is an
    // object with a bad DOI, not "text expected").
    const own = schema.anyOf.findIndex((sub) => sub.type && TYPES[sub.type](value))
    return own >= 0 ? options[own] : options.reduce((a, b) => (b.length < a.length ? b : a))
  }
  const out = []
  if (schema.type) {
    const types = [].concat(schema.type)
    if (!types.some((t) => TYPES[t](value))) {
      return [`${here} must be ${types.map((t) => WANTED[t]).join(" or ")}, not ${typeName(value)} (${shown(value)})`]
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    const guess = closest(value, schema.enum)
    out.push(`${here} is ${shown(value)}; it must be one of ${schema.enum.map(shown).join(", ")}${guess ? ` (did you mean ${shown(guess)}?)` : ""}`)
  }
  if (typeof value === "string") {
    if (value.trim().length < (schema.minLength ?? 0)) out.push(value.trim() ? `${here} is empty or too short` : `${here} is empty`)
    else if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      out.push(`${here} is ${shown(value)}, which does not look right: ${patternHint(where, value)}`)
    }
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) out.push(`${here} must be at least ${schema.minimum}`)
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0)) out.push(`${here} must list at least ${schema.minItems} item(s)`)
    if (schema.items) value.forEach((item, i) => out.push(...validate(item, schema.items, `${where}[${i}]`)))
  }
  if (TYPES.object(value)) {
    const props = schema.properties ?? {}
    for (const key of schema.required ?? []) {
      if (!(key in value)) out.push(`${here} has no \`${key}\`; add it${props[key]?.description ? ` (${props[key].description})` : ""}`)
    }
    const extra = schema.additionalProperties ?? true
    for (const [key, item] of Object.entries(value)) {
      const sub = where ? `${where}.${key}` : key
      if (key in props) out.push(...validate(item, props[key], sub))
      else if (extra === false) {
        const guess = closest(key, Object.keys(props))
        out.push(`\`${sub}\` is not a known field${guess ? `; did you mean \`${guess}\`?` : `; the known fields are ${Object.keys(props).filter((k) => k !== "$schema").join(", ")}`}`)
      } else if (typeof extra === "object") out.push(...validate(item, extra, sub))
    }
  }
  return out
}

function patternHint(where, value) {
  if (where === "reference" || where.endsWith(".doi")) {
    const bare = value.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "")
    if (bare !== value && DOI.test(bare)) return `write the bare DOI, ${shown(bare)}`
    return "a DOI looks like 10.1103/PhysRevC.111.035802 (no https://doi.org/, no doi:)"
  }
  if (where.startsWith("reactions")) return 'write a reaction like "¹²C(p,γ)¹³N" (target(in,out)product, no spaces)'
  if (where.startsWith("atlas")) return 'write an atlas page\'s file name without .yaml, like "12C-pg-13N"'
  return "see server/app/info.schema.json"
}

/** [path, text] of every string that still holds a TODO placeholder. */
function* todos(value, where = "") {
  if (typeof value === "string") {
    if (value.includes("TODO")) yield [where || "info.json", value]
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* todos(v, `${where}[${i}]`)
  } else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) yield* todos(v, where ? `${where}.${k}` : k)
}

/* -- the .azr file ----------------------------------------------------------- */

function block(text, name) {
  const lines = text.split("\n")
  const start = lines.findIndex((l) => l.trim() === `<${name}>`)
  if (start < 0) return { first: 0, lines: [] }
  const end = lines.findIndex((l, i) => i > start && l.trim() === `</${name}>`)
  return end < 0 ? { first: 0, lines: [] } : { first: start + 2, lines: lines.slice(start + 1, end) }
}

const segmentFile = (line) => line.split(/\s+/).find((t) => /[A-Za-z]/.test(t) && !/^[-+]?[\d.]+(e[-+]?\d+)?$/i.test(t)) ?? null

/** Every path in the .azr: { line, kind, path }. */
export function azrPaths(text) {
  const out = []
  const config = block(text, "config")
  if (config.lines.length > 2) {
    out.push({ line: config.first + 1, kind: "output", path: config.lines[1].split("#")[0].trim() })
    out.push({ line: config.first + 2, kind: "checks", path: config.lines[2].split("#")[0].trim() })
  }
  const seg = block(text, "segmentsData")
  seg.lines.forEach((l, i) => {
    const file = l.trim() ? segmentFile(l) : null
    if (file) out.push({ line: seg.first + i, kind: "data", path: file })
  })
  const last = block(text, "lastRun")
  last.lines.forEach((l, i) => {
    for (const m of l.matchAll(/"([^"]+)"/g)) out.push({ line: last.first + i, kind: "lastrun", path: m[1] })
  })
  return out
}

const isAbsolute = (p) => /^([/~\\]|[A-Za-z]:[\\/])/.test(p)
const stemOf = (p) => path.basename(p.replace(/\\/g, "/")).replace(/\.[^.]*$/, "")

/* -- the atlas ------------------------------------------------------------------ */

/** Atlas reaction id → its `rmatrix:` ids, or null when there is no atlas. */
function atlasLinks(dir) {
  if (!fs.existsSync(dir)) return null
  const out = {}
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".yaml")) continue
    let raw
    try {
      raw = yaml.load(fs.readFileSync(path.join(dir, name), "utf8")) ?? {}
    } catch {
      raw = {} // check:atlas reports a broken file
    }
    out[name.slice(0, -5)] = [].concat(raw.rmatrix ?? []).map(String)
  }
  return out
}

/* -- the checks ------------------------------------------------------------------ */

const YEAR = /\b(1[89]|20)\d\d\b/
const FORM = '{"label": "Author year", "authors": "A. Author et al.", "ref": "Phys. Rev. C 1, 1 (1970)", "doi": "10.xxxx/..." or null}'

/**
 * [level, message] for a `datasets` entry without a full reference (as
 * server/app/check.py's dataset_reference_problems): every dataset names its
 * publication (`authors`, `ref` with the year, `doi` or null); one whose
 * publication is not known yet says why in `pending`, a warning.
 */
export function datasetReferenceProblems(key, entry) {
  if (typeof entry === "string") {
    return [["error", `dataset ${shown(key)} has no reference: write it as ${FORM}, or give "pending" with the reason when the publication is not known yet`]]
  }
  if (!TYPES.object(entry)) return [] // the schema reports it
  const { ref, pending } = entry
  if (!(typeof ref === "string" && ref.trim())) {
    if (typeof pending === "string" && pending.trim()) return [["warning", `dataset ${shown(key)}: reference pending (${pending.trim()})`]]
    return [["error", `dataset ${shown(key)} has no \`ref\`: add the publication as ${FORM}, or give "pending" with the reason`]]
  }
  const out = []
  if (!(typeof entry.authors === "string" && entry.authors.trim())) {
    out.push(["error", `dataset ${shown(key)} has no \`authors\` (as cited, e.g. "C. Rolfs and R. E. Azuma")`])
  }
  if (!YEAR.test(ref) && !ref.includes("TODO")) out.push(["error", `dataset ${shown(key)}: \`ref\` ${shown(ref)} has no year; write it as "Nucl. Phys. A 227, 291 (1974)"`])
  if (!("doi" in entry)) out.push(["warning", `dataset ${shown(key)} has no \`doi\`: add it, or write null when the paper has none or none could be confirmed`])
  return out
}

export function checkEvaluation(dir, atlas = null) {
  const id = path.basename(dir)
  const problems = []
  const error = (where, message) => problems.push({ level: "error", where: where ? `${id}/${where}` : id, message })
  const warn = (where, message) => problems.push({ level: "warning", where: where ? `${id}/${where}` : id, message })

  if (!ID.test(id)) error("", "the directory name is the evaluation's id and its web address: use letters, digits, - and _ only (e.g. 12C, 12C-2025)")

  const azrs = fs.readdirSync(dir).filter((n) => n.endsWith(".azr")).sort()
  if (azrs.length === 0) error("", "there is no .azr file in this directory")
  else if (azrs.length > 1) error("", `there are ${azrs.length} .azr files (${azrs.join(", ")}); keep exactly one`)

  let files = []
  if (azrs.length) {
    const azr = azrs[0]
    const text = fs.readFileSync(path.join(dir, azr), "utf8")
    if (!text.includes("<segmentsData>")) error(azr, "has no <segmentsData> block: is it an AZURE2 file?")
    for (const { line, kind, path: p } of azrPaths(text)) {
      if (isAbsolute(p)) {
        const hint = kind === "output" ? "output/" : kind === "checks" ? "checks/" : `${kind === "data" ? "data" : "output"}/${path.basename(p.replace(/\\/g, "/"))}`
        error(`${azr}:${line}`, `the ${kind} path ${shown(p)} is absolute, so it only works on the machine that wrote it; make it relative to the evaluation directory (${shown(hint)}). \`make add-evaluation\` does this for you`)
      } else if (kind === "data" && !fs.existsSync(path.join(dir, p))) {
        error(`${azr}:${line}`, `reads ${shown(p)}, which is not there; copy it into data/ or fix the path`)
      }
      if (kind === "data" && !files.includes(p)) files.push(p)
    }
  }

  let info = null
  const infoFile = path.join(dir, "info.json")
  if (!fs.existsSync(infoFile)) error("info.json", "there is no info.json; `make add-evaluation` writes one to fill in")
  else {
    const raw = fs.readFileSync(infoFile, "utf8")
    try {
      info = JSON.parse(raw)
    } catch (e) {
      // Node's message names a position; turn it into a line and column.
      const pos = Number(/position (\d+)/.exec(e.message)?.[1])
      let where = ""
      if (Number.isFinite(pos)) {
        const before = raw.slice(0, pos).split("\n")
        const text = raw.split("\n")[before.length - 1]?.trim()
        where = ` at line ${before.length}, column ${before.at(-1).length + 1}${text ? `: ${text}` : ""}`
      }
      error("info.json", `is not valid JSON: ${e.message.replace(/ in JSON at position \d+.*$/, "")}${where}. Look for a doubled or missing comma, or a missing quote, there or on the line before`)
    }
    if (info !== null && !TYPES.object(info)) {
      error("info.json", "must be an object { ... }")
      info = null
    }
  }

  if (info) {
    for (const m of validate(info, SCHEMA)) error("info.json", m)
    for (const [where, value] of todos(info)) {
      error("info.json", `\`${where}\` still says ${shown(value)}: replace the TODO (make add-evaluation leaves these for what only you know)`)
    }
    if ("id" in info && info.id !== id) {
      error("info.json", `\`id\` is ${shown(info.id)} but the directory is ${shown(id)}; the directory name is the id, so make them the same (or remove \`id\`)`)
    }
    if (info.status === "published" && !(typeof info.reference === "string" && info.reference)) {
      error("info.json", '`status` is "published" but there is no `reference` (the paper\'s DOI)')
    }
    if (info.status === "published" && !TYPES.object(info.paper)) {
      warn("info.json", '`status` is "published" but there is no `paper` ({"authors", "title", "journal", "year"}), so only the DOI is shown')
    }
    const datasets = TYPES.object(info.datasets) ? info.datasets : {}
    const stems = files.map(stemOf)
    for (const key of Object.keys(datasets)) {
      if (!stems.includes(key)) {
        const guess = closest(key, stems)
        error("info.json", `\`datasets\` names ${shown(key)}, but the model reads no data file called that${guess ? `; did you mean ${shown(guess)}?` : ""} (the key is the file name in data/ without .dat)`)
      }
    }
    for (const s of stems) {
      if (!(s in datasets)) error("info.json", `data file ${shown(s)} has no label: add "${s}": {"label": "Author year", "authors", "ref", "doi"} to \`datasets\``)
    }
    for (const [key, entry] of Object.entries(datasets)) {
      for (const [level, message] of datasetReferenceProblems(key, entry)) (level === "error" ? error : warn)("info.json", message)
    }
    if (atlas && Array.isArray(info.atlas)) {
      for (const rid of info.atlas) {
        if (typeof rid === "string" && !(rid in atlas)) {
          const guess = closest(rid, Object.keys(atlas))
          error("info.json", `\`atlas\` lists ${shown(rid)}, but there is no content/atlas/reactions/${rid}.yaml${guess ? `; did you mean ${shown(guess)}?` : ""}`)
        }
      }
    }
    if (atlas && !("atlas" in info) && !Object.values(atlas).some((ids) => ids.includes(id))) {
      warn("info.json", 'no atlas page links to this evaluation: list the atlas pages it belongs on in `atlas` (e.g. ["12C-pg-13N"]), or write "atlas": [] for none')
    }
  }

  if (azrs.length) {
    const used = new Set(files.map((f) => path.normalize(f)))
    const dataDir = path.join(dir, "data")
    if (fs.existsSync(dataDir)) {
      const unused = fs.readdirSync(dataDir).filter((n) => !n.startsWith(".") && !used.has(path.normalize(path.join("data", n)))).sort()
      if (unused.length) warn("data", `not read by the model (still shipped and downloadable): ${unused.join(", ")}`)
    }
    if (!["dat", "extrap"].some((x) => fs.existsSync(path.join(dir, "output", `intEC.${x}`)))) {
      warn("output", "there is no output/intEC.dat: copy it from your AZURE2 run if the model has external capture, or the first visitor waits while AZURE2 recomputes it")
    }
  }

  const timingsFile = path.join(dir, "timings.json")
  if (!fs.existsSync(timingsFile)) {
    warn("timings.json", 'missing, so the page shows no "opens in about N s": run `make warm` (Docker) or `python -m app.warm <id>` (from server/) and commit it')
  } else {
    try {
      const stored = JSON.parse(fs.readFileSync(timingsFile, "utf8"))
      for (const side of ["server", "browser"]) {
        const b = stored[side]
        if (b === undefined) continue
        const bad = TYPES.object(b) ? TIMING_KEYS.filter((k) => k in b && !(typeof b[k] === "number" && b[k] >= 0)) : [side]
        if (bad.length) error("timings.json", `\`${side}\` has non-numeric timings (${bad.join(", ")}); write it again with \`python -m app.warm --force ${id}\``)
      }
    } catch (e) {
      error("timings.json", `is not valid (${e.message}); delete it and run \`python -m app.warm --force ${id}\``)
    }
  }
  return problems
}

export function checkRoot(root, { only = [], atlasDir = path.join(REPO, "content", "atlas", "reactions") } = {}) {
  const atlas = atlasLinks(atlasDir)
  const ids = fs.existsSync(root)
    ? fs
        .readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !/^[._]/.test(d.name))
        .map((d) => d.name)
        .sort()
    : []
  const problems = []
  for (const id of ids) if (!only.length || only.includes(id)) problems.push(...checkEvaluation(path.join(root, id), atlas))
  for (const id of only) if (!ids.includes(id)) problems.push({ level: "error", where: id, message: `there is no directory ${id} in ${root}` })
  if (atlas && !only.length) {
    for (const [rid, evs] of Object.entries(atlas)) {
      for (const ev of evs) {
        if (!ids.includes(ev)) {
          const guess = closest(ev, ids)
          problems.push({
            level: "error",
            where: `content/atlas/reactions/${rid}.yaml`,
            message: `\`rmatrix:\` lists ${shown(ev)}, which is not an evaluation${guess ? `; did you mean ${shown(guess)}?` : ""} (ids are case-sensitive)`,
          })
        }
      }
    }
  }
  return { ids, problems }
}

/* -- command line ------------------------------------------------------------- */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const quiet = args.includes("--quiet")
  const rootArg = args.indexOf("--root")
  const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : path.join(REPO, "server", "evaluations")
  const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--root")
  const tty = process.stdout.isTTY
  const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
  const [red, yellow, green, bold] = [paint(31), paint(33), paint(32), paint(1)]

  const { ids, problems } = checkRoot(root, { only })
  const errors = problems.filter((p) => p.level === "error")
  const warnings = problems.filter((p) => p.level !== "error")
  console.log(`${bold("evaluations")} ${path.relative(process.cwd(), root) || root}: ${ids.length} (${ids.join(", ")})`)
  if (warnings.length && !quiet) {
    console.log(yellow(bold(`\n${warnings.length} warning(s)`)))
    for (const w of warnings) console.log(`  ${yellow("•")} ${bold(w.where)}: ${w.message}`)
  } else if (warnings.length) console.log(yellow(`${warnings.length} warning(s) (run without --quiet to list them)`))
  if (errors.length) {
    console.log(red(bold(`\n${errors.length} error(s)`)))
    for (const e of errors) console.log(`  ${red("•")} ${bold(e.where)}: ${e.message}`)
    console.log(`\n${red("evaluation check failed.")} Fix the errors above (docs/ADDING-AN-EVALUATION.md explains every field).\n`)
    process.exit(1)
  }
  console.log(`\n${green("evaluation check passed")}${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.\n`)
}
