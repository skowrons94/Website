/**
 * What a data segment can be plotted as, and what to call it.
 *
 * An astrophysical S-factor folds the Coulomb barrier out of a *reaction*
 * cross section; for elastic scattering it is not defined, and multiplying a
 * Rutherford-dominated dσ/dΩ by the Gamow factor gives numbers in the 10⁴
 * "MeV b" that mean nothing. So a scattering segment is always shown as the
 * cross section it is, whatever quantity the toolbar asks for — or, for elastic
 * dσ/dΩ, as a ratio to the Rutherford cross section.
 */

import { texPlain } from "@/components/tex"
import type { DataSegment, FineCurve, SchemePair } from "@/lib/api"
import type { Lang } from "@/lib/i18n"
import { rutherford, type CoulombPair } from "@/lib/rutherford"
import { quantityLabel } from "@/lib/viz"

export type Quantity = "sfactor" | "cross_section" | "rutherford"

/** A segment the S-factor does not apply to. */
export function isScattering(segment: Pick<DataSegment, "elastic" | "entrance_key" | "exit_key" | "observable">) {
  if (segment.observable === "phase-shift") return true
  if (segment.elastic !== undefined) return segment.elastic
  // An older API without the flag: same pair in and out is elastic.
  return segment.entrance_key === segment.exit_key
}

/** Elastic dσ/dΩ: a segment that can be divided by the Rutherford cross section. */
export function hasRutherford(segment: DataSegment): boolean {
  return isScattering(segment) && segment.observable.startsWith("differential")
}

/** The quantity actually drawn for a segment, given the one asked for. */
export function quantityFor(segment: DataSegment, asked: Quantity): Quantity {
  if (asked === "rutherford") return hasRutherford(segment) ? "rutherford" : "cross_section"
  return isScattering(segment) ? "cross_section" : asked
}

/** Y-axis title for a segment drawn as `asked`. */
export function axisLabel(segment: DataSegment, asked: Quantity, lang: Lang): string {
  const q = quantityFor(segment, asked)
  if (q === "rutherford") return "σ/σ(Rutherford)"
  return quantityLabel(q, segment.observable, lang)
}

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
  const values = (segment.angles ?? []).filter((v): v is number => v !== null && Number.isFinite(v))
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

/**
 * What tells this segment apart from others of the same dataset: the angle of
 * a differential measurement, or the final state of a capture.
 */
export function qualifier(segment: DataSegment): string {
  const bits: string[] = []
  const angle = angleText(segment)
  if (angle) bits.push(angle)
  if (segment.exit_key !== segment.entrance_key) bits.push(`→ ${texPlain(segment.exit)}`)
  return bits.join(" ")
}

/** Name plus qualifier, as one line of text (legends, aria labels). */
export function segmentTitle(segment: DataSegment): string {
  const q = qualifier(segment)
  return q ? `${datasetName(segment)} · ${q}` : datasetName(segment)
}

/**
 * The segment a plot should open on: the first capture or reaction segment
 * (what an S-factor plot is for), falling back to the first segment.
 */
export function defaultSegment(data: DataSegment[]): DataSegment | undefined {
  return data.find((s) => s.active && !isScattering(s)) ?? data.find((s) => s.active) ?? data[0]
}

/** The entrance pair of a segment, as the Rutherford formula needs it. */
export function coulombPair(segment: DataSegment, pairs: SchemePair[]): CoulombPair | null {
  const pair = pairs.find((p) => p.number === segment.entrance_key)
  if (!pair || pair.is_photon) return null
  return { Z1: pair.Z1, Z2: pair.Z2, M1: pair.M1, M2: pair.M2 }
}

export interface SegmentValues {
  /** Measured points: energy, value, error. */
  points: { x: number; y: number; error?: number }[]
  /** The model: on a fine grid when there is one, else at the data energies. */
  curve: { x: number; y: number }[]
  /** The curve is the fine grid (true) or the data energies joined (false). */
  smooth: boolean
  /** (n·data − model)/(n·error) per point, as the χ² counts it. */
  residuals: { x: number; y: number }[]
}

/** Everything one segment contributes to a plot of `asked`. */
export function segmentValues(
  segment: DataSegment,
  asked: Quantity,
  fine: FineCurve | undefined,
  pairs: SchemePair[],
): SegmentValues {
  const q = quantityFor(segment, asked)
  const energies = segment.energies ?? []
  const angles = segment.angles ?? []
  const sf = q === "sfactor"
  const observed = sf ? segment.sfactor : segment.cross_sections
  const errors = sf ? segment.sfactor_errors : segment.cross_sections_errors
  const model = sf ? segment.calculated_sfactor : segment.calculated

  // Dividing by Rutherford: per point at its own angle; the fine grid is at
  // the segment's one angle (a fine curve exists only for such segments).
  const pair = q === "rutherford" ? coulombPair(segment, pairs) : null
  const divisor = (x: number, angle: number | null | undefined) =>
    q === "rutherford" ? (pair && angle != null ? rutherford(pair, x, angle) : NaN) : 1
  const gridAngle = angles.find((a) => a != null) ?? null

  const points = energies.map((x, i) => {
    const d = divisor(x, angles[i])
    const e = errors?.[i]
    return { x, y: (observed?.[i] ?? NaN) / d, error: e == null ? undefined : e / d }
  })

  let curve: { x: number; y: number }[]
  let smooth = false
  if (fine) {
    const xs = sf ? fine.sfactor_energies : fine.energies
    const ys = sf ? fine.calculated_sfactor : fine.calculated
    curve = xs.map((x, i) => ({ x, y: (ys[i] ?? NaN) / divisor(x, gridAngle) }))
    smooth = true
  } else {
    curve = energies.map((x, i) => ({ x, y: (model?.[i] ?? NaN) / divisor(x, angles[i]) }))
  }

  const norm = segment.norm || 1
  const residuals: { x: number; y: number }[] = []
  energies.forEach((x, i) => {
    const v = segment.cross_sections?.[i]
    const e = segment.cross_sections_errors?.[i]
    const m = segment.calculated?.[i]
    if (v == null || e == null || m == null || !e) return
    residuals.push({ x, y: (v * norm - m) / (e * norm) })
  })

  return { points, curve, smooth, residuals }
}
