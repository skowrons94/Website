/**
 * Build-time access to the data explorer's files for the expert pages: the
 * committed index and metadata, the ENSDF summaries, the shards when they
 * have been built (CI builds them before the site; a checkout without them
 * still builds), and the links to the site's own evaluations. Server only.
 */

import fs from "node:fs"
import path from "node:path"

import { atomicMass, entranceChannel, initialParticles, parseParticle, qValue } from "@/lib/atlas-core.mjs"
import { getAtlas, getReaction, type Reaction } from "@/lib/atlas"
import {
  cumulative,
  integrandFor,
  lowestMeasured,
  measuredRanges,
  shareBelow,
  unmeasuredShare,
  windowOf,
  windowsAt,
  type GapRow,
  type WindowMetrics,
} from "@/lib/data/gap"
import { gapRows } from "@/lib/data/index-rows"
import { compoundOf, keyFromLabel, parseKey, parseNuc } from "@/lib/data/nuclide"
import { levelsInWindow, strengthsOf, type Strength } from "@/lib/data/resonances"
import type { DxIndex, DxMeta, Ensdf, Shard } from "@/lib/data/types"
import type { Lang } from "@/lib/i18n"

const DATA = path.join(process.cwd(), "public", "data")

let indexCache: DxIndex | null = null
let metaCache: DxMeta | null = null

export function readIndex(): DxIndex {
  indexCache ??= JSON.parse(fs.readFileSync(path.join(DATA, "exfor", "index.json"), "utf8")) as DxIndex
  return indexCache
}

export function readMeta(): DxMeta {
  metaCache ??= JSON.parse(fs.readFileSync(path.join(DATA, "meta.json"), "utf8")) as DxMeta
  return metaCache
}

/** A built shard, or null when the shards have not been built here. */
export function readShard(slug: string): Shard | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, "exfor", "r", `${slug}.json`), "utf8")) as Shard
  } catch {
    return null
  }
}

export function readEnsdf(nuclide: string): Ensdf | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, "ensdf", `${nuclide}.json`), "utf8")) as Ensdf
  } catch {
    return null
  }
}

/** The index reactions of an atlas reaction (usually one). */
export function atlasReactions(atlasId: string): number[] {
  const idx = readIndex()
  const out: number[] = []
  idx.reactions.atlas.forEach((ids, r) => {
    if (ids.includes(atlasId)) out.push(r)
  })
  return out
}

export function reactionBySlug(slug: string): number {
  return readIndex().reactions.slug.indexOf(slug)
}

/** Slugs pre-rendered as /data/reaction/<slug>: the reactions of the atlas. */
export function prerenderedSlugs(): string[] {
  const idx = readIndex()
  return idx.reactions.slug.filter((_, r) => idx.reactions.atlas[r].length > 0)
}

/* -- the entrance channel ------------------------------------------------------------ */

export interface Channel {
  z1: number
  z2: number
  /** u */
  mu: number
  /** keV, for an endothermic reaction; 0 otherwise */
  threshold: number
  /** μ from mass numbers (no AME mass for a nucleus) */
  approx: boolean
}

/** Z₁, Z₂, μ (AME2020) and threshold of an index reaction key. */
export function channelOf(key: string): Channel | null {
  const k = parseKey(key)
  if (!k) return null
  const t = parseNuc(k.target)
  const p = parseNuc(k.projectile)
  if (!t || !p || t.A === 0 || p.A === 0) return null
  const pt = parseParticle(`${t.A}${symbolOf(t.Z)}`)
  const pp = p.Z === 0 ? parseParticle("n") : parseParticle(`${p.A}${symbolOf(p.Z)}`)
  const ma = pt ? atomicMass(pt) : null
  const mb = pp ? atomicMass(pp) : null
  const approx = ma === null || mb === null
  const m1 = ma ?? t.A
  const m2 = mb ?? p.A
  let threshold = 0
  const e = parseNuc(k.process)
  const compound = compoundOf(key)
  if (e && compound && pt && pp) {
    const c = parseNuc(compound)!
    const resA = c.A - e.A
    const resZ = c.Z - e.Z
    if (resA > 0 && resZ >= 0) {
      const res = parseParticle(resZ === 0 && resA === 1 ? "n" : `${resA}${symbolOf(resZ)}`)
      const ej = e.A === 0 ? null : parseParticle(e.Z === 0 ? "n" : `${e.A}${symbolOf(e.Z)}`)
      if (res) {
        const q = qValue({ target: pt.code, projectile: pp.code, product: res.code, ejectile: ej ? ej.code : "g", kind: "capture" })
        if (q && q.value < 0) threshold = -q.value * 1000
      }
    }
  }
  return { z1: p.Z, z2: t.Z, mu: (m1 * m2) / (m1 + m2), threshold, approx }
}

function symbolOf(Z: number): string {
  return [
    "n",
    "H",
    "He",
    "Li",
    "Be",
    "B",
    "C",
    "N",
    "O",
    "F",
    "Ne",
    "Na",
    "Mg",
    "Al",
    "Si",
    "P",
    "S",
    "Cl",
    "Ar",
    "K",
    "Ca",
    "Sc",
    "Ti",
    "V",
    "Cr",
    "Mn",
    "Fe",
    "Co",
    "Ni",
    "Cu",
    "Zn",
    "Ga",
    "Ge",
    "As",
    "Se",
    "Br",
    "Kr",
    "Rb",
    "Sr",
    "Y",
    "Zr",
    "Nb",
    "Mo",
    "Tc",
    "Ru",
    "Rh",
    "Pd",
    "Ag",
    "Cd",
    "In",
    "Sn",
    "Sb",
    "Te",
    "I",
    "Xe",
    "Cs",
    "Ba",
    "La",
    "Ce",
    "Pr",
    "Nd",
    "Pm",
    "Sm",
    "Eu",
    "Gd",
    "Tb",
    "Dy",
    "Ho",
    "Er",
    "Tm",
    "Yb",
    "Lu",
    "Hf",
    "Ta",
    "W",
    "Re",
    "Os",
    "Ir",
    "Pt",
    "Au",
    "Hg",
    "Tl",
    "Pb",
    "Bi",
    "Po",
  ][Z]
}

/* -- windows ---------------------------------------------------------------------- */

/** The windows and metrics of an atlas reaction at its own temperatures. */
export function atlasWindows(r: Reaction, rows: GapRow[], ch: Channel | null): WindowMetrics[] {
  const ranges = measuredRanges(rows)
  const lowest = lowestMeasured(rows)
  const out: WindowMetrics[] = []
  if (!ch) return out
  if (r.gamow.length > 0) {
    for (const g of r.gamow) {
      const it = integrandFor(ch.z1, ch.z2, ch.mu, g.T9, ch.threshold)
      const lo = g.lo ?? g.E0 - g.width / 2
      const hi = g.hi ?? g.E0 + g.width / 2
      const c = cumulative(it)
      out.push({
        label: g.label,
        network: g.network,
        T9: g.T9,
        E0: g.E0,
        width: g.width,
        lo,
        hi,
        kT: null,
        unmeasured: unmeasuredShare(it, ranges),
        widths: lowest ? (lowest.E - g.E0) / g.width : null,
        below: lowest ? shareBelow(c, lowest.E) : null,
      })
    }
  } else if (r.thermal.length > 0 && (ch.z1 === 0 || ch.z2 === 0)) {
    for (const th of r.thermal) {
      const it = integrandFor(ch.z1, ch.z2, ch.mu, th.T9, ch.threshold)
      const w = windowOf(it)
      out.push({
        label: th.label,
        network: th.network,
        T9: th.T9,
        E0: w.peak,
        width: w.hi - w.lo,
        lo: w.lo,
        hi: w.hi,
        kT: th.kT,
        unmeasured: unmeasuredShare(it, ranges),
        widths: null,
        below: null,
      })
    }
  }
  return out
}

/** Windows at chosen temperatures for a reaction outside the atlas. */
export function genericWindows(ch: Channel | null, rows: GapRow[], temps: { label: string; T9: number }[]): WindowMetrics[] {
  return ch ? windowsAt(ch, rows, temps) : []
}

/* -- the evaluations ----------------------------------------------------------------- */

export interface EvaluationLink {
  id: string
  /** reaction keys it fits */
  reactions: string[]
  /** EXFOR entries named by its data files */
  entries: string[]
  /** entry.subentry named by its data files */
  subentries: string[]
  /** DOIs of its datasets (info.json) */
  dois: string[]
  reference: string | null
  /** info.json `preliminary`: the model does not yet reproduce the published best fit */
  preliminary: boolean
  /** info.json `notes` (the caveats the evaluation page shows), EN and IT */
  notes: { text: string; text_it: string | null }[]
}

/** An evaluation's notes in one language (the Italian text when there is one). */
export const evaluationNotes = (e: EvaluationLink, lang: Lang): string[] =>
  e.notes.map((n) => (lang === "it" && n.text_it ? n.text_it : n.text))

const EXFOR_TOKEN = /^([A-Z0-9]\d{4})(\d{3})$/

let evalCache: EvaluationLink[] | null = null

/**
 * The site's R-matrix evaluations (server/evaluations/<id>) and the EXFOR
 * data they use: entries named in their data file names (Elwyn-F0012002,
 * as server/app/evaluations.py `exfor_code` reads them) and the DOIs in
 * info.json, with the reactions they fit (info.json `reactions`).
 */
export function evaluationLinks(): EvaluationLink[] {
  if (evalCache) return evalCache
  const root = path.join(process.cwd(), "server", "evaluations")
  const out: EvaluationLink[] = []
  let dirs: string[] = []
  try {
    dirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch {
    dirs = []
  }
  for (const id of dirs) {
    const dir = path.join(root, id)
    let info: Record<string, unknown> = {}
    try {
      info = JSON.parse(fs.readFileSync(path.join(dir, "info.json"), "utf8"))
    } catch {
      /* no info */
    }
    const reactions = (Array.isArray(info.reactions) ? info.reactions : [])
      .map((x) => (typeof x === "string" ? keyFromLabel(x) : null))
      .filter((x): x is string => Boolean(x))
    const entries = new Set<string>()
    const subentries = new Set<string>()
    const azr = fs.readdirSync(dir).find((f) => f.endsWith(".azr"))
    if (azr) {
      const text = fs.readFileSync(path.join(dir, azr), "utf8")
      const block = /<segmentsData>([\s\S]*?)<\/segmentsData>/.exec(text)?.[1] ?? ""
      for (const m of block.matchAll(/(\S+)\.(?:dat|txt|csv)\b/g)) {
        const stem = path.basename(m[1])
        for (const token of stem.split(/[-_]/)) {
          const x = EXFOR_TOKEN.exec(token)
          if (x) {
            entries.add(x[1])
            subentries.add(`${x[1]}.${x[2]}`)
          }
        }
      }
    }
    const dois = new Set<string>()
    const ds = info.datasets
    if (ds && typeof ds === "object") {
      for (const v of Object.values(ds as Record<string, unknown>)) {
        if (v && typeof v === "object" && typeof (v as { doi?: unknown }).doi === "string")
          dois.add((v as { doi: string }).doi.toLowerCase())
      }
    }
    out.push({
      id,
      reactions,
      entries: [...entries],
      subentries: [...subentries],
      dois: [...dois],
      reference: typeof info.reference === "string" ? info.reference : null,
      preliminary: info.preliminary === true,
      notes: Array.isArray(info.notes)
        ? info.notes
            .filter((n: unknown): n is { text: string; text_it?: unknown } => Boolean(n) && typeof (n as { text?: unknown }).text === "string")
            .map((n: { text: string; text_it?: unknown }) => ({ text: n.text, text_it: typeof n.text_it === "string" ? n.text_it : null }))
        : [],
    })
  }
  evalCache = out
  return out
}

/* -- compound nuclei --------------------------------------------------------------------- */

export interface CompoundEntrance {
  /** atlas reaction id and label */
  atlas: string
  label: string
  /** index reaction key, e.g. "14N(p,g)" */
  key: string | null
  /** entrance-channel threshold in the compound nucleus (MeV, AME2020): S_x */
  separation: number | null
  projectile: string
  target: string
}

/** The compound nuclei of the atlas reactions with an ENSDF summary, and their atlas entrance channels. */
export function compoundNuclei(lang: Lang = "en"): Map<string, CompoundEntrance[]> {
  const out = new Map<string, CompoundEntrance[]>()
  const idx = readIndex()
  for (const r of getAtlas(lang).reactions) {
    if (!r.hasFile || r.kind === "decay" || r.kind === "weak") continue
    // the two nuclei of the entrance channel (a neutron capture included, which has no Gamow window)
    const ch = entranceChannel(r)
    const pair = ch.pair ?? (ch.noteKey === "neutron" ? initialParticles(r).filter((x: { lepton: boolean }) => !x.lepton) : null)
    if (!pair || pair.length !== 2) continue
    const [a, b] = pair as { A: number; Z: number; code: string }[]
    const A = a.A + b.A
    const Z = a.Z + b.Z
    const compound = `${A}${symbolOf(Z)}`
    if (!fs.existsSync(path.join(DATA, "ensdf", `${compound}.json`))) continue
    const rIdx = atlasReactions(r.id)
    const key = rIdx.length ? idx.reactions.key[rIdx[0]] : null
    const ma = atomicMass(a)
    const mb = atomicMass(b)
    const cn = parseParticle(compound)
    const mc = cn ? atomicMass(cn) : null
    const separation = ma !== null && mb !== null && mc !== null ? (ma + mb - mc) * 931.49410242 : null
    const list = out.get(compound) ?? []
    list.push({ atlas: r.id, label: getReaction(r.id, lang)?.label ?? r.label, key, separation, projectile: b.code, target: a.code })
    out.set(compound, list)
  }
  return out
}

/** All index reactions whose target + projectile make `compound` (natural targets left out). */
export function reactionsInto(compound: string): number[] {
  const idx = readIndex()
  const out: number[] = []
  idx.reactions.key.forEach((key, r) => {
    if (compoundOf(key) === compound) out.push(r)
  })
  return out
}

export { gapRows }
export type { WindowMetrics }

/**
 * For each atlas entrance channel with an ENSDF compound nucleus: the number
 * of levels between its threshold and the top of its highest atlas Gamow
 * window with no measured ωγ (lib/data/resonances.ts). Uses the shard when
 * built; without it, only single-resonance strength sets of the index can
 * be matched, so the count is an upper bound there.
 */
export function levelsWithoutStrength(lang: Lang = "en"): Record<string, number> {
  const out: Record<string, number> = {}
  const idx = readIndex()
  for (const [nuclide, ents] of compoundNuclei(lang)) {
    const ensdf = readEnsdf(nuclide)
    if (!ensdf?.ensdf) continue
    for (const e of ents) {
      if (!e.key || e.separation === null) continue
      const r = getReaction(e.atlas, lang)
      if (!r) continue
      const rIdx = atlasReactions(e.atlas)
      const rows = gapRows(idx, rIdx)
      const ch = channelOf(e.key)
      const wins = atlasWindows(r, rows, ch)
      if (!wins.length) continue
      const top = Math.max(...wins.map((w) => w.hi))
      const slug = idx.reactions.slug[idx.reactions.key.indexOf(e.key)]
      const shard = readShard(slug)
      const strengths: Strength[] = shard
        ? strengthsOf(shard)
        : rows
            .filter((x) => x.q === "strength" && x.qs.includes("STR") && x.n === 1 && x.e0 !== null)
            .map((x) => ({ id: x.id, Er: (x.e0 as number) * 1000, value: 0, err: null, limit: null, year: x.y, author: x.a }))
      const lv = levelsInWindow(ensdf.ensdf.levels, e.separation * 1000, top, strengths)
      out[e.key] = lv.filter((l) => l.strengths.length === 0).length
    }
  }
  return out
}
