/**
 * What a data segment can be plotted as, and what to call it.
 *
 * An astrophysical S-factor folds the Coulomb barrier out of a *reaction*
 * cross section; for elastic scattering it is not defined, and multiplying a
 * Rutherford-dominated dσ/dΩ by the Gamow factor gives numbers in the 10⁴
 * "MeV b" that mean nothing. So a scattering segment is always shown as the
 * cross section it is, whatever quantity the toolbar asks for.
 */

import { texPlain } from "@/components/tex"
import type { DataSegment } from "@/lib/api"
import type { Lang } from "@/lib/i18n"
import { quantityLabel } from "@/lib/viz"

export type Quantity = "sfactor" | "cross_section"

/** A segment the S-factor does not apply to. */
export function isScattering(segment: Pick<DataSegment, "elastic" | "entrance_key" | "exit_key" | "observable">) {
  if (segment.observable === "phase-shift") return true
  if (segment.elastic !== undefined) return segment.elastic
  // An older API without the flag: same pair in and out is elastic.
  return segment.entrance_key === segment.exit_key
}

/** The quantity actually drawn for a segment, given the one asked for. */
export function quantityFor(segment: DataSegment, asked: Quantity): Quantity {
  return isScattering(segment) ? "cross_section" : asked
}

/** Y-axis title for a segment drawn as `asked`. */
export function axisLabel(segment: DataSegment, asked: Quantity, lang: Lang): string {
  return quantityLabel(quantityFor(segment, asked), segment.observable, lang)
}

/** Readable dataset name, without its qualifier ("Kettner"). */
export function datasetName(segment: DataSegment): string {
  return segment.label || segment.name
}

/**
 * What tells this segment apart from others of the same dataset: the angle of
 * a differential measurement, or the final state of a capture.
 */
export function qualifier(segment: DataSegment): string {
  const bits: string[] = []
  if (segment.observable.startsWith("differential") && segment.angle_min === segment.angle_max) {
    bits.push(`${Number(segment.angle_min.toFixed(1))}°`)
  }
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
