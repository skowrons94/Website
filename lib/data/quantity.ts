/**
 * What a dataset measures, grouped the way an experimentalist reads a gap
 * map: angle-integrated cross sections and S-factors, partial cross sections
 * (to a given final level), angular distributions, polarisation, yields,
 * resonance strengths and Maxwellian averages.
 *
 * The pipeline's quantity classes (meta.json flags.quantity_classes, in the
 * index as `q`) map onto these groups; "partial" is a σ or S dataset with
 * final levels (index `lv` > 0) or a PAR branch (SF5).
 */

import type { Lang } from "../locale.ts"
import { FLAG_BITS as FB, QUANTITY_CLASSES as QC } from "./lowest.mjs"

/** The pipeline's quantity classes, in index order (`q`). */
export const QUANTITY_CLASSES = QC as unknown as readonly [
  "sigma",
  "S",
  "dsigma",
  "legendre",
  "ddx",
  "pol",
  "yield",
  "strength",
  "width",
  "macs",
  "sacs",
  "rate",
  "ratio",
  "integral",
  "other",
]
export type QuantityClass = (typeof QUANTITY_CLASSES)[number]

export const GROUPS = ["sigma", "S", "partial", "dsigma", "pol", "yield", "strength", "macs", "other"] as const
export type Group = (typeof GROUPS)[number]

export function groupOf(qClass: string, levels: number, sf5to8: string): Group {
  const partial = levels > 0 || /(^|,)PAR(,|$)/.test(sf5to8)
  switch (qClass) {
    case "sigma":
    case "S":
      return partial ? "partial" : qClass
    case "dsigma":
    case "legendre":
      return "dsigma"
    case "pol":
      return "pol"
    case "yield":
      return "yield"
    case "strength":
    case "width":
      return "strength"
    case "macs":
    case "sacs":
      return "macs"
    default:
      return "other"
  }
}

/** Short symbols, the same in both languages. */
export const GROUP_SYMBOL: Record<Group, string> = {
  sigma: "σ",
  S: "S",
  partial: "σ→Eₓ",
  dsigma: "dσ/dΩ",
  pol: "Ay",
  yield: "Y",
  strength: "ωγ",
  macs: "MACS",
  other: "…",
}

const NAMES: Record<Lang, Record<Group, string>> = {
  en: {
    sigma: "Cross section",
    S: "S-factor",
    partial: "Partial (to a final level)",
    dsigma: "Angular distribution dσ/dΩ",
    pol: "Polarization (Ay, VAP, TAP)",
    yield: "Yield",
    strength: "Resonance strength ωγ, widths",
    macs: "Maxwellian average (MACS)",
    other: "Other quantities",
  },
  it: {
    sigma: "Sezione d'urto",
    S: "Fattore S",
    partial: "Parziale (verso un livello finale)",
    dsigma: "Distribuzione angolare dσ/dΩ",
    pol: "Polarizzazione (Ay, VAP, TAP)",
    yield: "Resa",
    strength: "Intensità della risonanza ωγ, larghezze",
    macs: "Media maxwelliana (MACS)",
    other: "Altre grandezze",
  },
}

export function groupName(g: Group, lang: Lang): string {
  return NAMES[lang][g]
}

/** The pipeline's flag bits (meta.json flags.bits), in index order (`f`). */
export const FLAG_BITS = FB as unknown as readonly [
  "has-extrapolated-rows",
  "digitised",
  "superseded",
  "deleted",
  "preliminary",
  "relative",
  "not-experimental",
  "derived",
  "complex",
  "cm_approx",
  "outdated-normalisation",
  "renormalised-by-compiler",
  "dependent",
  "upper-limits",
  "indirect",
  "corrected",
]
export type Flag = (typeof FLAG_BITS)[number]

export function flagsOf(bits: number): Flag[] {
  return FLAG_BITS.filter((_, i) => bits & (1 << i))
}

export const flagBit = (name: Flag) => 1 << FLAG_BITS.indexOf(name)

/** Datasets that are not measurements of their own: never counted as data. */
export const NOT_DATA = flagBit("not-experimental") | flagBit("derived") | flagBit("deleted") | flagBit("complex")
/** ...and those replaced by a newer version of the same measurement. */
export const REPLACED = flagBit("superseded")

const FLAG_TEXT: Record<Lang, Record<Flag, [string, string]>> = {
  en: {
    "has-extrapolated-rows": [
      "extrapolated rows removed",
      "EXFOR lists extrapolated values (e.g. S(0)) in this dataset; they are kept apart and never plotted or counted.",
    ],
    digitised: ["digitized", "Read off a published figure (STATUS CURVE or a digitizing error), not from a table of the authors."],
    superseded: ["superseded", "Replaced by a newer version of the same measurement (STATUS SPSDD)."],
    deleted: ["deleted", "Marked deleted in EXFOR's history, usually as a duplicate."],
    preliminary: ["preliminary", "Preliminary data (STATUS PRELM)."],
    relative: ["relative", "Relative values (SF8 REL/RTH): not absolute cross sections."],
    "not-experimental": ["calculated/evaluated", "SF9 CALC, EVAL or RECOM: a calculation or an evaluation, not a measurement."],
    derived: ["derived", "SF9 DERIV: obtained from other measured quantities (e.g. an S-factor from ANCs)."],
    complex: ["ratio/combination", "A ratio or combination of quantities (a complex reaction code)."],
    cm_approx: ["natural target", "Natural element: c.m. energies use the standard atomic weight."],
    "outdated-normalisation": ["outdated normalization", "Normalized to a standard or monitor value that has since changed."],
    "renormalised-by-compiler": ["renormalized by compiler", "Renormalized by the EXFOR compiler, not by the authors."],
    dependent: ["dependent", "Depends on another dataset (e.g. shares its normalization)."],
    "upper-limits": ["limits", "Contains upper or lower limits (DATA-MAX/MIN), which are not data points."],
    indirect: [
      "indirect",
      "An indirect method (Trojan horse, Coulomb dissociation, ANC, surrogate): shown, not counted as a measurement of the reaction.",
    ],
    corrected: [
      "corrected",
      "A frame, unit or scale error of the EXFOR file is corrected here, or values the literature shows to be upper limits are read as such (scripts/data/corrections.yaml); the change is listed with the dataset.",
    ],
  },
  it: {
    "has-extrapolated-rows": [
      "righe estrapolate rimosse",
      "EXFOR riporta valori estrapolati (es. S(0)) in questa serie di dati; sono tenuti a parte, mai disegnati né contati.",
    ],
    digitised: [
      "digitalizzato",
      "Letto da una figura pubblicata (STATUS CURVE o un errore di digitalizzazione), non da una tabella degli autori.",
    ],
    superseded: ["superato", "Sostituito da una versione più recente della stessa misura (STATUS SPSDD)."],
    deleted: ["cancellato", "Segnato come cancellato nella storia di EXFOR, di solito perché duplicato."],
    preliminary: ["preliminare", "Dati preliminari (STATUS PRELM)."],
    relative: ["relativo", "Valori relativi (SF8 REL/RTH): non sezioni d'urto assolute."],
    "not-experimental": ["calcolato/valutato", "SF9 CALC, EVAL o RECOM: un calcolo o una valutazione, non una misura."],
    derived: ["derivato", "SF9 DERIV: ricavato da altre grandezze misurate (es. un fattore S dagli ANC)."],
    complex: ["rapporto/combinazione", "Un rapporto o una combinazione di grandezze (codice di reazione complesso)."],
    cm_approx: ["bersaglio naturale", "Elemento naturale: le energie nel centro di massa usano il peso atomico standard."],
    "outdated-normalisation": ["normalizzazione superata", "Normalizzato a un valore standard o di monitor che nel frattempo è cambiato."],
    "renormalised-by-compiler": ["rinormalizzato dal compilatore", "Rinormalizzato dal compilatore di EXFOR, non dagli autori."],
    dependent: ["dipendente", "Dipende da un'altra serie di dati (es. ne condivide la normalizzazione)."],
    "upper-limits": ["limiti", "Contiene limiti superiori o inferiori (DATA-MAX/MIN), che non sono punti sperimentali."],
    indirect: [
      "indiretto",
      "Un metodo indiretto (cavallo di Troia, dissociazione coulombiana, ANC, reazione surrogata): mostrato, non contato come misura della reazione.",
    ],
    corrected: [
      "corretto",
      "Qui è corretto un errore di sistema di riferimento, di unità o di scala del file EXFOR, oppure valori che la letteratura indica come limiti superiori sono letti come tali (scripts/data/corrections.yaml); la modifica è riportata con la serie di dati.",
    ],
  },
}

export function flagLabel(f: Flag, lang: Lang): string {
  return FLAG_TEXT[lang][f][0]
}

export function flagExplain(f: Flag, lang: Lang): string {
  return FLAG_TEXT[lang][f][1]
}

/** The error bits (meta.json flags.err_bits), in index order (`er`). */
export const ERR_BITS = ["stat", "sys", "total-given", "total-combined", "normalisation"] as const

const ERR_TEXT: Record<Lang, Record<(typeof ERR_BITS)[number], string>> = {
  en: { stat: "stat", sys: "sys", "total-given": "total", "total-combined": "total (combined)", normalisation: "norm." },
  it: { stat: "stat", sys: "sist", "total-given": "totale", "total-combined": "totale (combinato)", normalisation: "norm." },
}

export function errorsOf(bits: number, lang: Lang): string[] {
  return ERR_BITS.filter((_, i) => bits & (1 << i)).map((b) => ERR_TEXT[lang][b])
}
