import fs from "node:fs"
import path from "node:path"

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

export interface EvaluationMeta {
  id: string
  /** The model is in this build's tree (so the page was prerendered). */
  known: boolean
  reactions: string[]
  reference: string | null
  doi: string | null
  author: string | null
  status: string | null
  citation: string | null
  summary: string | null
  summary_it: string | null
  filename: string | null
  /** Data segments in the model, and how many are active. */
  segments: number
  active: number
  /** Distinct data files the segments read. */
  files: number
  /** Observable codes of the active segments, counted. */
  observables: Record<string, number>
  /** Data-file stem → readable name, from info.json. */
  datasets: Record<string, string>
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
    author: null,
    status: null,
    citation: null,
    summary: null,
    summary_it: null,
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
    author: text(info.author),
    status: text(info.status),
    citation: text(info.citation),
    summary: text(info.summary),
    summary_it: text(info.summary_it),
    filename: azr,
    datasets:
      info.datasets && typeof info.datasets === "object"
        ? Object.fromEntries(
            Object.entries(info.datasets as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === "string",
            ),
          )
        : {},
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
