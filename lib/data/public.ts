/**
 * Everything the public data-explorer pages (/data, /data/path/*) show,
 * assembled at build time (server only: reads files) from
 *   - public/data/summary.json (lib/data/public-summary.mjs: per atlas
 *     reaction, the EXFOR datasets and the lowest energy measured),
 *   - the atlas (status, Gamow windows, names),
 *   - public/data/ensdf/*.json (the levels of a nucleus),
 *   - the rates explorer's networks (waiting times, from the same solver code
 *     the explorer runs in the browser).
 * Every number on the pages comes from here, formatted for the language; the
 * client gets plain strings and small arrays, never the index.
 */

import fs from "node:fs"
import path from "node:path"

import { getAtlas, getMapData, type GamowWindow, type MapCell, type Reaction, type Status } from "@/lib/atlas"
import { ELEMENTS, ELEMENT_NAMES, particleName } from "@/lib/atlas-core.mjs"
import { buildPublicSummary } from "@/lib/data/public-summary.mjs"
import type { Lang } from "@/lib/locale"
import { ratesHrefFor } from "@/lib/rates/catalog"
import { bottleneck, closes, dominantPath, pathStart } from "@/lib/rates/flow"
import { compiled } from "@/lib/rates/run"
import type { Network } from "@/lib/rates/schema"
import { lifetimes } from "@/lib/rates/solver"
import { duration } from "@/components/rates/format"
import { windowReach } from "@/lib/data/gap"
import { newerThanExfor, type Newer } from "@/lib/data/newer"

/* -- the summary ------------------------------------------------------------ */

export interface ReactionSummary {
  key: string
  slug: string
  datasets: number
  entries: number
  years: [number, number] | null
  luna: number
  lunaEntries: number
  measured: number
  lowest: {
    keV: number
    id: string
    author: string
    year: number | null
    luna: boolean
    /** quantity class of the first dataset (lib/data/lowest.mjs) */
    q?: string
    /** every dataset that reaches it within rounding, one per entry, earliest first */
    ties?: { id: string; author: string; year: number | null; luna: boolean }[]
  } | null
}

export interface PublicSummary {
  snapshot: { date: string; commit: string }
  attribution: { en: string; it: string; citation: string; license_url: string; repository: string }
  ensdf: { archive_date: string | null; citation: string }
  counts: { datasets: number; entries: number; points: number; reactions: number }
  reactions: Record<string, ReactionSummary>
}

const DATA = path.join(process.cwd(), "public", "data")
let summaryCache: PublicSummary | null = null

/** public/data/summary.json, or the same computed here when the prebuild has not run. */
export function getSummary(): PublicSummary {
  if (summaryCache) return summaryCache
  const file = path.join(DATA, "summary.json")
  const read = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : buildPublicSummary(DATA)
  summaryCache = (read ?? {
    snapshot: { date: "", commit: "" },
    attribution: { en: "", it: "", citation: "", license_url: "", repository: "" },
    ensdf: { archive_date: null, citation: "" },
    counts: { datasets: 0, entries: 0, points: 0, reactions: 0 },
    reactions: {},
  }) as PublicSummary
  return summaryCache
}

/* -- formatting ------------------------------------------------------------- */

/**
 * docs/STYLE.md: no separator under five digits, then a thin space in English
 * (`4900`, `89 804`, a narrow no-break space); the Italian output stays as it
 * was (`89.804`, groups from 10 000).
 */
export function group(n: number, lang: Lang): string {
  const v = String(Math.round(n))
  if (v.replace("-", "").length < 5) return v
  return v.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "it" ? "." : "\u202f")
}

const comma = (s: string, lang: Lang) => (lang === "it" ? s.replace(".", ",") : s)

/**
 * An energy given in keV, at two significant figures under 100 keV and as a
 * whole number above (149 keV, not 150): `6.1 keV`, `70 keV`, `2.1 MeV`.
 */
export function energy(keV: number, lang: Lang): string {
  const nb = " "
  if (keV >= 1000) return `${comma(String(Number((keV / 1000).toPrecision(2))), lang)}${nb}MeV`
  if (keV >= 100) return `${Math.round(keV)}${nb}keV`
  return `${comma(String(Number(keV.toPrecision(2))), lang)}${nb}keV`
}

/** `6.1 billion years`, `4,900 years`, in the rates explorer's words. */
export const waiting = (seconds: number, lang: Lang) => duration(seconds, lang)

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"
const sup = (n: number) => String(n).replace(/\d/g, (d) => SUP[Number(d)])

/** `²³Na`, for the eye; `sodium‑23` (particleName) is for the ear. */
export const nuclideLabel = (A: number, Z: number) => `${sup(A)}${ELEMENTS[Z]}`

/** The ENSDF summaries that exist (the atlas nuclei are committed). */
let ensdfCache: Set<string> | null = null
export function ensdfNuclides(): Set<string> {
  if (ensdfCache) return ensdfCache
  try {
    ensdfCache = new Set(
      fs
        .readdirSync(path.join(DATA, "ensdf"))
        .filter((f) => /^\d+[A-Z][a-z]?\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, "")),
    )
  } catch {
    ensdfCache = new Set()
  }
  return ensdfCache
}

/* -- links ------------------------------------------------------------------ */

/** The expert pages (built beside this one): by URL only. */
export const reactionDataPath = (slug: string) => `/data/reaction/${slug}`
export const nucleusPath = (code: string) => `/data/nucleus/${code}`

/* -- how well do we know it: the chart ---------------------------------------- */

export interface ChartArrow {
  id: string
  label: string
  plain: string
  status: Status
  importance: "key" | "major" | "minor"
  from: { N: number; Z: number }
  to: { N: number; Z: number }
  data: string | null
}

export interface StatusChart {
  arrows: ChartArrow[]
  cells: Pick<MapCell, "code" | "A" | "Z" | "N" | "symbol" | "stable" | "inNetwork">[]
  maxZ: number
  maxN: number
  /** Reactions with a status that are not on this chart (the s-process captures). */
  offChart: ChartArrow[]
}

export function statusChart(lang: Lang): StatusChart {
  const map = getMapData(lang)
  const summary = getSummary()
  const slug = (id: string) => summary.reactions[id]?.slug ?? null
  const arrows: ChartArrow[] = map.reactions
    .filter((r) => r.status && r.kind !== "decay")
    .map((r) => ({
      id: r.id,
      label: r.label,
      plain: r.plain,
      status: r.status!,
      importance: r.importance,
      from: { N: r.from.N, Z: r.from.Z },
      to: { N: r.to.N, Z: r.to.Z },
      data: slug(r.id),
    }))
  const onChart = new Set(arrows.map((a) => a.id))
  const offChart: ChartArrow[] = getAtlas(lang)
    .reactions.filter((r) => r.status && r.kind !== "decay" && r.from && r.to && !onChart.has(r.id))
    .map((r) => ({
      id: r.id,
      label: r.label,
      plain: r.plain,
      status: r.status!,
      importance: r.importance,
      from: { N: r.from!.N, Z: r.from!.Z },
      to: { N: r.to!.N, Z: r.to!.Z },
      data: slug(r.id),
    }))
  return {
    arrows,
    cells: map.cells.map(({ code, A, Z, N, symbol, stable, inNetwork }) => ({ code, A, Z, N, symbol, stable, inNetwork })),
    maxZ: map.maxZ,
    maxN: map.maxN,
    offChart,
  }
}

/* -- the gap ---------------------------------------------------------------- */

export interface GapRow {
  id: string
  label: string
  plain: string
  status: Status | null
  data: string | null
  /** The window shown: the first the atlas gives (its first network's first site). */
  site: string
  E0: number
  lo: number
  hi: number
  low: ReactionSummary["lowest"]
  /** "edge": the lowest point is only in the top of the window (windowReach) */
  kind: "never" | "above" | "edge" | "inside"
  /** lowest / E0, for "above" */
  factor: number
  datasets: number
  /** an atlas measurement below EXFOR's lowest point, not yet in EXFOR */
  newer: Newer | null
}

/** keV range of a window: E0 ± width/2, or the threshold-limited range. */
export function windowRange(w: GamowWindow): [number, number] {
  if (w.thresholdLimited && w.lo !== undefined && w.hi !== undefined) return [w.lo, w.hi]
  return [Math.max(w.E0 - w.width / 2, 0.01), w.E0 + w.width / 2]
}

function gapRow(r: Reaction, summary: PublicSummary, lang: Lang): GapRow | null {
  const w = r.gamow[0]
  if (!w || r.kind === "decay") return null
  const s = summary.reactions[r.id]
  const [lo, hi] = windowRange(w)
  const low = s?.lowest ?? null
  const kind: GapRow["kind"] = !low ? "never" : windowReach(low.keV, lo, hi)
  return {
    id: r.id,
    label: r.label,
    plain: r.plain,
    status: r.status,
    data: s?.slug ?? null,
    site: w.label,
    E0: w.E0,
    lo,
    hi,
    low,
    kind,
    factor: low ? low.keV / w.E0 : Infinity,
    datasets: s?.datasets ?? 0,
    newer: newerThanExfor(r.id, low?.keV ?? null, lang),
  }
}

/** The atlas reactions with a Gamow window, the widest gap first. */
export function gapRows(lang: Lang): GapRow[] {
  const summary = getSummary()
  const order = { never: 0, above: 1, edge: 2, inside: 3 }
  return getAtlas(lang)
    .reactions.map((r) => gapRow(r, summary, lang))
    .filter((x): x is GapRow => x !== null)
    .sort((a, b) => order[a.kind] - order[b.kind] || b.factor - a.factor || a.E0 - b.E0)
}

export function gapRowOf(id: string, lang: Lang): GapRow | null {
  const r = getAtlas(lang).reactions.find((x) => x.id === id)
  return r ? gapRow(r, getSummary(), lang) : null
}

/* -- waiting times, from the rates explorer's networks ------------------------ */

const RATES = path.join(process.cwd(), "public", "rates")
const nets = new Map<string, Network | null>()
function network(id: string): Network | null {
  if (!nets.has(id)) {
    const file = path.join(RATES, `${id}.json`)
    nets.set(id, fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Network) : null)
  }
  return nets.get(id) ?? null
}

export interface Waiting {
  /** s */
  tau: number
  /** the reaction that is the bottleneck of the scenario, by its label */
  bottleneck: string | null
  /** the next-slowest step on the same path: its nucleus's mean life against all the reactions that destroy it, s */
  nextTau: number | null
  /** that nucleus */
  nextNucleus: { Z: number; A: number; symbol: string } | null
  T9: number
  rho: number
}

/**
 * How long the target of `atlasId` waits for it in a scenario of the
 * explorer, as the explorer computes it (constant T and ρ, screening on, the
 * scenario's initial composition), and the scenario's bottleneck.
 */
export function waitingTime(net: string, site: string, atlasId: string): Waiting | null {
  const n = network(net)
  if (!n) return null
  const s = n.scenarios.find((x) => x.id === site)
  const k = n.reactions.findIndex((r) => r.atlas === atlasId)
  if (!s || k < 0) return null
  const c = compiled(n)
  const taus = lifetimes(c, { history: { kind: "constant", T9: s.T9, rho: s.rho }, screening: true }, s.X)
  let bn: string | null = null
  let nextTau: number | null = null
  let nextNucleus: Waiting["nextNucleus"] = null
  try {
    const base = JSON.parse(fs.readFileSync(path.join(RATES, `${net}.baseline.json`), "utf8"))
    const tBurn = base.runs[site].tFinal as number
    const cycle = (n.ui.cycle ?? []).map((x) => n.reactions.findIndex((r) => r.id === x)).filter((i) => i >= 0)
    const fuel = n.nuclei.findIndex((x) => x.name === n.ui.fuel)
    const start = pathStart(c, taus, cycle, tBurn, fuel)
    if (start !== undefined) {
      const p = dominantPath(c, taus, start)
      const b = bottleneck(p, taus, closes(c, p), cycle, tBurn, fuel)
      if (b.step) {
        bn = n.reactions[b.step.reaction].label
        const others = b.path.filter((x) => x.reaction !== b.step!.reaction)
        const next = others.length ? others.reduce((a, x) => (x.tau > a.tau ? x : a)) : null
        nextTau = next ? next.tau : null
        const nuc = next ? n.nuclei[next.nucleus] : null
        nextNucleus = nuc ? { Z: nuc.Z, A: nuc.A, symbol: nuc.label } : null
      }
    }
  } catch {
    // no baseline: the waiting time alone
  }
  return { tau: taus[k], bottleneck: bn, nextTau, nextNucleus, T9: s.T9, rho: s.rho }
}

/* -- inside the nucleus: a level scheme with the Gamow window --------------- */

export interface LevelTeaser {
  nuclide: string
  /** MeV */
  sp: number
  levels: { E: number; J: string }[]
  /** the window, MeV of excitation */
  wlo: number
  whi: number
  E0keV: number
  /** the level just below the threshold that matters (the highest bound one) */
  sub: number | null
  /** the first level above the threshold */
  res: number | null
  emin: number
  emax: number
}

/** `3/2+` → { J: 1.5, parity: 1 }; null for a tentative or ambiguous assignment. */
function spinParity(text: string | undefined): { J: number; parity: 1 | -1 } | null {
  const m = /^(\d+)(?:\/(2))?([+-])$/.exec((text ?? "").trim())
  if (!m) return null
  return { J: m[2] ? Number(m[1]) / 2 : Number(m[1]), parity: m[3] === "+" ? 1 : -1 }
}

/**
 * The level scheme of `nuclide` around the threshold of `reaction` (a proton
 * capture), with the reaction's first Gamow window. `sub` and `res` are the
 * levels a proton reaches without orbital angular momentum (s-wave: J one of
 * the channel spins I ± 1/2 of the target's ground state, same parity): the
 * highest one below the threshold and the first one above it. For ¹⁴N + p
 * those are the 6.79 and 7.56 MeV states of ¹⁵O, computed here from ENSDF.
 */
export function levelTeaser(nuclide = "15O", reaction = "14N-pg-15O"): LevelTeaser | null {
  const file = path.join(DATA, "ensdf", `${nuclide}.json`)
  if (!fs.existsSync(file)) return null
  const d = JSON.parse(fs.readFileSync(file, "utf8"))
  const sp: number = d.separation?.S_p ?? (d.ensdf?.Q?.S_p_keV ?? 0) / 1000
  const r = getAtlas("en").reactions.find((x) => x.id === reaction)
  const w = r?.gamow[0]
  if (!sp || !w || !r?.from) return null
  const [lo, hi] = windowRange(w)
  const emin = Math.max(0, sp - 1.3)
  const emax = sp + 1.1
  const levels: { E: number; J: string }[] = (d.ensdf?.levels ?? [])
    .filter((l: { E_keV?: number }) => typeof l.E_keV === "number" && l.E_keV / 1000 >= emin && l.E_keV / 1000 <= emax)
    .map((l: { E_keV: number; J?: string }) => ({ E: l.E_keV / 1000, J: l.J ?? "" }))
  // the target's ground state, for the s-wave channel spins
  let target: { J: number; parity: 1 | -1 } | null = null
  const tfile = path.join(DATA, "ensdf", `${r.from.code}.json`)
  if (fs.existsSync(tfile)) {
    const td = JSON.parse(fs.readFileSync(tfile, "utf8"))
    target = spinParity(td.ensdf?.levels?.[0]?.J)
  }
  const swave = (J: string) => {
    const sp_ = spinParity(J)
    if (!sp_ || !target) return false
    return sp_.parity === target.parity && (sp_.J === target.J + 0.5 || sp_.J === Math.abs(target.J - 0.5))
  }
  const below = levels.filter((l) => l.E < sp && swave(l.J))
  const above = levels.filter((l) => l.E > sp && swave(l.J))
  return {
    nuclide,
    sp,
    levels,
    wlo: sp + lo / 1000,
    whi: sp + hi / 1000,
    E0keV: w.E0,
    sub: below.length ? below[below.length - 1].E : null,
    res: above.length ? above[0].E : null,
    emin,
    emax,
  }
}

/** ENSDF levels of `nuclide` inside the window of `reactionId` (excitation, MeV). */
export function levelsInWindow(nuclide: string, reactionId: string, lang: Lang): { sp: number; inside: number[]; lo: number; hi: number } | null {
  const file = path.join(DATA, "ensdf", `${nuclide}.json`)
  const r = getAtlas(lang).reactions.find((x) => x.id === reactionId)
  if (!fs.existsSync(file) || !r?.gamow[0]) return null
  const d = JSON.parse(fs.readFileSync(file, "utf8"))
  const sp: number = d.separation?.S_p
  const [lo, hi] = windowRange(r.gamow[0])
  const inside = (d.ensdf?.levels ?? [])
    .map((l: { E_keV?: number }) => (l.E_keV ?? NaN) / 1000)
    .filter((E: number) => E >= sp + lo / 1000 && E <= sp + hi / 1000)
  return { sp, inside, lo, hi }
}

/* -- search by element ------------------------------------------------------ */

export interface ElementReaction {
  id: string
  label: string
  plain: string
  status: Status | null
  href: string
  data: string | null
  rates: string | null
}

export interface ElementIsotope {
  code: string
  label: string
  plain: string
  file: string | null
  reactions: ElementReaction[]
}

export interface ElementEntry {
  Z: number
  symbol: string
  en: string
  it: string
  isotopes: ElementIsotope[]
}

/** Each element the atlas touches, with its isotopes and their reactions (no decays). */
export function elementIndex(lang: Lang): ElementEntry[] {
  const atlas = getAtlas(lang)
  const summary = getSummary()
  const ensdf = ensdfNuclides()
  const isotopes = new Map<string, ElementIsotope & { Z: number; A: number }>()
  const iso = (n: { code: string; A: number; Z: number }) => {
    let e = isotopes.get(n.code)
    if (!e) {
      e = {
        code: n.code,
        Z: n.Z,
        A: n.A,
        label: nuclideLabel(n.A, n.Z),
        plain: particleName(n, lang) as string,
        file: ensdf.has(n.code) ? nucleusPath(n.code) : null,
        reactions: [],
      }
      isotopes.set(n.code, e)
    }
    return e
  }
  for (const r of atlas.reactions) {
    if (!r.from || !r.to || r.kind === "decay") continue
    const entry: ElementReaction = {
      id: r.id,
      label: r.label,
      plain: r.plain,
      status: r.status,
      href: `/atlas/${r.id}`,
      data: summary.reactions[r.id] ? reactionDataPath(summary.reactions[r.id].slug) : null,
      rates: ratesHrefFor(r.id),
    }
    for (const end of [r.from, r.to]) {
      if (end.Z < 1) continue
      const e = iso(end)
      if (!e.reactions.some((x) => x.id === r.id)) e.reactions.push(entry)
    }
  }
  const byZ = new Map<number, ElementEntry>()
  for (const e of [...isotopes.values()].sort((a, b) => a.Z - b.Z || a.A - b.A)) {
    let el = byZ.get(e.Z)
    if (!el) {
      el = { Z: e.Z, symbol: ELEMENTS[e.Z], en: ELEMENT_NAMES.en[e.Z], it: ELEMENT_NAMES.it[e.Z], isotopes: [] }
      byZ.set(e.Z, el)
    }
    const { Z: _z, A: _a, ...rest } = e
    el.isotopes.push(rest)
  }
  return [...byZ.values()]
}

/* -- the counts the stories use --------------------------------------------- */

export function undergroundCounts(): { datasets: number; reactions: number; lowest: number } {
  const rs = Object.values(getSummary().reactions)
  return {
    datasets: rs.reduce((a, r) => a + r.luna, 0),
    reactions: rs.filter((r) => r.luna > 0).length,
    lowest: rs.filter((r) => r.lowest?.luna).length,
  }
}

/** The ids of the atlas reactions with a LUNA dataset, in atlas order. */
export function lunaReactionIds(): string[] {
  const s = getSummary().reactions
  return getAtlas("en").reactions.filter((r) => (s[r.id]?.luna ?? 0) > 0).map((r) => r.id)
}

/** `Bemmerer et al., 2006` */
export function who(low: NonNullable<ReactionSummary["lowest"]>): { name: string; year: string } {
  return { name: low.author, year: low.year ? String(low.year) : "" }
}

/**
 * Who reached the lowest measured energy, earliest first, up to `max` names:
 * `Cavanna et al., 2015, LUNA; Depalo et al., 2016, LUNA and 3 more`.
 */
export function credit(low: NonNullable<ReactionSummary["lowest"]>, lang: Lang, max = 2): string {
  const all = low.ties?.length ? low.ties : [low]
  const luna = lang === "it" ? "LUNA, sotto terra" : "LUNA, underground"
  const names = all.slice(0, max).map((x) => [x.author, x.year, x.luna ? luna : ""].filter(Boolean).join(", "))
  const more = all.length - max
  return names.join("; ") + (more > 0 ? (lang === "it" ? ` e altre ${more}` : ` and ${more} more`) : "")
}
