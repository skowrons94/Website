/**
 * Geometry and bookkeeping for the level diagram (components/level-diagram.tsx).
 *
 * Kept free of React so the decisions that make the figure readable — where
 * the energy axis breaks, which levels are background poles, how labels are
 * pushed apart, what a level's total width is — can be read (and changed) in
 * one place, apart from the drawing.
 */

import type { DataSegment, SchemeLevel, SchemePair } from "@/lib/api"
import { texPlain } from "@/components/tex"
import { linearTicks } from "@/lib/ticks"

/* -- identity --------------------------------------------------------------- */

/**
 * A level's key, `"<jgroup>-<level>"`: what `selectedLevel` / `onSelectLevel`
 * carry between the diagram, the level table and the sliders.
 */
export function levelKey(level: Pick<SchemeLevel, "jgroup" | "level">): string {
  return `${level.jgroup}-${level.level}`
}

/** Sort key for J^pi: by spin, then parity (1/2− before 1/2+ before 3/2−). */
export function jpiOrder(jpi: string): number {
  const match = jpi.match(/^(\d+)(?:\/(\d+))?([+-])$/)
  if (!match) return 0
  const spin = Number(match[1]) / (match[2] ? Number(match[2]) : 1)
  return spin * 2 + (match[3] === "+" ? 1 : 0)
}

/** `"3/2-"` → `"3/2⁻"`: J^pi as plain text with a superscript parity. */
export function jpiPlain(jpi: string): string {
  return jpi.replace(/\+$/, "⁺").replace(/-$/, "⁻")
}

/** Level energies at one precision across a scheme (keV, i.e. 3 decimals). */
export function formatLevelEnergy(energy: number): string {
  if (!Number.isFinite(energy)) return ""
  if (Math.abs(energy) < 5e-4) return "0"
  return energy.toFixed(3).replace("-", "−")
}

/* -- status ----------------------------------------------------------------- */

/**
 * `free`: the energy is a fit parameter. `partial`: the energy is fixed but a
 * width or ANC is fitted. `fixed`: nothing about the level is varied.
 */
export type LevelStatus = "free" | "partial" | "fixed"

export function levelStatus(level: SchemeLevel): LevelStatus {
  if (!level.energy_fixed) return "free"
  return level.channels.some((c) => !c.fixed) ? "partial" : "fixed"
}

/** True when any channel of the level is parametrised by an ANC (below its threshold). */
export function hasAnc(level: SchemeLevel): boolean {
  return level.channels.some((c) => c.quantity === "anc")
}

/* -- nuclide names ---------------------------------------------------------- */

const ELEMENTS = [
  "n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si",
  "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu",
  "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
]

const SUPER_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹"

function superscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUPER_DIGITS[Number(d)] ?? d)
    .join("")
}

/** `(6, 12.0)` → `"¹²C"`; null when the element is unknown. */
export function nuclide(Z: number, M: number): string | null {
  const symbol = ELEMENTS[Z]
  if (!symbol || !(M > 0)) return null
  const A = Math.round(M)
  if (Z === 1 && A === 1) return "p"
  if (Z === 2 && A === 4) return "α"
  return `${superscript(A)}${symbol}`
}

/* -- thresholds ------------------------------------------------------------- */

/** What a caller may pass: one particle pair's threshold. */
export interface ThresholdInput {
  /** The pair, as LaTeX (`p`, `^{6}\text{Li} + p_{0}`) or plain text (`p + ¹²C`). */
  label: string
  /** Separation energy S, MeV. */
  separation: number
  /** Excitation of the residual nucleus, MeV (0 for the ground state). */
  excitation?: number
  entrance?: boolean
}

export interface Threshold {
  key: string
  /** Plain Unicode text of the pair, e.g. `p + ¹²C`, `α₁ + ²⁰Ne*`. */
  pair: string
  /** Subscript for S, e.g. `p`, `α`, `³He`. */
  particle: string
  separation: number
  excitation: number
  /** Where the threshold sits on the E_x axis: S + residual excitation. */
  energy: number
  entrance: boolean
  /** Species (pair without its excited-state index): drives the channel hue. */
  species: string
}

/** Drop a trailing `₀`, `₁`… so p₀ and p₁ share a species and a hue. */
function speciesOf(text: string): string {
  return text.replace(/[₀-₉]+/g, "").replace(/\*/g, "").trim()
}

/** Thresholds from the scheme's pairs (particle pairs only). */
export function thresholdsFromPairs(pairs: SchemePair[] | undefined): Threshold[] {
  if (!pairs) return []
  const out: Threshold[] = []
  for (const pair of pairs) {
    if (pair.is_photon) continue
    const label = texPlain(pair.label)
    const light = nuclide(pair.Z1, pair.M1)
    const heavy = nuclide(pair.Z2, pair.M2)
    const excited = pair.excitation > 1e-6
    let text: string
    let particle: string
    if (label.includes("+")) {
      text = label
      particle = speciesOf(label.split("+")[0])
      // "⁶Li + p₀": the light particle is the second one written.
      if (light && label.split("+")[1]?.includes(light)) particle = light
      if (excited && !text.includes("*")) {
        text = text.replace(/(^|\s)([^\s+]*[A-Z][a-z]?)(\s|$)/, "$1$2*$3")
      }
    } else {
      const residual = heavy ? `${heavy}${excited ? "*" : ""}` : ""
      text = residual ? `${label} + ${residual}` : label
      particle = speciesOf(label)
    }
    out.push({
      key: `pair-${pair.number}`,
      pair: text,
      particle,
      separation: pair.separation_energy,
      excitation: pair.excitation,
      energy: pair.separation_energy + pair.excitation,
      entrance: pair.is_entrance,
      species: speciesOf(label.includes("+") ? label : `${label} + ${heavy ?? ""}`),
    })
  }
  return out
}

/** Thresholds a caller passed in, in the same shape. */
export function normaliseThresholds(input: ThresholdInput[]): Threshold[] {
  return input.map((t, i) => {
    const pair = /[\\^_{}]/.test(t.label) ? texPlain(t.label) : t.label
    const excitation = t.excitation ?? 0
    return {
      key: `thr-${i}`,
      pair,
      particle: speciesOf(pair.split("+")[0] ?? pair),
      separation: t.separation,
      excitation,
      energy: t.separation + excitation,
      entrance: Boolean(t.entrance),
      species: speciesOf(pair),
    }
  })
}

/** The entrance channel whose E_c.m. the secondary axis shows: the first entrance pair. */
export function entranceOf(thresholds: Threshold[]): Threshold | null {
  return (
    thresholds.find((t) => t.entrance && t.excitation < 1e-6) ??
    thresholds.find((t) => t.entrance) ??
    null
  )
}

/* -- widths ----------------------------------------------------------------- */

export interface WidthPart {
  /** Species label (plain text): channel hue and legend entry. */
  species: string
  photon: boolean
  /** Sum of |Γ_c| over the channels of this species, MeV. */
  gamma: number
}

export interface LevelWidth {
  /** Total width Γ = Σ|Γ_c|, MeV (0 when no channel carries a width). */
  total: number
  parts: WidthPart[]
}

/**
 * The level's total width from its partial widths.
 *
 * AZURE2 reports, per channel, either a partial width Γ_c in eV (signed: the
 * sign is that of the reduced-width amplitude), an ANC for a channel the level
 * lies below, or an electromagnetic moment for a photon channel feeding the
 * level itself. Only the widths add up to Γ; ANCs and moments do not.
 */
export function levelWidth(level: SchemeLevel, pairs?: SchemePair[]): LevelWidth {
  const byPair = new Map<number, SchemePair>((pairs ?? []).map((p) => [p.number, p]))
  const parts = new Map<string, WidthPart>()
  let total = 0
  for (const channel of level.channels) {
    if (channel.quantity !== "width" || channel.unit !== "eV") continue
    const value = Math.abs(channel.width) / 1e6
    if (!(value > 0)) continue
    const pair = byPair.get(channel.pair)
    const species = channel.is_photon
      ? "γ"
      : speciesOf(pair ? pairSpecies(pair) : texPlain(channel.label))
    const part = parts.get(species) ?? { species, photon: channel.is_photon, gamma: 0 }
    part.gamma += value
    parts.set(species, part)
    total += value
  }
  return { total, parts: [...parts.values()] }
}

function pairSpecies(pair: SchemePair): string {
  const label = texPlain(pair.label)
  if (label.includes("+")) return label
  return `${label} + ${nuclide(pair.Z2, pair.M2) ?? ""}`
}

/**
 * Species in a stable order (particle pairs as listed, photons last): their
 * index picks the hue, so the same species has the same colour in every bar.
 */
export function speciesList(pairs: SchemePair[] | undefined): string[] {
  const seen: string[] = []
  for (const pair of pairs ?? []) {
    if (pair.is_photon) continue
    const species = speciesOf(pairSpecies(pair))
    if (!seen.includes(species)) seen.push(species)
  }
  return seen
}

/* -- background poles ------------------------------------------------------- */

export interface Background {
  energy: number
  keys: Set<string>
}

/**
 * Background poles: the usual R-matrix device of distant, fixed levels — one
 * per J^pi, all at one energy far above the resonances. Drawn to scale they
 * squash every real level into the bottom of the frame, so they are collapsed
 * above an axis break with one label.
 */
export function findBackground(levels: SchemeLevel[]): Background | null {
  if (levels.length < 3) return null
  const top = Math.max(...levels.map((l) => l.energy))
  const atTop = levels.filter((l) => l.energy > top - 0.5)
  const rest = levels.filter((l) => l.energy <= top - 0.5)
  if (atTop.length < 2 || rest.length === 0) return null
  if (!atTop.every((l) => l.energy_fixed)) return null
  const restMax = Math.max(...rest.map((l) => l.energy))
  if (top - restMax < Math.max(2, 0.25 * (restMax - Math.min(0, ...rest.map((l) => l.energy))))) {
    return null
  }
  return { energy: top, keys: new Set(atTop.map(levelKey)) }
}

/* -- the broken energy axis ------------------------------------------------- */

export interface AxisSegment {
  /** Energy range drawn, MeV (padded). */
  lo: number
  hi: number
  /** Pixel rows: `bottom` maps `lo`, `top` maps `hi` (top < bottom). */
  top: number
  bottom: number
  /** A segment holding only thresholds that lie away from the levels. */
  auxiliary: boolean
}

export interface EnergyAxis {
  segments: AxisSegment[]
  /** Pixel row of an energy (clamped into the nearest segment). */
  y: (energy: number) => number
  /** The segment an energy falls in, or null when it lies in a break. */
  segmentOf: (energy: number) => AxisSegment | null
  /** Energy at a pixel row, or null inside a break. */
  invert: (y: number) => number | null
  top: number
  bottom: number
}

/** Pixel gap left between two segments at an axis break. */
export const BREAK_GAP = 14
/** Least height of a segment that holds a single level or a few thresholds. */
const MIN_SEGMENT = 30

interface Cluster {
  lo: number
  hi: number
  auxiliary: boolean
}

/**
 * Split the points of interest into clusters wherever a gap is both large in
 * MeV and large against what remains: removing it then gains real height.
 */
function cluster(points: number[], minGap: number, fraction: number): Cluster[] {
  const sorted = [...new Set(points.filter(Number.isFinite))].sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const cuts = new Set<number>()
  for (;;) {
    // Spans of the clusters the current cuts make.
    let span = 0
    let start = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      if (cuts.has(i)) {
        span += sorted[i - 1] - start
        start = sorted[i]
      }
    }
    span += sorted[sorted.length - 1] - start
    let best = -1
    let gap = 0
    for (let i = 1; i < sorted.length; i++) {
      if (cuts.has(i)) continue
      const g = sorted[i] - sorted[i - 1]
      if (g > gap) {
        gap = g
        best = i
      }
    }
    if (best < 0 || gap < Math.max(minGap, fraction * (span - gap > 0 ? span - gap : span))) break
    cuts.add(best)
  }
  const out: Cluster[] = []
  let lo = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (cuts.has(i)) {
      out.push({ lo, hi: sorted[i - 1], auxiliary: false })
      lo = sorted[i]
    }
  }
  out.push({ lo, hi: sorted[sorted.length - 1], auxiliary: false })
  return out
}

export interface AxisInput {
  /** Energies that must be on scale: levels, the data range, the entrance threshold. */
  core: number[]
  /** Energies drawn if they fit (other thresholds): near a cluster they join it, else they get a compact segment of their own. */
  extra: number[]
  top: number
  bottom: number
  /** Force one linear segment over this range (zoom). */
  zoom?: [number, number] | null
}

export function buildAxis({ core, extra, top, bottom, zoom }: AxisInput): EnergyAxis {
  let clusters: Cluster[]
  if (zoom) {
    clusters = [{ lo: zoom[0], hi: zoom[1], auxiliary: false }]
  } else {
    clusters = cluster(core.length ? core : [0, 1], 2, 0.35)
    // Thresholds next to a cluster join it; the others are gathered into
    // compact segments of their own between the clusters they fall between.
    const loose: number[] = []
    for (const e of [...new Set(extra)].sort((a, b) => a - b)) {
      const near = clusters.find(
        (c) => e >= c.lo - Math.max(0.4, 0.15 * (c.hi - c.lo)) && e <= c.hi + Math.max(0.4, 0.15 * (c.hi - c.lo)),
      )
      if (near) {
        near.lo = Math.min(near.lo, e)
        near.hi = Math.max(near.hi, e)
      } else loose.push(e)
    }
    for (const group of cluster(loose, 3, 0.5)) {
      clusters.push({ ...group, auxiliary: true })
    }
    clusters.sort((a, b) => a.lo - b.lo)
    // Merge anything that now overlaps or touches.
    const merged: Cluster[] = []
    for (const c of clusters) {
      const last = merged[merged.length - 1]
      if (last && c.lo - last.hi < 0.6) {
        last.hi = Math.max(last.hi, c.hi)
        last.auxiliary = last.auxiliary && c.auxiliary
      } else merged.push({ ...c })
    }
    clusters = merged
  }

  // Pad each cluster so nothing sits on a break, then share the height:
  // compact segments get a fixed slice, the rest in proportion to their span.
  const padded = clusters.map((c) => {
    const span = c.hi - c.lo
    const pad = zoom ? 0 : Math.max(0.06 * span, span > 0 ? 0.12 : 0.25)
    return { ...c, lo: c.lo - pad, hi: c.hi + pad }
  })
  const total = bottom - top - BREAK_GAP * Math.max(0, padded.length - 1)
  const compact = (c: Cluster) => c.auxiliary || c.hi - c.lo <= 0.55
  let heights: number[] = padded.map((c) => (compact(c) ? MIN_SEGMENT : 0))
  const flexible = padded.filter((c) => !compact(c))
  const fixedTotal = heights.reduce((a, b) => a + b, 0)
  const spanTotal = flexible.reduce((a, c) => a + (c.hi - c.lo), 0)
  if (flexible.length === 0) {
    // Only compact segments: share the height evenly.
    heights = padded.map(() => total / padded.length)
  } else {
    heights = padded.map((c, i) =>
      compact(c) ? heights[i] : ((total - fixedTotal) * (c.hi - c.lo)) / spanTotal,
    )
    // A short flexible segment still deserves the compact minimum.
    for (let pass = 0; pass < 3; pass++) {
      const short = heights.map((h, i) => !compact(padded[i]) && h < MIN_SEGMENT * 1.4)
      if (!short.some(Boolean)) break
      const pinned = heights.reduce((a, h, i) => a + (compact(padded[i]) || short[i] ? (short[i] ? MIN_SEGMENT * 1.4 : h) : 0), 0)
      const freeSpan = padded.reduce((a, c, i) => a + (!compact(c) && !short[i] ? c.hi - c.lo : 0), 0)
      heights = heights.map((h, i) =>
        compact(padded[i]) ? h : short[i] ? MIN_SEGMENT * 1.4 : ((total - pinned) * (padded[i].hi - padded[i].lo)) / (freeSpan || 1),
      )
    }
  }

  const segments: AxisSegment[] = []
  let cursor = bottom
  padded.forEach((c, i) => {
    const h = heights[i]
    segments.push({ lo: c.lo, hi: c.hi, bottom: cursor, top: cursor - h, auxiliary: c.auxiliary })
    cursor -= h + BREAK_GAP
  })

  const map = (s: AxisSegment, e: number) =>
    s.hi === s.lo ? (s.top + s.bottom) / 2 : s.bottom - ((e - s.lo) / (s.hi - s.lo)) * (s.bottom - s.top)

  const segmentOf = (e: number) => segments.find((s) => e >= s.lo - 1e-9 && e <= s.hi + 1e-9) ?? null

  const y = (e: number) => {
    const s = segmentOf(e)
    if (s) return map(s, e)
    // In a break: clamp to the nearer edge of the segment below/above.
    const below = [...segments].reverse().find((seg) => seg.hi < e)
    const above = segments.find((seg) => seg.lo > e)
    if (below && above) return e - below.hi < above.lo - e ? below.top : above.bottom
    if (below) return below.top
    if (above) return above.bottom
    return bottom
  }

  const invert = (py: number) => {
    const s = segments.find((seg) => py >= seg.top - 0.5 && py <= seg.bottom + 0.5)
    if (!s) return null
    return s.lo + ((s.bottom - py) / (s.bottom - s.top)) * (s.hi - s.lo)
  }

  return { segments, y, segmentOf, invert, top: cursor + BREAK_GAP, bottom }
}

/** Round ticks inside one segment, about one per 46 px. */
export function segmentTicks(segment: AxisSegment, offset = 0): number[] {
  const height = segment.bottom - segment.top
  if (height < 26) return []
  const lo = segment.lo - offset
  const hi = segment.hi - offset
  const target = Math.max(1, Math.min(8, Math.floor(height / 46)))
  return linearTicks(lo, hi, target).ticks.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9)
}

/* -- labels ----------------------------------------------------------------- */

/**
 * One-dimensional label placement: every label is kept, as near its level as
 * the others allow. Overlapping labels are merged into blocks spaced by `gap`
 * and centred on their levels, then each block is kept within [lo, hi].
 * Returns the label rows by key.
 */
export function spreadLabels(
  items: { key: string; y: number }[],
  gap: number,
  lo: number,
  hi: number,
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.y - b.y)
  interface Block {
    keys: string[]
    targets: number[]
    start: number
  }
  const blocks: Block[] = sorted.map((item) => ({ keys: [item.key], targets: [item.y], start: item.y }))
  const place = (b: Block) => {
    // Centre the block on the mean of what it holds.
    const mean = b.targets.reduce((a, t, i) => a + t - i * gap, 0) / b.targets.length
    const size = (b.keys.length - 1) * gap
    b.start = Math.min(Math.max(mean, lo), Math.max(lo, hi - size))
  }
  blocks.forEach(place)
  for (let changed = true; changed; ) {
    changed = false
    for (let i = 1; i < blocks.length; i++) {
      const prev = blocks[i - 1]
      const cur = blocks[i]
      if (prev.start + prev.keys.length * gap > cur.start + 1e-6) {
        prev.keys.push(...cur.keys)
        prev.targets.push(...cur.targets)
        blocks.splice(i, 1)
        place(prev)
        changed = true
        break
      }
    }
  }
  const out = new Map<string, number>()
  for (const b of blocks) b.keys.forEach((key, i) => out.set(key, b.start + i * gap))
  return out
}

/* -- the fitted-data range -------------------------------------------------- */

/**
 * The excitation-energy range the active data cover. Segment energies are
 * centre-of-mass energies in their entrance pair (AZURE2 output), so
 * E_x = E_c.m. + S + E_x(residual) of that pair.
 */
export function dataRangeFromSegments(
  segments: DataSegment[] | null | undefined,
  pairs: SchemePair[] | undefined,
): { min: number; max: number } | null {
  if (!segments || !pairs) return null
  const byNumber = new Map(pairs.map((p) => [p.number, p]))
  let min = Infinity
  let max = -Infinity
  for (const segment of segments) {
    if (!segment.active || !segment.energies?.length) continue
    const pair = byNumber.get(segment.entrance_key)
    if (!pair || pair.is_photon) continue
    const offset = pair.separation_energy + pair.excitation
    for (const e of segment.energies) {
      if (!Number.isFinite(e)) continue
      min = Math.min(min, e + offset)
      max = Math.max(max, e + offset)
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}
