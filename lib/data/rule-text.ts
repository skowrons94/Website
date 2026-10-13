/**
 * The rule for "lowest measured energy" in words, EN and IT: one text for the
 * /data page and for the "How these numbers are made" fold of the reaction
 * pages and the atlas panel. The rule itself is lib/data/lowest.mjs.
 */

import { RULE } from "./lowest.mjs"

const sigmaEn = RULE.sigma === 1 ? "one standard deviation" : `${RULE.sigma} standard deviations`
const sigmaIt = RULE.sigma === 1 ? "una deviazione standard" : `${RULE.sigma} deviazioni standard`
const pct = `${RULE.tie_rel * 100}`

export const RULE_TEXT = {
  en:
    "Lowest measured energy, everywhere in the data explorer: the lowest centre-of-mass energy at which a dataset in EXFOR measures the reaction itself (cross section, S-factor, angular distribution, yield or resonance strength), judged point by point. " +
    `A point counts when it is a value, not an upper or lower limit, when it lies at least ${sigmaEn} above zero, and when its energy is physical: at least ${RULE.charged_floor_keV} keV for charged particles, and not below the threshold of an endothermic reaction. ` +
    "Not counted: extrapolated, calculated, evaluated or derived values; superseded, deleted or preliminary data; ratios; a single S-factor value, which in EXFOR is a fit result; and indirect methods (Trojan horse, Coulomb dissociation, ANC, surrogate reactions), recognized from EXFOR's method and analysis codes, their text and the title. " +
    `Frame and unit errors of EXFOR are corrected first, and values the literature shows to be upper limits are read as limits, from a list that gives the evidence for each. Datasets that reach the same energy within ${pct}% are all credited, earliest first.`,
  it:
    "Energia più bassa misurata, in tutto l'esploratore dei dati nucleari: la più bassa energia nel centro di massa a cui una serie di dati di EXFOR misura la reazione stessa (sezione d'urto, fattore S, distribuzione angolare, resa o intensità di una risonanza), punto per punto. " +
    `Un punto conta se è un valore e non un limite superiore o inferiore, se sta almeno ${sigmaIt} sopra lo zero e se la sua energia è fisica: almeno ${RULE.charged_floor_keV} keV per le particelle cariche, e non sotto la soglia di una reazione endotermica. ` +
    "Non contano: valori estrapolati, calcolati, valutati o derivati; dati superati, cancellati o preliminari; rapporti; un singolo valore del fattore S, che in EXFOR è il risultato di un fit; e i metodi indiretti (cavallo di Troia, dissociazione coulombiana, ANC, reazioni surrogate), riconosciuti dai codici di metodo e di analisi di EXFOR, dal loro testo e dal titolo. " +
    `Prima si correggono gli errori di sistema di riferimento e di unità di EXFOR, e i valori che la letteratura indica come limiti superiori si leggono come limiti, da un elenco che riporta le prove per ciascuno. Le serie di dati che arrivano alla stessa energia entro il ${pct.replace(".", ",")}% sono citate tutte, dalla più vecchia.`,
}
