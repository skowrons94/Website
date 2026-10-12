/**
 * The strings of the rates explorer (components/rates/*), English and
 * Italian. Kept apart from lib/i18n.ts so the explorer's bundle carries only
 * these; `it` must have every key of `en` (TypeScript checks it).
 */

import type { Lang } from "@/lib/locale"

const en = {
  network: "Network",
  networks: "Choose a network",
  sProcessTab: "s-process",
  where: "Where it burns",
  conditions: "Conditions",
  adjust: "Change the conditions",
  temperature: "Temperature",
  density: "Density",
  burnTime: "Burn time",
  stopOnFuel: (fuel: string) => `Stop when ${fuel} falls to 1% of its initial amount`,
  metals: "Heavier elements",
  metalsHint: "× the scenario's",
  hydrogen: "Hydrogen",
  screening: "Electron screening",
  screeningHint: "The electrons around the nuclei lower the Coulomb barrier a little (screen5, as in pynucastro).",
  resetConditions: "Back to the scenario",
  source: "Source",
  sourceOf: "Where these numbers come from",
  million: "million",
  validity: (t: string) =>
    `${t} is outside the temperature range REACLIB fits are made for (0.01–10 GK): treat the rates with care.`,

  // rates vs temperature
  ratesTitle: "How the rates change with temperature",
  ratesLead:
    "Each line is one reaction: how fast it goes for one pair of nuclei, as the temperature rises. The steep lines are reactions between charged nuclei, held back by their electric repulsion: a little more heat speeds them up enormously.",
  absolute: "Absolute",
  relative: "Relative",
  relativeTo: "Relative to",
  plotMode: "Show",
  showAll: "Show every reaction",
  showKey: "Show the main reactions",
  rateAxis: "N_A⟨σv⟩ (cm³ mol⁻¹ s⁻¹)",
  ratioAxis: (ref: string) => `ratio to ${ref}`,
  tAxis: "Temperature (GK)",
  tAxisMK: "million K",
  decaysNote: "Decays do not depend on temperature here (laboratory half-lives); they appear in the next chart.",
  pickHint: "Pick up to three reactions to colour; the others stay grey.",
  highlight: "Colour",
  now: "now",
  sites: "Sites",
  hoverAt: (t: string) => `At ${t}`,
  ratesChartLabel: (n: number) =>
    `Line chart of the reaction rates of ${n} reactions against temperature, both on logarithmic scales.`,

  // lifetimes
  lifeTitle: "How long does a nucleus wait?",
  lifeLead:
    "At these conditions, how long a nucleus waits, on average, before each reaction turns it into something else. The longest wait in the cycle is the bottleneck: it sets the pace of the whole chain.",
  bottleneck: "bottleneck",
  waits: (nucleus: string) => `${nucleus} nuclei wait`,
  lifeAxis: "Mean waiting time",
  lifeChartLabel: "Bar chart of the mean waiting time of a nucleus before each reaction, on a logarithmic time axis.",
  never: "never (no partner)",
  bottleneckSentence: (reaction: string, time: string) =>
    `The bottleneck is ${reaction}: ${time} on average. Every other step of the cycle waits for it.`,
  cycleOnly: "Bottleneck taken among the steps of the main cycle.",

  // what if
  whatIfTitle: "What if a rate were different?",
  whatIfLead:
    "Every rate is known only within an uncertainty, from a few percent to factors of ten. Change one, and see which nuclei come out different at the end of the burn.",
  factor: "factor",
  half: "×0.5",
  double: "×2",
  resetAll: "Reset all rates",
  reset: "Reset",
  moreReactions: "Every reaction of the network",
  changedTitle: "What changes most",
  changedLead: (time: string) =>
    `Final mass fraction after ${time}, changed ÷ unchanged. Bars to the right: more of that nucleus.`,
  noChange: "Change a rate above to see what it does: for now every nucleus ends as in the unchanged burn.",
  more: "more",
  less: "less",
  ratioAxis2: "changed ÷ unchanged",
  changeChartLabel:
    "Bar chart of the ratio between the final abundances with the changed rates and without, per nucleus, on a logarithmic scale.",
  evolutionTitle: "Abundances during the burn",
  evolutionLead: "Mass fraction of each nucleus against time. Solid: with your changes; dashed: unchanged.",
  evolutionChartLabel: "Line chart of mass fractions against time, both on logarithmic scales.",
  massFraction: "Mass fraction",
  time: "Time",
  pickNuclei: "Nuclei shown",
  calculating: "Calculating…",
  calculated: (ms: number, steps: number) => `Recalculated in your browser: ${ms} ms, ${steps} steps.`,
  precomputed: "Precomputed with the same solver; change anything to recalculate in your browser.",
  stoppedUntil: (fuel: string, time: string) => `The burn stopped after ${time}, when ${fuel} ran down to 1%.`,
  stoppedTime: (time: string) => `The burn ran for ${time}.`,
  failed: "The calculation failed:",
  baselineLabel: "unchanged",
  changedLabel: "changed",

  // expert
  forExperts: "For specialists",
  expertTable: "The numbers",
  colReaction: "Reaction",
  colSet: "REACLIB set",
  colQ: "Q (MeV)",
  colRate: "N_A⟨σv⟩ at T",
  colRateUnit: "unit",
  colLife: "τ (s)",
  colScale: "×",
  colSource: "Source",
  colNucleus: "Nucleus",
  colX0: "X initial",
  colXBase: "X final, unchanged",
  colXNew: "X final, changed",
  colRatio: "ratio",
  equationRate: "λ(T₉) = Σ_sets exp(a₀ + a₁/T₉ + a₂ T₉^(−1/3) + a₃ T₉^(1/3) + a₄ T₉ + a₅ T₉^(5/3) + a₆ ln T₉)",
  equationLife:
    "τ = 1 / (c · ρ^n · Y_partner · λ · f_scr) for the target nucleus; for a decay τ = 1/λ = t½ / ln 2. Y = X/A.",
  equationYdot:
    "dYᵢ/dt = Σ_r c_ir · prefactor_r · ρ^(n_r) · (Ye) · Π Y_reactants · λ_r(T₉) · f_scr,r — pynucastro's equations term for term.",
  units1: "s⁻¹",
  units2: "cm³ mol⁻¹ s⁻¹",
  units3: "cm⁶ mol⁻² s⁻¹",
  download: "Download",
  downloadCsv: "Rates and waiting times (CSV)",
  downloadRun: "This burn (JSON)",
  downloadNetwork: "Network file (JSON)",
  atlasPage: "Atlas page",
  provenance: (lib: string, tool: string) => `${lib} — ${tool}`,
  dataNote:
    "Rates are the REACLIB fits themselves, evaluated in your browser. Reverse rates are left out (negligible at these temperatures); nuclei outside the network are inert.",
}

export type RatesDict = typeof en

const it: RatesDict = {
  network: "Rete",
  networks: "Scegli una rete",
  sProcessTab: "processo s",
  where: "Dove brucia",
  conditions: "Condizioni",
  adjust: "Cambia le condizioni",
  temperature: "Temperatura",
  density: "Densità",
  burnTime: "Durata della combustione",
  stopOnFuel: (fuel: string) => `Fermati quando ${fuel} scende all'1% della quantità iniziale`,
  metals: "Elementi più pesanti",
  metalsHint: "× quelli dello scenario",
  hydrogen: "Idrogeno",
  screening: "Schermo elettronico",
  screeningHint:
    "Gli elettroni intorno ai nuclei abbassano un poco la barriera coulombiana (screen5, come in pynucastro).",
  resetConditions: "Torna allo scenario",
  source: "Fonte",
  sourceOf: "Da dove vengono questi numeri",
  million: "milioni",
  validity: (t: string) =>
    `${t} è fuori dall'intervallo di temperature per cui sono fatti i fit di REACLIB (0,01–10 GK): prendi i tassi con cautela.`,

  ratesTitle: "Come cambiano i tassi con la temperatura",
  ratesLead:
    "Ogni linea è una reazione: quanto è rapida per una coppia di nuclei, al crescere della temperatura. Le linee ripide sono reazioni tra nuclei carichi, frenate dalla repulsione elettrica: un po' più di calore le accelera enormemente.",
  absolute: "Assoluti",
  relative: "Relativi",
  relativeTo: "Relativi a",
  plotMode: "Mostra",
  showAll: "Mostra tutte le reazioni",
  showKey: "Mostra le reazioni principali",
  rateAxis: "N_A⟨σv⟩ (cm³ mol⁻¹ s⁻¹)",
  ratioAxis: (ref: string) => `rapporto con ${ref}`,
  tAxis: "Temperatura (GK)",
  tAxisMK: "milioni di K",
  decaysNote:
    "I decadimenti qui non dipendono dalla temperatura (tempi di dimezzamento di laboratorio): compaiono nel grafico successivo.",
  pickHint: "Scegli fino a tre reazioni da colorare; le altre restano grigie.",
  highlight: "Colora",
  now: "ora",
  sites: "Ambienti",
  hoverAt: (t: string) => `A ${t}`,
  ratesChartLabel: (n: number) =>
    `Grafico a linee dei tassi di ${n} reazioni in funzione della temperatura, entrambi in scala logaritmica.`,

  lifeTitle: "Quanto aspetta un nucleo?",
  lifeLead:
    "In queste condizioni, quanto aspetta in media un nucleo prima che ciascuna reazione lo trasformi in qualcos'altro. L'attesa più lunga del ciclo è il collo di bottiglia: detta il ritmo di tutta la catena.",
  bottleneck: "collo di bottiglia",
  waits: (nucleus: string) => `i nuclei di ${nucleus} aspettano`,
  lifeAxis: "Tempo medio di attesa",
  lifeChartLabel:
    "Grafico a barre del tempo medio di attesa di un nucleo prima di ciascuna reazione, su un asse dei tempi logaritmico.",
  never: "mai (manca il partner)",
  bottleneckSentence: (reaction: string, time: string) =>
    `Il collo di bottiglia è la ${reaction}: in media ${time}. Ogni altro passo del ciclo aspetta lei.`,
  cycleOnly: "Collo di bottiglia scelto tra i passi del ciclo principale.",

  whatIfTitle: "E se un tasso fosse diverso?",
  whatIfLead:
    "Ogni tasso è noto solo entro un'incertezza, da pochi punti percentuali a fattori dieci. Cambiane uno e guarda quali nuclei escono diversi alla fine della combustione.",
  factor: "fattore",
  half: "×0,5",
  double: "×2",
  resetAll: "Ripristina tutti i tassi",
  reset: "Ripristina",
  moreReactions: "Tutte le reazioni della rete",
  changedTitle: "Che cosa cambia di più",
  changedLead: (time: string) =>
    `Frazione di massa finale dopo ${time}, modificata ÷ originale. Barre a destra: più di quel nucleo.`,
  noChange:
    "Cambia un tasso qui sopra per vedere che cosa fa: per ora ogni nucleo finisce come nella combustione originale.",
  more: "di più",
  less: "di meno",
  ratioAxis2: "modificata ÷ originale",
  changeChartLabel:
    "Grafico a barre del rapporto tra le abbondanze finali con i tassi modificati e senza, per nucleo, in scala logaritmica.",
  evolutionTitle: "Le abbondanze durante la combustione",
  evolutionLead:
    "Frazione di massa di ciascun nucleo in funzione del tempo. Linea continua: con le tue modifiche; tratteggiata: originale.",
  evolutionChartLabel: "Grafico a linee delle frazioni di massa in funzione del tempo, entrambe in scala logaritmica.",
  massFraction: "Frazione di massa",
  time: "Tempo",
  pickNuclei: "Nuclei mostrati",
  calculating: "Calcolo in corso…",
  calculated: (ms: number, steps: number) => `Ricalcolato nel tuo browser: ${ms} ms, ${steps} passi.`,
  precomputed: "Precalcolato con lo stesso risolutore; cambia qualcosa per ricalcolare nel tuo browser.",
  stoppedUntil: (fuel: string, time: string) =>
    `La combustione si è fermata dopo ${time}, quando ${fuel} è sceso all'1%.`,
  stoppedTime: (time: string) => `La combustione è durata ${time}.`,
  failed: "Il calcolo non è riuscito:",
  baselineLabel: "originale",
  changedLabel: "modificata",

  forExperts: "Per specialisti",
  expertTable: "I numeri",
  colReaction: "Reazione",
  colSet: "Set REACLIB",
  colQ: "Q (MeV)",
  colRate: "N_A⟨σv⟩ a T",
  colRateUnit: "unità",
  colLife: "τ (s)",
  colScale: "×",
  colSource: "Fonte",
  colNucleus: "Nucleo",
  colX0: "X iniziale",
  colXBase: "X finale, originale",
  colXNew: "X finale, modificata",
  colRatio: "rapporto",
  equationRate: "λ(T₉) = Σ_set exp(a₀ + a₁/T₉ + a₂ T₉^(−1/3) + a₃ T₉^(1/3) + a₄ T₉ + a₅ T₉^(5/3) + a₆ ln T₉)",
  equationLife:
    "τ = 1 / (c · ρ^n · Y_partner · λ · f_scr) per il nucleo bersaglio; per un decadimento τ = 1/λ = t½ / ln 2. Y = X/A.",
  equationYdot:
    "dYᵢ/dt = Σ_r c_ir · prefattore_r · ρ^(n_r) · (Ye) · Π Y_reagenti · λ_r(T₉) · f_scr,r — le equazioni di pynucastro, termine per termine.",
  units1: "s⁻¹",
  units2: "cm³ mol⁻¹ s⁻¹",
  units3: "cm⁶ mol⁻² s⁻¹",
  download: "Scarica",
  downloadCsv: "Tassi e tempi di attesa (CSV)",
  downloadRun: "Questa combustione (JSON)",
  downloadNetwork: "File della rete (JSON)",
  atlasPage: "Scheda nell'atlante",
  provenance: (lib: string, tool: string) => `${lib} — ${tool}`,
  dataNote:
    "I tassi sono i fit di REACLIB stessi, calcolati nel tuo browser. I tassi inversi sono esclusi (trascurabili a queste temperature); i nuclei fuori dalla rete sono inerti.",
}

export const RATES_DICT: Record<Lang, RatesDict> = { en, it }
export const ratesDict = (lang: Lang): RatesDict => RATES_DICT[lang]
