/**
 * Formatting for the reaction atlas: numbers and labels, with no file access,
 * so both the server pages and the client-side map can import it.
 */

import type { QValue, ReactionKind, Reference, Status } from "@/lib/atlas"

/** `7.297 MeV`; three decimals, which is what AME's precision supports here. */
export function formatQ(q: QValue): string {
  return `${q.value.toFixed(3)} MeV`
}

/** `27 ± 7 keV`: the Gamow peak and half its 1/e width. */
export function formatGamow(w: { E0: number; width: number }): string {
  const round = (x: number) => (x >= 100 ? Math.round(x / 5) * 5 : x >= 10 ? Math.round(x) : Number(x.toFixed(1)))
  return `${round(w.E0)} ± ${round(w.width / 2)} keV`
}

/** Temperatures under 0.1 GK read better in millions of kelvin. */
export function formatTemperature(T9: number): string {
  if (T9 < 0.1) return `${Number((T9 * 1000).toPrecision(3))} MK`
  return `${Number(T9.toPrecision(3))} GK`
}

export const KIND_LABEL: Record<ReactionKind, string> = {
  capture: "Radiative capture",
  transfer: "Particle-exchange reaction",
  fusion: "Fusion",
  weak: "Weak interaction",
  decay: "Radioactive decay",
}

export const STATUS_LABEL: Record<Status, string> = {
  "well-known": "Well known",
  improving: "Improving",
  uncertain: "Uncertain",
  unmeasured: "Unmeasured",
}

export const STATUS_HINT: Record<Status, string> = {
  "well-known": "The rate is known well enough for the stellar models that use it.",
  improving: "Recent measurements have narrowed the rate; some uncertainty remains.",
  uncertain: "The rate is uncertain enough to change the models that depend on it.",
  unmeasured: "No direct data at the energies that matter; the rate rests on extrapolation or indirect methods.",
}

/**
 * A compact citation: `Bethe, Phys. Rev. 55, 434 (1939)`, or `Bethe 1939` when
 * there is no journal reference to give.
 */
export function shortCitation(ref: Reference): string {
  // "A. Lemut et al. (LUNA Collaboration)" → "Lemut et al."; "Borexino Collaboration" stays.
  const clean = ref.authors.replace(/\s*\([^)]*\)/g, "").trim()
  let name: string
  if (/collaboration$/i.test(clean) && !/,/.test(clean)) {
    name = clean.replace(/^the\s+/i, "")
  } else {
    const authors = clean.split(/,| and /).map((a) => a.trim()).filter(Boolean)
    const surname = (a: string) => a.replace(/\bet al\.?/, "").trim().split(/\s+/).pop() ?? a
    name =
      authors.length === 2 && !/et al/.test(clean)
        ? `${surname(authors[0])} and ${surname(authors[1])}`
        : authors.length > 1 || /et al/.test(clean)
          ? `${surname(authors[0])} et al.`
          : surname(authors[0] ?? clean)
  }
  return ref.journal ? `${name}, ${ref.journal}` : `${name} ${ref.year}`
}

/** Where a reference can be read: the DOI, else arXiv, else its url. */
export function referenceHref(ref: Reference): string | undefined {
  const doi = ref.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
  return doi ? `https://doi.org/${doi}` : ref.arxiv ? `https://arxiv.org/abs/${ref.arxiv}` : ref.url
}
