/**
 * What a data segment can be plotted as, and what to call it.
 *
 * An astrophysical S-factor folds the Coulomb barrier out of a *reaction*
 * cross section; for elastic scattering it is not defined, and multiplying a
 * Rutherford-dominated dσ/dΩ by the Gamow factor gives numbers in the 10⁴
 * "MeV b" that mean nothing. So a scattering segment is always shown as the
 * cross section it is, whatever quantity the toolbar asks for — or, for elastic
 * dσ/dΩ, as a ratio to the Rutherford cross section.
 *
 * An angular distribution (one energy, many angles) is plotted against the
 * c.m. angle, as dσ/dΩ: drawn against energy it would collapse into a column
 * of points at one abscissa.
 *
 * Measured points are drawn as AZURE2 compares them with the model: scaled by
 * the segment's normalisation n (data × n, error × n), the same convention
 * the residuals and χ² use.
 */

import { texPlain } from "@/components/tex"
import type { DataSegment, FineCurve, SchemePair } from "@/lib/api"
import type { Lang } from "@/lib/i18n"
import { rutherford, type CoulombPair } from "@/lib/rutherford"
import { quantityLabel } from "@/lib/viz"

export type Quantity = "sfactor" | "cross_section" | "rutherford"
export type XKind = "energy" | "angle"

/** A segment the S-factor does not apply to. */
export function isScattering(segment: Pick<DataSegment, "elastic" | "entrance_key" | "exit_key" | "observable">) {
  if (segment.observable === "phase-shift") return true
  if (segment.elastic !== undefined) return segment.elastic
  // An older API without the flag: same pair in and out is elastic.
  return segment.entrance_key === segment.exit_key
}

const finite = (values: (number | null | undefined)[] | null | undefined): number[] =>
  (values ?? []).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v))

/**
 * An angular distribution: a differential segment whose points share one
 * energy and spread over angles.
 */
export function isAngular(segment: DataSegment): boolean {
  if (!segment.observable.startsWith("differential")) return false
  const e = finite(segment.energies)
  const a = finite(segment.angles)
  if (e.length < 3 || a.length < 3) return false
  const eLo = Math.min(...e)
  const eHi = Math.max(...e)
  return eHi - eLo <= 1e-3 * Math.max(Math.abs(eHi), 1e-3) && Math.max(...a) - Math.min(...a) > 2
}

/** What the segment is plotted against. */
export function xKind(segment: DataSegment): XKind {
  return isAngular(segment) ? "angle" : "energy"
}

/** Elastic dσ/dΩ: a segment that can be divided by the Rutherford cross section. */
export function hasRutherford(segment: DataSegment): boolean {
  return isScattering(segment) && segment.observable.startsWith("differential")
}

/** The quantity actually drawn for a segment, given the one asked for. */
export function quantityFor(segment: DataSegment, asked: Quantity): Quantity {
  if (asked === "rutherford") return hasRutherford(segment) ? "rutherford" : "cross_section"
  if (isAngular(segment)) return "cross_section"
  return isScattering(segment) ? "cross_section" : asked
}

/* -- units ------------------------------------------------------------------- */

/** A display unit: values in the API's unit are multiplied by `factor`. */
export interface DisplayUnit {
  factor: number
  unit: string
}

const PREFIXES = [
  { factor: 1, p: "" },
  { factor: 1e3, p: "m" },
  { factor: 1e6, p: "μ" },
  { factor: 1e9, p: "n" },
  { factor: 1e12, p: "p" },
]

/**
 * The unit a set of values reads best in: keV b or MeV b for an S-factor
 * (keV b unless something reaches 1 MeV b), b, mb, μb, … for a cross section
 * (the largest value is ≥ 1 in it). One unit per plot, used by the axis, the
 * tooltip and every readout.
 */
export function pickUnit(quantity: Quantity, observable: string, values: number[]): DisplayUnit {
  if (quantity === "rutherford") return { factor: 1, unit: "" }
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)).map(Math.abs))
  if (quantity === "sfactor") return max >= 1 || max === 0 ? { factor: 1, unit: "MeV b" } : { factor: 1e3, unit: "keV b" }
  const base = observable.startsWith("differential") ? "b/sr" : "b"
  if (max === 0) return { factor: 1, unit: base }
  const chosen = PREFIXES.find((p) => max * p.factor >= 1) ?? PREFIXES[PREFIXES.length - 1]
  return { factor: chosen.factor, unit: chosen.p + base }
}

/** The S-factor unit for one value (readouts outside a plot): keV b below 1 MeV b. */
export function sfactorUnit(valueMeVb: number): DisplayUnit {
  return Math.abs(valueMeVb) >= 1 ? { factor: 1, unit: "MeV b" } : { factor: 1e3, unit: "keV b" }
}

/** Y-axis title for a segment drawn as `asked`, in `unit`. */
export function axisLabel(segment: DataSegment, asked: Quantity, lang: Lang, unit?: DisplayUnit): string {
  const q = quantityFor(segment, asked)
  if (q === "rutherford") return "σ/σ(Rutherford)"
  return quantityLabel(q, segment.observable, lang, unit?.unit)
}

/* -- names ------------------------------------------------------------------- */

/** Readable dataset name, without its qualifier ("Kettner"). */
export function datasetName(segment: DataSegment): string {
  return segment.label || segment.name
}

/**
 * The angles a differential segment's points were measured at, from the data
 * themselves (centre of mass, as AZURE2 reports them). The segment's own
 * angle limits are only a filter — a segment written "0–180" may hold points
 * at 90° alone — so they are not what to show.
 */
export function dataAngles(segment: DataSegment): { min: number; max: number } | null {
  if (!segment.observable.startsWith("differential")) return null
  const values = finite(segment.angles)
  if (values.length === 0) return { min: segment.angle_min, max: segment.angle_max }
  return { min: Math.min(...values), max: Math.max(...values) }
}

/** "90°" or "40–60°" for a differential segment, "" otherwise. */
export function angleText(segment: DataSegment): string {
  const a = dataAngles(segment)
  if (!a) return ""
  const fmt = (v: number) => `${Number(v.toFixed(1))}`
  // A capture angle moves by a fraction of a degree between lab and c.m. as
  // the energy changes; that is one angle, not a range.
  return a.max - a.min < 0.5 ? `${fmt((a.min + a.max) / 2)}°` : `${fmt(a.min)}–${fmt(a.max)}°`
}

/** "1.234 MeV": the c.m. energy of an angular distribution. */
export function energyText(segment: DataSegment, lang: Lang): string {
  const e = finite(segment.energies)
  if (e.length === 0) return ""
  const v = e.reduce((s, x) => s + x, 0) / e.length
  const s = v >= 10 ? v.toFixed(2) : v.toFixed(3)
  return `${lang === "it" ? s.replace(".", ",") : s} MeV`
}

/**
 * The reaction a segment measures, entrance channel included: "⁶Li(p,α)",
 * "¹²C(p,p)", "¹⁶O(p,γ₁)" for capture to one final state, "¹⁶O(p,γ) total".
 * The residual nucleus is left out: the evaluation's title names it.
 */
export function reactionText(segment: DataSegment, lang: Lang = "en"): string {
  const r = segment.reaction
  if (!r) return segment.exit_key !== segment.entrance_key ? `→ ${texPlain(segment.exit)}` : ""
  const head = r.slice(0, r.indexOf(")") + 1) || r
  if (segment.exit_key === -1) return `${head} ${lang === "it" ? "totale" : "total"}`
  const exit = texPlain(segment.exit)
  // A capture to one of several final states: γ₀, γ₁, … in place of γ.
  if (segment.capture && /^γ.+/.test(exit)) return head.replace(",γ)", `,${exit})`)
  return head
}

/**
 * What tells this segment apart from others of the same dataset: the
 * reaction, and the angle of a differential measurement (or the energy of an
 * angular distribution).
 */
export function qualifier(segment: DataSegment, lang: Lang = "en"): string {
  const bits: string[] = []
  const reaction = reactionText(segment, lang)
  if (reaction) bits.push(reaction)
  if (isAngular(segment)) bits.push(energyText(segment, lang))
  else {
    const angle = angleText(segment)
    if (angle) bits.push(angle)
  }
  return bits.join(" · ")
}

/** Name plus qualifier, as one line of text (legends, aria labels). */
export function segmentTitle(segment: DataSegment, lang: Lang = "en"): string {
  const q = qualifier(segment, lang)
  return q ? `${datasetName(segment)} · ${q}` : datasetName(segment)
}

/* -- what to open on ----------------------------------------------------------- */

/** Pooled χ²/N (Σχ² / ΣN) of some segments, as the Data table computes it. */
export function pooledChi2(segments: DataSegment[]): number | null {
  let chi2 = 0
  let n = 0
  for (const s of segments) {
    if (s.chi2 === null) continue
    const points = s.chi2_points ?? s.n_points
    chi2 += s.chi2_sum ?? s.chi2 * points
    n += points
  }
  return n > 0 ? chi2 / n : null
}

const strip = (s: string) => s.normalize("NFKC").replace(/\s+/g, "")

/**
 * The segments a plot should open on: those of the evaluation's headline
 * reaction (its first listed one), preferring datasets the model actually
 * fits (χ²/N ≤ 5) and, among them, the widest energy coverage — so the view
 * reaches the resonances rather than one narrow low-energy set. Up to three
 * segments of one observable, adding one only where it extends the energy
 * range; never an angular distribution unless nothing else is there.
 */
export function defaultSelection(data: DataSegment[], headline?: string | null, resonances: number[] = []): number[] {
  const usable = data.filter((s) => s.active && (s.n_points ?? 0) > 0)
  // The headline reaction's own segments, elastic scattering included when
  // that is what the evaluation is about (⁸Be, ²⁴Mg).
  let pool = headline ? usable.filter((s) => s.reaction && strip(s.reaction) === strip(headline)) : []
  if (pool.length === 0) pool = usable.filter((s) => !isScattering(s))
  if (pool.length === 0) pool = usable
  if (pool.length === 0) {
    const first = data.find((s) => s.active) ?? data[0]
    return first ? [first.index] : []
  }
  const fits = pool.filter((s) => s.chi2 === null || s.chi2 <= 5)
  if (fits.length > 0) pool = fits
  const energySegments = pool.filter((s) => !isAngular(s))
  if (energySegments.length > 0) pool = energySegments

  // Coverage is judged on a logarithmic energy scale: 0.09–0.13 MeV (where
  // a star burns) extends a 0.7–3 MeV set as much as 3–13 MeV does.
  const range = (s: DataSegment) => {
    const e = finite(s.energies).filter((v) => v > 0)
    return e.length ? [Math.log10(Math.min(...e)), Math.log10(Math.max(...e))] : [0, 0]
  }
  const span = (s: DataSegment) => {
    const [lo, hi] = range(s)
    return (hi - lo + 0.05) * Math.log10(2 + (s.n_points ?? 0))
  }
  const ranked = [...pool].sort((a, b) => span(b) - span(a))
  const chosen = [ranked[0]]
  let [lo, hi] = range(ranked[0])
  for (const s of ranked.slice(1)) {
    if (chosen.length >= 3) break
    if (s.observable !== chosen[0].observable || s.exit_key !== chosen[0].exit_key) continue
    const [a, b] = range(s)
    // Adds at least a fifth of the current (logarithmic) range.
    const added = Math.max(0, lo - a) + Math.max(0, b - hi)
    if (added > 0.2 * Math.max(hi - lo, 0.1)) {
      chosen.push(s)
      lo = Math.min(lo, a)
      hi = Math.max(hi, b)
    }
  }
  // Show a resonance where the data reach one: if nothing chosen covers a
  // level's c.m. energy, add the best-fitting dataset of the headline
  // reaction that does (χ²/N ≤ 25), so the view has the peak in it.
  const covers = (s: DataSegment, e: number) => {
    const v = finite(s.energies)
    return v.length > 0 && Math.min(...v) < e && e < Math.max(...v)
  }
  const reachable = resonances.filter((e) => e > 0 && usable.some((s) => covers(s, e)))
  if (reachable.length > 0 && !reachable.some((e) => chosen.some((s) => covers(s, e)))) {
    const candidates = (headline ? usable.filter((s) => s.reaction && strip(s.reaction) === strip(headline)) : usable)
      .filter((s) => !chosen.includes(s) && !isAngular(s) && reachable.some((e) => covers(s, e)))
      .filter((s) => s.chi2 === null || s.chi2 <= 25)
      .sort((a, b) => (a.chi2 ?? 0) - (b.chi2 ?? 0))
    if (candidates[0]) {
      if (chosen.length >= 3) chosen.pop()
      chosen.push(candidates[0])
    }
  }
  return chosen.map((s) => s.index)
}

/** The entrance pair of a segment, as the Rutherford formula needs it. */
export function coulombPair(segment: DataSegment, pairs: SchemePair[]): CoulombPair | null {
  const pair = pairs.find((p) => p.number === segment.entrance_key)
  if (!pair || pair.is_photon) return null
  return { Z1: pair.Z1, Z2: pair.Z2, M1: pair.M1, M2: pair.M2 }
}

/* -- values ------------------------------------------------------------------ */

export interface PlotPoint {
  x: number
  /** n × measured value. */
  y: number
  /** n × uncertainty. */
  error?: number
  /** The model at this point (same quantity and unit). */
  model?: number
  /** (n·data − model)/(n·σ), as the χ² counts it. */
  pull?: number
}

export interface SegmentValues {
  kind: XKind
  /** Measured points (× n), with the model and the pull at each. */
  points: PlotPoint[]
  /** The model: on a fine grid when there is one, else at the data points. */
  curve: { x: number; y: number }[]
  /** The curve is the fine grid (true) or the data points joined (false). */
  smooth: boolean
  /** (n·data − model)/(n·error) per point, as the χ² counts it. */
  residuals: { x: number; y: number }[]
}

/** The values of a segment in the API's units (for picking a unit). */
export function rawValues(segment: DataSegment, asked: Quantity): number[] {
  const q = quantityFor(segment, asked)
  const norm = segment.norm || 1
  const observed = q === "sfactor" ? segment.sfactor : segment.cross_sections
  const model = q === "sfactor" ? segment.calculated_sfactor : segment.calculated
  return [...finite(observed).map((v) => v * norm), ...finite(model)]
}

/** Everything one segment contributes to a plot of `asked`, scaled to `unit`. */
export function segmentValues(
  segment: DataSegment,
  asked: Quantity,
  fine: FineCurve | undefined,
  pairs: SchemePair[],
  unit: DisplayUnit = { factor: 1, unit: "" },
): SegmentValues {
  const q = quantityFor(segment, asked)
  const kind = xKind(segment)
  const energies = segment.energies ?? []
  const angles = segment.angles ?? []
  const sf = q === "sfactor"
  const observed = sf ? segment.sfactor : segment.cross_sections
  const errors = sf ? segment.sfactor_errors : segment.cross_sections_errors
  const model = sf ? segment.calculated_sfactor : segment.calculated
  const norm = segment.norm || 1
  const k = unit.factor

  // Dividing by Rutherford: per point at its own angle and energy.
  const pair = q === "rutherford" ? coulombPair(segment, pairs) : null
  const divisor = (energy: number, angle: number | null | undefined) =>
    q === "rutherford" ? (pair && angle != null ? rutherford(pair, energy, angle) : NaN) : 1
  const gridAngle = angles.find((a) => a != null) ?? null
  const fixedEnergy = finite(energies)[0] ?? NaN
  const xOf = (i: number) => (kind === "angle" ? (angles[i] ?? NaN) : energies[i])

  const points: PlotPoint[] = energies.map((energy, i) => {
    const d = divisor(energy, angles[i])
    const v = observed?.[i]
    const e = errors?.[i]
    const m = model?.[i]
    const raw = segment.cross_sections?.[i]
    const rawE = segment.cross_sections_errors?.[i]
    const rawM = segment.calculated?.[i]
    return {
      x: xOf(i),
      y: v == null ? NaN : (v * norm * k) / d,
      error: e == null ? undefined : (e * norm * k) / d,
      model: m == null ? undefined : (m * k) / d,
      pull: raw != null && rawE && rawM != null ? (raw * norm - rawM) / (rawE * norm) : undefined,
    }
  })

  let curve: { x: number; y: number }[]
  let smooth = false
  if (fine && kind === "angle" && fine.axis === "angle" && fine.angles) {
    curve = fine.angles.map((x, i) => ({ x, y: ((fine.calculated[i] ?? NaN) * k) / divisor(fixedEnergy, x) }))
    smooth = true
  } else if (fine && kind === "energy" && fine.axis !== "angle") {
    const xs = sf ? fine.sfactor_energies : fine.energies
    const ys = sf ? fine.calculated_sfactor : fine.calculated
    curve = xs.map((x, i) => ({ x, y: ((ys[i] ?? NaN) * k) / divisor(x, gridAngle) }))
    smooth = true
  } else {
    curve = points
      .map((p) => ({ x: p.x, y: p.model ?? NaN }))
      .filter((p) => Number.isFinite(p.x))
      .sort((a, b) => a.x - b.x)
  }

  const residuals = points
    .filter((p) => p.pull !== undefined && Number.isFinite(p.x))
    .map((p) => ({ x: p.x, y: p.pull as number }))

  return { kind, points, curve, smooth, residuals }
}

/** Should an axis over these values be logarithmic? Only if all are positive and span `ratio`. */
export function autoLog(values: number[], ratio = 10): boolean {
  const usable = values.filter((v) => Number.isFinite(v))
  const positive = usable.filter((v) => v > 0)
  if (positive.length < 2 || positive.length < usable.length) return false
  return Math.max(...positive) / Math.min(...positive) >= ratio
}

/* -- export ------------------------------------------------------------------- */

/** CSV of the plotted points and model, one block per dataset. */
export function plotCsv(
  rows: { title: string; xName: string; yName: string; values: SegmentValues }[],
): string {
  const out: string[] = []
  for (const r of rows) {
    out.push(`# ${r.title}`)
    out.push(`${r.xName},${r.yName} (data x n),uncertainty (x n),model,pull`)
    for (const p of r.values.points) {
      out.push([p.x, p.y, p.error, p.model, p.pull].map((v) => (v === undefined || !Number.isFinite(v) ? "" : String(v))).join(","))
    }
    out.push(`# model curve`)
    out.push(`${r.xName},${r.yName} (model)`)
    for (const c of r.values.curve) out.push(`${c.x},${c.y}`)
    out.push("")
  }
  return out.join("\n")
}
