/**
 * Formatting for the reaction atlas: numbers and labels, with no file access,
 * so both the server pages and the client-side map can import it.
 */

import type { QValue, ReactionKind, Reference, Status } from "@/lib/atlas"
import type { Lang } from "@/lib/i18n"

/** A number as text in `lang`: `1.5` in English, `1,5` in Italian. */
export function decimal(text: string | number, lang: Lang = "en"): string {
  return lang === "en" ? String(text) : String(text).replace(/(\d)\.(\d)/g, "$1,$2")
}

/** `7.297 MeV`; three decimals, which is what AME's precision supports here. */
export function formatQ(q: QValue, lang: Lang = "en"): string {
  return `${decimal(q.value.toFixed(3), lang)} MeV`
}

/** `27 ± 7 keV`: the Gamow peak and half its 1/e width. */
export function formatGamow(w: { E0: number; width: number }, lang: Lang = "en"): string {
  const round = (x: number) => (x >= 100 ? Math.round(x / 5) * 5 : x >= 10 ? Math.round(x) : Number(x.toFixed(1)))
  return decimal(`${round(w.E0)} ± ${round(w.width / 2)} keV`, lang)
}

/** Temperatures under 0.1 GK read better in millions of kelvin. */
export function formatTemperature(T9: number, lang: Lang = "en"): string {
  if (T9 < 0.1) return `${decimal(Number((T9 * 1000).toPrecision(3)), lang)} MK`
  return `${decimal(Number(T9.toPrecision(3)), lang)} GK`
}

const KIND_LABELS: Record<Lang, Record<ReactionKind, string>> = {
  en: {
    capture: "Radiative capture",
    transfer: "Particle-exchange reaction",
    fusion: "Fusion",
    weak: "Weak interaction",
    decay: "Radioactive decay",
  },
  it: {
    capture: "Cattura radiativa",
    transfer: "Reazione di scambio di particelle",
    fusion: "Fusione",
    weak: "Interazione debole",
    decay: "Decadimento radioattivo",
  },
}

const STATUS_LABELS: Record<Lang, Record<Status, string>> = {
  en: {
    "well-known": "Well known",
    improving: "Improving",
    uncertain: "Uncertain",
    unmeasured: "Unmeasured",
  },
  it: {
    "well-known": "Ben noto",
    improving: "In miglioramento",
    uncertain: "Incerto",
    unmeasured: "Non misurato",
  },
}

const STATUS_HINTS: Record<Lang, Record<Status, string>> = {
  en: {
    "well-known": "The rate is known well enough for the stellar models that use it.",
    improving: "Recent measurements have narrowed the rate; some uncertainty remains.",
    uncertain: "The rate is uncertain enough to change the models that depend on it.",
    unmeasured: "No direct data at the energies that matter; the rate rests on extrapolation or indirect methods.",
  },
  it: {
    "well-known": "Il tasso di reazione è noto abbastanza bene per i modelli stellari che lo usano.",
    improving: "Misure recenti hanno ridotto l'incertezza sul tasso di reazione, ma una parte resta.",
    uncertain: "Il tasso di reazione è abbastanza incerto da cambiare i modelli che ne dipendono.",
    unmeasured: "Non ci sono dati diretti alle energie che contano; il tasso di reazione si basa su estrapolazioni o su metodi indiretti.",
  },
}

export const kindLabel = (kind: ReactionKind, lang: Lang = "en") => KIND_LABELS[lang][kind] ?? kind
export const statusLabel = (status: Status, lang: Lang = "en") => STATUS_LABELS[lang][status] ?? status
export const statusHint = (status: Status, lang: Lang = "en") => STATUS_HINTS[lang][status] ?? ""

/** The English labels, as before; the functions above take a language. */
export const KIND_LABEL = KIND_LABELS.en
export const STATUS_LABEL = STATUS_LABELS.en
export const STATUS_HINT = STATUS_HINTS.en

/**
 * A compact citation: `Bethe, Phys. Rev. 55, 434 (1939)`, or `Bethe 1939` when
 * there is no journal reference to give.
 */
export function shortCitation(ref: Reference, lang: Lang = "en"): string {
  const and = lang === "it" ? "e" : "and"
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
        ? `${surname(authors[0])} ${and} ${surname(authors[1])}`
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
