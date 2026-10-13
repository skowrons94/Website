import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { browserEstimate, timingsOf, type TypicalTimings } from "./eval-timings"

/**
 * What the evaluation pages know about an evaluation *at build time*, read
 * from the repository rather than from the AZURE2 API: the `info.json` beside
 * the model, the shape of its `<segmentsData>`, and the AZURE2 commit the
 * engine is built from.
 *
 * This is what lets the page header (title, reactions, paper, how to cite) be
 * server-rendered, so it is in the HTML, readable without JavaScript, and does
 * not jump when the calculation server answers. Everything that needs the
 * model itself (levels, χ², curves) still comes from the API. A missing file
 * is never an error: an evaluation the API serves but this build has not seen
 * simply renders without the header extras.
 */

const ROOT = path.join(process.cwd(), "server", "evaluations")

/** The paper an evaluation was published in (info.json `paper`). */
export interface EvaluationPaper {
  /** As cited: "E. Masha et al." */
  authors: string
  title: string | null
  /** "Phys. Rev. C 108, L052801" */
  journal: string | null
  year: number | null
}

/** A data file's source, from info.json `datasets` (string or object form). */
export interface DatasetSource {
  label: string
  ref: string | null
  doi: string | null
}

export interface EvaluationMeta {
  id: string
  /** The model is in this build's tree (so the page was prerendered). */
  known: boolean
  reactions: string[]
  reference: string | null
  doi: string | null
  /** Who did the R-matrix analysis (info.json `analysis`, or the older `author`). */
  analysis: string | null
  paper: EvaluationPaper | null
  /** Date of the last change to the evaluation's files (git), or info.json `version`. */
  version: string | null
  status: string | null
  citation: string | null
  summary: string | null
  summary_it: string | null
  /** One plain sentence on what the reaction is for (info.json `purpose` / `purpose_it`). */
  purpose: string | null
  purpose_it: string | null
  /** Typical timings (timings.json, written by `python -m app.warm`), or null. */
  timings: TypicalTimings | null
  filename: string | null
  /** Data segments in the model, and how many are active. */
  segments: number
  active: number
  /** Distinct data files the segments read. */
  files: number
  /** Observable codes of the active segments, counted. */
  observables: Record<string, number>
  /** Data-file stem → readable name and source, from info.json. */
  datasets: Record<string, DatasetSource>
}

const OBSERVABLE: Record<number, string> = {
  0: "angle-integrated",
  1: "differential",
  2: "phase-shift",
  3: "total-capture",
  4: "differential-cm",
  5: "angle-integrated-E1",
  6: "angle-integrated-E2",
  7: "analyzing-power",
}

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return {}
  }
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)

function doiOf(reference: string | null): string | null {
  if (!reference) return null
  const ref = reference.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, "")
  return /^10\.\d{4,9}\/\S+$/.test(ref) ? ref : null
}

function paperOf(value: unknown): EvaluationPaper | null {
  if (!value || typeof value !== "object") return null
  const p = value as Record<string, unknown>
  const authors = text(p.authors)
  if (!authors) return null
  return {
    authors,
    title: text(p.title),
    journal: text(p.journal),
    year: typeof p.year === "number" ? p.year : null,
  }
}

function datasetsOf(value: unknown): Record<string, DatasetSource> {
  if (!value || typeof value !== "object") return {}
  const out: Record<string, DatasetSource> = {}
  for (const [stem, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") out[stem] = { label: entry, ref: null, doi: null }
    else if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>
      const label = text(e.label)
      if (label) out[stem] = { label, ref: text(e.ref), doi: doiOf(text(e.doi)) }
    }
  }
  return out
}

/** timings.json: its `server` part, and its `browser` part or an estimate from the server's. */
function timingsFile(file: string): TypicalTimings | null {
  if (!fs.existsSync(file)) return null
  const raw = readJson(file)
  const server = timingsOf(raw.server)
  const browser = timingsOf(raw.browser)
  if (Object.keys(server).length === 0 && Object.keys(browser).length === 0) return null
  return { server, browser: Object.keys(browser).length ? browser : browserEstimate(server) }
}

/** The date (YYYY-MM-DD) of the last commit touching the evaluation, if git can tell. */
function lastChange(id: string): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", path.join(ROOT, id)], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null
  } catch {
    return null
  }
}

/** Every evaluation directory that holds a .azr file, sorted by id. */
export function evaluationIds(): string[] {
  if (!fs.existsSync(ROOT)) return []
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => fs.readdirSync(path.join(ROOT, d.name)).some((f) => f.endsWith(".azr")))
    .map((d) => d.name)
    .sort()
}

export function evaluationMeta(id: string): EvaluationMeta {
  const dir = path.join(ROOT, id)
  const empty: EvaluationMeta = {
    id,
    known: false,
    reactions: [],
    reference: null,
    doi: null,
    analysis: null,
    paper: null,
    version: null,
    status: null,
    citation: null,
    summary: null,
    summary_it: null,
    purpose: null,
    purpose_it: null,
    timings: null,
    filename: null,
    segments: 0,
    active: 0,
    files: 0,
    observables: {},
    datasets: {},
  }
  // Resolve against the listing, never by joining an id onto a path.
  if (!evaluationIds().includes(id)) return empty

  const info = readJson(path.join(dir, "info.json"))
  const azr = fs.readdirSync(dir).find((f) => f.endsWith(".azr")) ?? null
  const meta: EvaluationMeta = {
    ...empty,
    known: true,
    reactions: Array.isArray(info.reactions) ? info.reactions.filter((r): r is string => typeof r === "string") : [],
    reference: text(info.reference),
    doi: doiOf(text(info.reference)),
    analysis: text(info.analysis) ?? text(info.author),
    paper: paperOf(info.paper),
    version: lastChange(id) ?? text(info.version),
    status: text(info.status),
    citation: text(info.citation),
    summary: text(info.summary),
    summary_it: text(info.summary_it),
    purpose: text(info.purpose),
    purpose_it: text(info.purpose_it),
    timings: timingsFile(path.join(dir, "timings.json")),
    filename: azr,
    datasets: datasetsOf(info.datasets),
  }

  if (azr) {
    // <segmentsData>: one line per segment, "active entrance exit eMin eMax
    // aMin aMax isDiff …  data/file.dat …" (see pyazr's datasets.py).
    const source = fs.readFileSync(path.join(dir, azr), "utf8")
    const block = /<segmentsData>([\s\S]*?)<\/segmentsData>/.exec(source)?.[1] ?? ""
    const files = new Set<string>()
    for (const line of block.split("\n")) {
      const t = line.trim().split(/\s+/)
      if (t.length < 8 || t[0] === "") continue
      meta.segments++
      if (Number(t[0]) !== 1) continue
      meta.active++
      const code = OBSERVABLE[Math.round(Number(t[7]))] ?? "other"
      meta.observables[code] = (meta.observables[code] ?? 0) + 1
      const file = t.find((tok) => /[A-Za-z]/.test(tok) && /\.\w+$/.test(tok))
      if (file) files.add(file)
    }
    meta.files = files.size
  }
  return meta
}

/**
 * The AZURE2 commit the engine is compiled from, as pinned in
 * deploy/Dockerfile.azure2 (the browser build reads the same line).
 */
export function azure2Ref(): string | null {
  try {
    const docker = fs.readFileSync(path.join(process.cwd(), "deploy", "Dockerfile.azure2"), "utf8")
    return /^ARG AZURE2_REF=(\S+)/m.exec(docker)?.[1] ?? null
  } catch {
    return null
  }
}
