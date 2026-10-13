/**
 * Rate "curiosities": one sentence each on what a rate twice as fast would
 * change in one of the explorer's one-zone burns ("If ²²Ne(p,γ)²³Na were
 * twice as fast, this model of an AGB star's hot envelope would end up with
 * about a fifth more sodium (+21%)").
 *
 * Only the words are written here. Every number is read from the shipped
 * sensitivity tables (public/rates/<id>.sensitivity.json: each rate ×2, the
 * response s = log₂(X×2 / X) of every nucleus at the end of the burn, after
 * the decays for the s-process), and `npm run test:rates` reruns the solver
 * for each one and checks that the sentence would read the same.
 *
 * Rules (the public panel's requirements): words first and the number in
 * brackets, at most two significant figures, "×2" never alone, the one-zone
 * caveat always. A nucleus that is the target of the doubled rate and
 * simply halves (|s + 1| < 0.05: true by construction, in equilibrium) is
 * never a headline on its own: it is stated as the ratio astronomers
 * measure (¹²C/¹³C, ¹⁷O/¹⁶O). Left out on purpose: gold and europium (made
 * mostly by the r-process in nature), fluorine-19, doubled laboratory decays
 * and the ONe-nova ²³Na(p,γ) "÷16" (an edge case of the model).
 *
 * A card can say more than its main nucleus (the owner's request, r11): a
 * second line with the most striking knock-on effect (a nucleus other than
 * the reaction's own reactants and products and what they decay to in one
 * step, moved by 5% or more), and an
 * energy line (the burn's mean power and how soon its fuel runs out), both
 * read from the same tables (`energy`, `fuel`, `nu` beside the nuclei). A
 * curiosity can also be about the energy itself (`kind: "energy"`) or about
 * the neutrinos a detector counts (`kind: "neutrino"`). The energy is that of
 * one gram of gas at the model's temperature, not the star's luminosity, and
 * the caveat says so.
 *
 * Pure (it imports only lib/rates/energy.ts), so the pages (at build time), the card script
 * (scripts/rates/curiosity-cards.mjs) and test:rates share it.
 */

import { ENERGY_NETS } from "./energy.ts"

export type CLang = "en" | "it"
type Words = Record<CLang, string>

export interface CuriositySpec {
  /** the slug of its page, /atlas/rates/curiosities/<id> */
  id: string
  net: string
  site: string
  /** the reaction doubled (an id of the network file) */
  reaction: string
  /**
   * what the sentence is about: a nucleus (the default), the burn's energy
   * (its mean power and how soon its fuel runs out), or a neutrino source
   * (`nu`, an id of lib/rates/energy.ts NEUTRINO_GROUPS)
   */
  kind?: "nucleus" | "energy" | "neutrino"
  nu?: string
  /** the nucleus the sentence is about, and, for a ratio, the one below it (for an energy or neutrino card, the one name "") */
  nucleus: string
  per?: string
  /** names in words (a monoisotopic element by its element name; the neutrinos, the fuel of an energy card) */
  name: Words
  perName?: Words
  /** the site, as the subject of the sentence: "this model of …" */
  where: Words
  /** why it matters, at most 15 words, no numbers of the model */
  hook: Words
  /** a limit of the model for this one result, after the caveat */
  note?: Words
  /**
   * What the energy line covers, when the network is not all of the site's
   * burning (CNO alone in the Sun's centre): it leads the line, and the line
   * then leaves out the fuel time, which only the whole burning sets (CNO
   * alone takes 710 million years over the first 1% of the Sun's hydrogen,
   * the pp chain 43 million).
   */
  energyScope?: Words
}

/** "this model of …", per scenario, so each is written once. */
const W = {
  sun: { en: "this model of the Sun's centre", it: "questo modello del centro del Sole" },
  m15: { en: "this model of a 15 M☉ star's core", it: "questo modello del nucleo di una stella di 15 M☉" },
  m25: { en: "this model of a 25 M☉ star's core", it: "questo modello del nucleo di una stella di 25 M☉" },
  hbb: { en: "this model of an AGB star's hot envelope", it: "questo modello dell'inviluppo caldo di una stella AGB" },
  one: { en: "this model of an oxygen–neon nova", it: "questo modello di una nova all'ossigeno e neon" },
  co: { en: "this model of a carbon–oxygen nova", it: "questo modello di una nova al carbonio e ossigeno" },
  pocket: { en: "this model of an AGB star's ¹³C pocket", it: "questo modello della tasca di ¹³C di una stella AGB" },
  pulse: { en: "this model of an AGB thermal pulse", it: "questo modello di un impulso termico di una stella AGB" },
  hecore: { en: "this model of a massive star's helium core", it: "questo modello del nucleo di elio di una stella massiccia" },
} satisfies Record<string, Words>

const nm = (en: string, it: string): Words => ({ en, it })

/** The limit of every card that names krypton‑86 (the explorer's s-process notes say the same). */
const KR85: Words = {
  en: "Krypton‑86 comes through the branch at krypton‑85, modelled without its short-lived isomer, so this model makes too much of it.",
  it: "Il kripton‑86 nasce dalla diramazione al kripton‑85, qui senza il suo isomero di vita breve: il modello ne produce quindi troppo.",
}

export const CURIOSITIES: CuriositySpec[] = [
  {
    id: "pp-sun-hydrogen",
    net: "pp",
    site: "sun-core",
    reaction: "p_p_to_d_beta_pos_reaclib",
    nucleus: "p",
    name: nm("hydrogen", "idrogeno"),
    where: W.sun,
    hook: {
      en: "The Sun's slowest step, never measured. A real Sun would cool down to compensate.",
      it: "Nessuno ha mai misurato il passo più lento del Sole. Un Sole vero compenserebbe raffreddandosi.",
    },
  },
  {
    id: "pp-sun-beryllium-7",
    net: "pp",
    site: "sun-core",
    reaction: "He3_He4_to_Be7_reaclib",
    nucleus: "be7",
    name: nm("beryllium‑7", "berillio‑7"),
    where: W.sun,
    hook: {
      en: "Beryllium‑7 gives off the Sun's ⁷Be neutrinos, which Borexino counted on Earth.",
      it: "Il berillio‑7 è la sorgente dei neutrini solari del ⁷Be, che Borexino rivela sulla Terra.",
    },
  },
  {
    id: "cno-sun-oxygen-15",
    net: "cno",
    site: "sun-core",
    reaction: "N14_p_to_O15_reaclib",
    nucleus: "o15",
    name: nm("oxygen‑15", "ossigeno‑15"),
    where: W.sun,
    hook: {
      en: "Oxygen‑15 gives off CNO neutrinos as it decays; Borexino first detected them in 2020.",
      it: "L'ossigeno‑15 decade emettendo neutrini CNO, rivelati per la prima volta da Borexino nel 2020.",
    },
    note: {
      en: "The C, N and O start as fresh fuel at today's temperature and density, not as the Sun's processed core.",
      it: "C, N e O partono come combustibile fresco alla temperatura e alla densità di oggi, non come il cuore già trasformato del Sole.",
    },
    energyScope: {
      en: "CNO reactions only, about 1% of the Sun's power (a few per cent at its centre)",
      it: "Solo le reazioni CNO, circa l'1% della potenza del Sole (qualche per cento al centro)",
    },
  },
  {
    id: "cno-carbon-ratio",
    net: "cno",
    site: "massive-15",
    reaction: "C13_p_to_N14_reaclib",
    nucleus: "c12",
    per: "c13",
    name: nm("carbon‑12", "carbonio‑12"),
    perName: nm("carbon‑13", "carbonio‑13"),
    where: W.m15,
    hook: {
      en: "Astronomers measure this ratio in red giants; LUNA measured this rate underground in 2023.",
      it: "Le giganti rosse mostrano questo rapporto; LUNA ha misurato il tasso sotto terra nel 2023.",
    },
  },
  {
    id: "cno-oxygen-ratio",
    net: "cno",
    site: "massive-15",
    reaction: "O17_p_to_He4_N14_reaclib",
    nucleus: "o17",
    per: "o16",
    name: nm("oxygen‑17", "ossigeno‑17"),
    perName: nm("oxygen‑16", "ossigeno‑16"),
    where: W.m15,
    hook: {
      en: "Stardust grains in meteorites preserve this oxygen ratio; LUNA measured this rate in 2016.",
      it: "I grani presolari dei meteoriti conservano questo rapporto; LUNA ha misurato il tasso nel 2016.",
    },
  },
  {
    id: "nena-agb-sodium",
    net: "nena",
    site: "agb-hbb",
    reaction: "Ne22_p_to_Na23_reaclib",
    nucleus: "na23",
    name: nm("sodium", "sodio"),
    where: W.hbb,
    hook: {
      en: "Sodium varies from star to star in globular clusters; LUNA measured this rate in 2018.",
      it: "Il sodio varia tra le stelle degli ammassi globulari; LUNA misurò il tasso nel 2018.",
    },
  },
  {
    id: "nena-agb-sodium-cycle",
    net: "nena",
    site: "agb-hbb",
    reaction: "Na23_p_to_He4_Ne20_reaclib",
    nucleus: "na23",
    name: nm("sodium", "sodio"),
    where: W.hbb,
    hook: {
      en: "This reaction closes the NeNa cycle; its rival, (p,γ), lets sodium leak towards magnesium.",
      it: "Chiude il ciclo NeNa; la rivale (p,γ) porta invece il sodio verso il magnesio.",
    },
  },
  {
    id: "mgal-agb-aluminium-26",
    net: "mgal",
    site: "agb-hbb",
    reaction: "Mg25_p_to_Al26_reaclib",
    nucleus: "al26",
    name: nm("aluminium‑26", "alluminio‑26"),
    where: W.hbb,
    hook: {
      en: "Aluminium‑26's 1809 keV glow maps the Milky Way.",
      it: "La riga γ a 1809 keV dell'alluminio‑26 disegna la Via Lattea.",
    },
    note: {
      en: "This model counts all the aluminium‑26 made, including a short-lived form that never glows, so here it is an upper limit.",
      it: "Il modello conta tutto l'alluminio‑26 prodotto, anche una forma di vita breve che non emette questa riga: qui è quindi un limite superiore.",
    },
  },
  {
    id: "mgal-massive-aluminium-26",
    net: "mgal",
    site: "massive-25",
    reaction: "Mg25_p_to_Al26_reaclib",
    nucleus: "al26",
    name: nm("aluminium‑26", "alluminio‑26"),
    where: W.m25,
    hook: {
      en: "Faster is not more: magnesium‑25 runs out anyway, and aluminium‑26 decays while it waits.",
      it: "Più veloce non vuol dire di più: il magnesio‑25 finisce comunque, e intanto l'alluminio‑26 decade.",
    },
  },
  {
    id: "nena-nova-sodium-22",
    net: "nena",
    site: "nova-one",
    reaction: "Na22_p_to_Mg23_reaclib",
    nucleus: "na22",
    name: nm("sodium‑22", "sodio‑22"),
    where: W.one,
    hook: {
      en: "Sodium‑22's 1275 keV gamma-ray line has not yet been seen from a nova.",
      it: "Nessuno ha ancora visto in una nova la riga γ a 1275 keV del sodio‑22.",
    },
  },
  {
    id: "cno-nova-fluorine-18",
    net: "cno",
    site: "nova",
    reaction: "F18_p_to_He4_O15_reaclib",
    nucleus: "f18",
    name: nm("fluorine‑18", "fluoro‑18"),
    where: W.co,
    hook: {
      en: "Fluorine‑18 powers the 511 keV gamma-ray flash expected in a nova's first hours.",
      it: "Il fluoro‑18 alimenta il lampo γ a 511 keV atteso nelle prime ore della nova.",
    },
  },
  {
    id: "s-pocket-carbon-13",
    net: "sprocess",
    site: "agb-13c-pocket",
    reaction: "C13_He4_to_n_O16_reaclib",
    nucleus: "ba138",
    name: nm("barium‑138", "bario‑138"),
    where: W.pocket,
    hook: {
      en: "All the carbon‑13 burns anyway: how much there is matters, not how fast it burns.",
      it: "Il carbonio‑13 brucia tutto comunque: conta quanto ce n'è, non quanto in fretta brucia.",
    },
    note: KR85,
  },
  {
    id: "s-pulse-neon-22",
    net: "sprocess",
    site: "agb-thermal-pulse",
    reaction: "Ne22_He4_to_n_Mg25_reaclib",
    nucleus: "kr86",
    name: nm("krypton‑86", "kripton‑86"),
    where: W.pulse,
    hook: {
      en: "In the short hot pulse, neon‑22 burns only partly: its rate sets the neutrons.",
      it: "Nel breve impulso il neon‑22 brucia solo in parte: il tasso decide quanti neutroni libera.",
    },
    note: KR85,
  },
  {
    id: "s-core-neon-22-rival",
    net: "sprocess",
    site: "massive-he-core",
    reaction: "Ne22_He4_to_Mg26_reaclib",
    nucleus: "sr88",
    name: nm("strontium‑88", "stronzio‑88"),
    where: W.hecore,
    hook: {
      en: "This rival burns neon‑22 without freeing a neutron, so fewer neutrons reach the iron.",
      it: "Questa rivale brucia il neon‑22 senza liberare neutroni, così meno neutroni arrivano al ferro.",
    },
  },
  {
    id: "s-core-magnesium-poison",
    net: "sprocess",
    site: "massive-he-core",
    reaction: "Mg25_n_to_Mg26_reaclib",
    nucleus: "sr88",
    name: nm("strontium‑88", "stronzio‑88"),
    where: W.hecore,
    hook: {
      en: "Magnesium‑25 is a neutron poison: it swallows neutrons before the iron seeds can.",
      it: "Il magnesio‑25 è un veleno neutronico: cattura i neutroni prima dei semi di ferro.",
    },
  },
  {
    id: "s-pocket-iron-seeds",
    net: "sprocess",
    site: "agb-13c-pocket",
    reaction: "Fe56_n_to_Fe57_reaclib",
    nucleus: "ba138",
    name: nm("barium‑138", "bario‑138"),
    where: W.pocket,
    hook: {
      en: "Iron grabs more of the neutrons, so each nucleus climbs less far towards barium.",
      it: "Il ferro cattura più neutroni, così ogni nucleo sale meno verso il bario.",
    },
  },
  // -- r11: the energy, the neutrinos and the knock-on effects --------------------
  {
    id: "cno-massive-energy",
    net: "cno",
    site: "massive-15",
    reaction: "N14_p_to_O15_reaclib",
    kind: "energy",
    nucleus: "",
    name: nm("hydrogen", "l'idrogeno"),
    where: W.m15,
    hook: {
      en: "The CNO cycle's slowest step sets the temperature at which a massive star burns hydrogen.",
      it: "Nelle stelle massicce l'idrogeno brucia alla temperatura fissata dal passo più lento del ciclo CNO.",
    },
  },
  {
    id: "pp-sun-boron-8-neutrinos",
    net: "pp",
    site: "sun-core",
    reaction: "He3_He3_to_p_p_He4_reaclib",
    kind: "neutrino",
    nu: "b8",
    nucleus: "",
    name: nm("boron‑8 neutrinos", "neutrini del boro‑8"),
    where: W.sun,
    hook: {
      en: "Two helium‑3 nuclei fusing directly skip beryllium‑7, so fewer boron‑8 neutrinos reach Earth.",
      it: "Se due elio‑3 si fondono tra loro, il berillio‑7 viene saltato: meno neutrini del boro‑8.",
    },
  },
  {
    id: "cno-massive-oxygen-17",
    net: "cno",
    site: "massive-15",
    reaction: "N15_p_to_O16_reaclib",
    nucleus: "o17",
    name: nm("oxygen‑17", "ossigeno‑17"),
    where: W.m15,
    hook: {
      en: "A rare leak from the CN cycle feeds oxygen‑16, and oxygen‑16 makes oxygen‑17.",
      it: "Una rara fuga dal ciclo CN alimenta l'ossigeno‑16, che a sua volta produce ossigeno‑17.",
    },
  },
  {
    id: "nena-massive-sodium",
    net: "nena",
    site: "massive-25",
    reaction: "Ne20_p_to_Na21_reaclib",
    nucleus: "na23",
    name: nm("sodium", "sodio"),
    where: W.m25,
    hook: {
      en: "Neon‑20 starts the NeNa cycle; sodium, three captures later, follows its pace.",
      it: "Il neon‑20 apre il ciclo NeNa; il sodio, tre catture dopo, ne segue il ritmo.",
    },
  },
  {
    id: "mgal-agb-aluminium-26-knock-on",
    net: "mgal",
    site: "agb-hbb",
    reaction: "Mg24_p_to_Al25_reaclib",
    nucleus: "al26",
    name: nm("aluminium‑26", "alluminio‑26"),
    where: W.hbb,
    hook: {
      en: "Magnesium‑24 feeds magnesium‑25, which makes aluminium‑26: an effect two steps away.",
      it: "Il magnesio‑24 alimenta il magnesio‑25, che produce l'alluminio‑26: un effetto a due passi.",
    },
    note: {
      en: "This model counts all the aluminium‑26 made, including a short-lived form that never gives off the 1809 keV line, so here it is an upper limit.",
      it: "Il modello conta tutto l'alluminio‑26 prodotto, anche una forma di vita breve che non emette la riga γ a 1809 keV: qui è quindi un limite superiore.",
    },
  },
]

/** Nuclei no curiosity may headline (see above). */
export const NEVER_HEADLINE = ["au197", "eu151", "eu153", "f19", "tc99"]

// -- the numbers ----------------------------------------------------------------

export interface SensitivityLike {
  scenarios: Record<
    string,
    {
      nuclei: string[]
      reactions: string[]
      s: number[][]
      /** s of the mean power, of the fuel time (null: never reached) and of each neutrino source's rate */
      energy?: number[]
      fuel?: (number | null)[]
      nu?: Record<string, (number | null)[]>
    }
  >
}

/** The response s of a nucleus to the reaction ×2 (log₂ of the ratio), or null. */
export function sensOf(sens: SensitivityLike, site: string, reaction: string, nucleus: string): number | null {
  const t = sens.scenarios[site]
  if (!t) return null
  const r = t.reactions.indexOf(reaction)
  const n = t.nuclei.indexOf(nucleus)
  return r < 0 || n < 0 ? null : t.s[r][n]
}

/** The energy columns of a table for a reaction: s of the power, of the fuel time, of a neutrino source. */
export function energySens(
  sens: SensitivityLike,
  site: string,
  reaction: string,
): { power: number; fuel: number | null; nu: Record<string, number | null> } | null {
  const t = sens.scenarios[site]
  const r = t?.reactions.indexOf(reaction) ?? -1
  if (!t || r < 0 || !t.energy) return null
  return {
    power: t.energy[r],
    fuel: t.fuel?.[r] ?? null,
    nu: Object.fromEntries(Object.entries(t.nu ?? {}).map(([g, v]) => [g, v[r]])),
  }
}

/** changed ÷ unchanged at the end of the burn (of the ratio, for a ratio; of the power or the neutrinos for those cards). */
export function curiosityRatio(spec: CuriositySpec, sens: SensitivityLike): number {
  if (spec.kind === "energy" || spec.kind === "neutrino") {
    const e = energySens(sens, spec.site, spec.reaction)
    const v = spec.kind === "energy" ? e?.power : spec.nu ? e?.nu[spec.nu] : null
    if (v === null || v === undefined) throw new Error(`curiosity ${spec.id}: no energy sensitivity for ${spec.reaction}`)
    return 2 ** v
  }
  const a = sensOf(sens, spec.site, spec.reaction, spec.nucleus)
  const b = spec.per ? sensOf(sens, spec.site, spec.reaction, spec.per) : 0
  if (a === null || b === null) throw new Error(`curiosity ${spec.id}: no sensitivity for ${spec.reaction} / ${spec.nucleus}`)
  return 2 ** (a - b)
}

/**
 * The p-nuclei: in nature they come mostly from other processes, not from
 * neutron captures, so an s-process knock-on line never names them (¹⁵²Gd
 * and ¹⁶⁴Er, with large s-process shares, are left out of the list).
 */
const P_NUCLEI = [
  "se74", "kr78", "sr84", "mo92", "mo94", "ru96", "ru98", "pd102", "cd106", "cd108", "in113", "sn112",
  "sn114", "sn115", "te120", "xe124", "xe126", "ba130", "ba132", "la138", "ce136", "ce138", "sm144",
  "dy156", "dy158", "er162", "yb168", "hf174", "ta180", "w180", "os184", "pt190", "hg196",
]
/** Nuclei a knock-on line never names: the fuel, the free particles and the p-nuclei, besides the excluded headlines. */
const NOT_KNOCK = ["p", "n", "he4", ...P_NUCLEI]
export { ENERGY_NETS }
/** The smallest change an extra line reports: 5%. */
export const EXTRA_MIN = 0.05

export interface KnockOn {
  name: string
  /** changed ÷ unchanged */
  ratio: number
}

/**
 * The most striking knock-on effect of a curiosity's change: the nucleus,
 * other than the reaction's own reactants and products and the card's own
 * nuclei, whose final abundance moves most, by 5% or more. `own` lists the
 * reaction's reactants and products by name, with their one-step decay
 * daughters (ownNuclei); `weight(name)` is the
 * nucleus's final mass fraction, 0 when it is too rare to matter. Nuclei
 * that move alike (a cycle in balance moves all its members by the same
 * factor: within 0.03 in s) are a tie, and the most abundant one is named.
 */
export function curiosityKnock(
  spec: CuriositySpec,
  sens: SensitivityLike,
  own: string[],
  weight: (name: string) => number = () => 1,
): KnockOn | null {
  const t = sens.scenarios[spec.site]
  const r = t?.reactions.indexOf(spec.reaction) ?? -1
  if (!t || r < 0) return null
  const skip = new Set([...own, spec.nucleus, spec.per ?? "", ...NOT_KNOCK, ...NEVER_HEADLINE])
  const list = t.nuclei
    .map((name, j) => ({ name, s: t.s[r][j], w: skip.has(name) ? 0 : weight(name) }))
    .filter((x) => x.w > 0 && Math.abs(2 ** x.s - 1) >= EXTRA_MIN)
  if (!list.length) return null
  const top = Math.max(...list.map((x) => Math.abs(x.s)))
  const best = list.filter((x) => Math.abs(x.s) >= top - 0.03).sort((a, b) => b.w - a.w || (a.name < b.name ? -1 : 1))[0]
  return { name: best.name, ratio: 2 ** best.s }
}

export interface EnergyLine {
  /** changed ÷ unchanged mean power over the burn */
  power: number
  /** changed ÷ unchanged time to burn the fuel down to the stop condition (or its first 1%); null when not reached */
  fuel: number | null
}

/**
 * The energy line of a card, when it says something: a network that makes
 * the burn's energy, and the power or the fuel time moved by 5% or more.
 * An energy card has its own sentence and no line.
 */
export function curiosityEnergy(spec: CuriositySpec, sens: SensitivityLike): EnergyLine | null {
  if (spec.kind === "energy" || !ENERGY_NETS.includes(spec.net)) return null
  const e = energySens(sens, spec.site, spec.reaction)
  if (!e) return null
  const power = 2 ** e.power
  const fuel = e.fuel === null ? null : 2 ** e.fuel
  if (Math.abs(power - 1) < EXTRA_MIN && (fuel === null || Math.abs(fuel - 1) < EXTRA_MIN)) return null
  return { power, fuel }
}

/** For an energy card: the fuel time's change, from the same table. */
export function curiosityFuel(spec: CuriositySpec, sens: SensitivityLike): number | null {
  const e = energySens(sens, spec.site, spec.reaction)
  return e?.fuel === null || e?.fuel === undefined ? null : 2 ** e.fuel
}

// -- the words ------------------------------------------------------------------

const dec = (s: string, lang: CLang) => (lang === "it" ? s.replace(".", ",") : s)
const sig2 = (x: number) => Number(x.toPrecision(2))
/**
 * Thousands as each language's house style groups them (docs/STYLE.md):
 * from five digits: English 4900 and 78 000 (a thin space, never a comma),
 * Italian 4900 and 78.000.
 */
const group = (x: number, lang: CLang) => {
  if (x < 1000) return dec(String(x), lang)
  const v = String(Math.round(x))
  return v.length < 5 ? v : v.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "it" ? "." : "\u202f")
}

/** "(+21%)", "(−46%)", "(×3.1)": the number in brackets, ≤ 2 significant figures. */
export function percentText(r: number, lang: CLang): string {
  if (r >= 1.75) return `×${dec(r.toPrecision(2), lang)}`
  const p = (r - 1) * 100
  const v = Math.abs(p) < 10 ? Math.round(p) : sig2(p)
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${dec(String(Math.abs(v)), lang)}%`
}

const FRACTIONS: [number, string, string][] = [
  [1 / 10, "a tenth", "un decimo"],
  [1 / 6, "a sixth", "un sesto"],
  [1 / 5, "a fifth", "un quinto"],
  [1 / 4, "a quarter", "un quarto"],
  [1 / 3, "a third", "un terzo"],
  [2 / 5, "two fifths", "due quinti"],
  [1 / 2, "half", "metà"],
  [2 / 3, "two thirds", "due terzi"],
  [3 / 4, "three quarters", "tre quarti"],
]
const nearest = (f: number, max = 1) =>
  FRACTIONS.filter(([v]) => v <= max + 1e-9).reduce((a, b) => (Math.abs(Math.log(b[0] / f)) < Math.abs(Math.log(a[0] / f)) ? b : a))
/** "del sodio", "dello stronzio‑88", "dell'alluminio‑26" (the element names are masculine). */
const delIt = (name: string) =>
  /^[aeiou]/i.test(name) ? `dell'${name}` : /^(s[^aeiou]|z|gn|ps|x)/i.test(name) ? `dello ${name}` : `del ${name}`
const TIMES: Record<number, [string, string]> = { 2: ["twice", "il doppio"], 3: ["three times", "il triplo"] }

/**
 * The amount in words, the part of the sentence set in bold:
 * "about a fifth more sodium", "twice as much oxygen‑15",
 * "circa un quinto di sodio in più", "il doppio di ossigeno‑15".
 */
export function amountWords(r: number, name: string, lang: CLang, plural = false): string {
  const it = lang === "it"
  const about = (exact: boolean) => (exact ? "" : it ? "circa " : "about ")
  // countable things (neutrinos): many, fewer, the same number
  const much = plural ? "many" : "much"
  const less = plural ? "fewer" : "less"
  const of = (n: string) => (plural ? `dei ${n}` : delIt(n))
  if (Math.abs(r - 1) < 0.02)
    return it
      ? `quasi ${plural ? "lo stesso numero" : "la stessa quantità"} di ${name}`
      : `almost the same ${plural ? "number" : "amount"} of ${name}`
  if (Math.abs(r - 1) < 0.08) return r > 1 ? (it ? `un po' più di ${name}` : `slightly more ${name}`) : it ? `un po' meno di ${name}` : `slightly ${less} ${name}`
  if (r >= 1.75) {
    const n = Math.round(r)
    const exact = Math.abs(r / n - 1) <= 0.05
    if (TIMES[n]) return it ? `${about(exact)}${TIMES[n][1]} di ${name}` : `${about(exact)}${TIMES[n][0]} as ${much} ${name}`
    return it ? `circa ${n} volte più ${name}` : `about ${n} times as ${much} ${name}`
  }
  if (r > 1) {
    const [v, en, itw] = nearest(r - 1, 3 / 4)
    if (v === 1 / 2 && !it) return `about one and a half times as ${much} ${name}`
    return it ? `circa ${itw} di ${name} in più` : `about ${en} more ${name}`
  }
  // less
  if (r >= 0.45 && r <= 0.55) {
    const exact = Math.abs(r - 0.5) <= 0.025
    return it ? `${about(exact)}metà ${of(name)}` : `${about(exact)}half as ${much} ${name}`
  }
  if (r < 0.45) {
    const [, en, itw] = nearest(r, 2 / 5)
    return it ? `solo circa ${itw} ${of(name)}` : `about ${en} as ${much} ${name}`
  }
  const [, en, itw] = nearest(1 - r, 2 / 5)
  return it ? `circa ${itw} di ${name} in meno` : `about ${en} ${less} ${name}`
}

/** The power in words: "twice the power", "about a quarter more power", "circa un quarto di potenza in più". */
export function powerWords(r: number, lang: CLang): string {
  const it = lang === "it"
  if (Math.abs(r - 1) < 0.02) return it ? "quasi la stessa potenza" : "almost the same power"
  if (Math.abs(r - 1) < 0.08) return r > 1 ? (it ? "un po' più di potenza" : "slightly more power") : it ? "un po' meno potenza" : "slightly less power"
  if (r >= 1.75) {
    const n = Math.round(r)
    const a = Math.abs(r / n - 1) <= 0.025 ? "" : it ? "circa " : "about "
    if (n === 2) return it ? `${a}il doppio della potenza` : `${a}twice the power`
    if (n === 3) return it ? `${a}il triplo della potenza` : `${a}three times the power`
    return it ? `circa ${n} volte la potenza` : `about ${n} times the power`
  }
  if (r > 1) {
    const [, en, itw] = nearest(r - 1, 3 / 4)
    return it ? `circa ${itw} di potenza in più` : `about ${en} more power`
  }
  if (r >= 0.45 && r <= 0.55) {
    const a = Math.abs(r - 0.5) <= 0.025 ? "" : it ? "circa " : "about "
    return it ? `${a}metà della potenza` : `${a}half the power`
  }
  if (r < 0.45) {
    const [, en, itw] = nearest(r, 2 / 5)
    return it ? `solo circa ${itw} della potenza` : `about ${en} of the power`
  }
  const [, en, itw] = nearest(1 - r, 2 / 5)
  return it ? `circa ${itw} di potenza in meno` : `about ${en} less power`
}

/**
 * How much sooner (or later) the fuel runs out, in words: "in about half the
 * time", "about a fifth sooner", "about a third later"; Italian
 * "in circa metà del tempo", "circa un quinto prima", "circa un terzo dopo".
 */
export function soonerWords(r: number, lang: CLang): string {
  const it = lang === "it"
  if (Math.abs(r - 1) < 0.02) return it ? "quasi nello stesso tempo" : "in almost the same time"
  if (Math.abs(r - 1) < 0.08) return r < 1 ? (it ? "un po' prima" : "slightly sooner") : it ? "un po' dopo" : "slightly later"
  if (r >= 1.75) {
    const n = Math.round(r)
    const a = Math.abs(r / n - 1) <= 0.05 ? "" : it ? "circa " : "about "
    return it ? `in ${a}${n === 2 ? "il doppio" : n === 3 ? "il triplo" : `${n} volte il`} del tempo` : `in ${a}${n === 2 ? "twice" : n === 3 ? "three times" : `${n} times`} the time`
  }
  if (r > 1) {
    const [, en, itw] = nearest(r - 1, 3 / 4)
    return it ? `circa ${itw} dopo` : `about ${en} later`
  }
  if (r >= 0.45 && r <= 0.55) {
    const a = Math.abs(r - 0.5) <= 0.025 ? "" : it ? "circa " : "about "
    return it ? `in ${a}metà del tempo` : `in ${a}half the time`
  }
  if (r < 0.45) {
    const [, en, itw] = nearest(r, 2 / 5)
    return it ? `in circa ${itw} del tempo` : `in about ${en} of the time`
  }
  const [, en, itw] = nearest(1 - r, 2 / 5)
  return it ? `circa ${itw} prima` : `about ${en} sooner`
}

/** A ratio in words: "a carbon‑12 to carbon‑13 ratio twice as high", "un rapporto … dimezzato". */
export function ratioWords(r: number, num: string, den: string, lang: CLang): string {
  const it = lang === "it"
  const what = it ? `un rapporto ${num}/${den}` : `${/^[aeiou]/i.test(num) ? "an" : "a"} ${num} to ${den} ratio`
  let how: string
  if (Math.abs(r - 1) < 0.02) how = it ? "quasi uguale" : "almost the same"
  else if (r >= 1.75) {
    const n = Math.round(r)
    const exact = Math.abs(r / n - 1) <= 0.05
    const word = it ? (n === 2 ? "doppio" : n === 3 ? "triplo" : `${n} volte più alto`) : `${n === 2 ? "twice" : n === 3 ? "three times" : `${n} times`} as high`
    how = `${exact ? "" : it ? "circa " : "about "}${word}`
  } else if (r >= 0.45 && r <= 0.55) {
    const exact = Math.abs(r - 0.5) <= 0.025
    how = it ? `${exact ? "" : "circa "}dimezzato` : `${exact ? "" : "about "}half as high`
  } else if (r > 1) {
    const [, en, itw] = nearest(r - 1, 3 / 4)
    how = it ? `circa ${itw} più alto` : `about ${en} higher`
  } else {
    const [, en, itw] = nearest(1 - r, 2 / 5)
    how = it ? `circa ${itw} più basso` : `about ${en} lower`
  }
  return `${what} ${how}`
}

const YR = 3.15576e7

/** A burn's length in words: "1 billion years", "17 minutes", "6,4 milioni di anni". */
export function durationWords(s: number, lang: CLang): string {
  const it = lang === "it"
  const y = s / YR
  const n = (x: number) => dec(String(sig2(x)), lang)
  if (y >= 1e9) return it ? `${n(y / 1e9)} ${sig2(y / 1e9) === 1 ? "miliardo" : "miliardi"} di anni` : `${n(y / 1e9)} billion years`
  if (y >= 1e6) return it ? `${n(y / 1e6)} ${sig2(y / 1e6) === 1 ? "milione" : "milioni"} di anni` : `${n(y / 1e6)} million years`
  if (y >= 2) return it ? `${group(sig2(y), lang)} anni` : `${group(sig2(y), lang)} years`
  if (s >= 2 * 86400) return it ? `${n(s / 86400)} giorni` : `${n(s / 86400)} days`
  if (s >= 2 * 3600) return it ? `${n(s / 3600)} ore` : `${n(s / 3600)} hours`
  if (s >= 120) return it ? `${n(s / 60)} minuti` : `${n(s / 60)} minutes`
  return it ? `${n(s)} secondi` : `${n(s)} seconds`
}

export function temperatureWords(T9: number, lang: CLang): string {
  const mk = sig2(T9 * 1000)
  // the one-line model caveat: MK in English (docs/STYLE.md), in words in Italian
  return lang === "it" ? `${group(mk, lang)} milioni di K` : `${group(mk, lang)} MK`
}

/** A site's own limit, on every card of that site (from its note in scenarios.yaml). */
const SITE_NOTES: Record<string, Words> = {
  "agb-thermal-pulse": {
    en: "This pulse gives the nuclei several times the neutron exposure of a real one: read the size of the change with care.",
    it: "In questo modello l'esposizione ai neutroni è parecchie volte quella di un impulso vero: l'entità della variazione va letta con cautela.",
  },
  "massive-he-core": {
    en: "For this site the sizes are upper limits: read the direction of the change.",
    it: "Per questo ambiente stellare le variazioni indicate sono un limite superiore: conta soprattutto il segno.",
  },
}

export interface CuriosityText {
  /** the sentence in pieces, the bold ones marked */
  parts: { text: string; bold?: boolean }[]
  /** the same, plain: alt text, citation, screen readers */
  sentence: string
  hook: string
  /** "One-zone model at 16 MK over 1 billion years. Real stars adjust.", then the site's and the card's own limits */
  caveat: string
  /** the caveat without those limits (one line on the social card) */
  shortCaveat: string
  /** for a card with energy in it: the energy's own caveat, short (a second line on the social card) */
  shortEnergy: string | null
  amount: string
  percent: string
  /** "Biggest knock-on effect: ²³Na (−21%)" */
  knockLine: string | null
  /** "Energy output +62%; the hydrogen lasts 46% less." */
  energyLine: string | null
}

/** The fuels of the burns, by name: in a sentence, and with its article (Italian). */
const FUEL: Record<string, { en: string; it: string; itThe: string }> = {
  p: { en: "hydrogen", it: "idrogeno", itThe: "l'idrogeno" },
  he4: { en: "helium", it: "elio", itThe: "l'elio" },
  c13: { en: "carbon‑13", it: "carbonio‑13", itThe: "il carbonio‑13" },
}

export interface CuriosityContext {
  reaction: string
  T9: number
  tFinal: number
  cooling: boolean
  /** the most striking knock-on effect, its nucleus as a label (²³Na) */
  knock?: { label: string; ratio: number } | null
  /** the energy line's numbers (curiosityEnergy) */
  energy?: EnergyLine | null
  /** for an energy card: how the fuel time changed (curiosityFuel) */
  fuelRatio?: number | null
  /** the burn's fuel (lib/rates/energy.ts fuelOf) and whether the burn stops on it (else its first 1% is timed) */
  fuel?: string | null
  until?: boolean
}

/** "+62%", "the hydrogen lasts 46% less" etc.: a percentage without its sign, ≤ 2 significant figures. */
const pctAbs = (r: number, lang: CLang) => percentText(r, lang).replace(/^[+−±]/, "")
/** "il 46%", "l'8%", "l'11%": the Italian article before a percentage, as it is read (lib/rates/i18n.ts alPercent). */
function ilPct(p: string): string {
  const n = parseInt(p, 10)
  return n === 1 || n === 8 || n === 11 || (n >= 80 && n <= 89) ? `l'${p}` : `il ${p}`
}

/** The fuel-time half of an energy line. */
function fuelClause(r: number, fuel: string, until: boolean, lang: CLang): string {
  const f = FUEL[fuel] ?? { en: fuel, it: fuel, itThe: fuel }
  const it = lang === "it"
  const big = r >= 1.75
  const p = pctAbs(r, lang)
  if (until) {
    if (it) return big ? `${f.itThe} dura ${p}` : `${f.itThe} dura ${ilPct(p)} ${r < 1 ? "in meno" : "in più"}`
    return big ? `the ${f.en} lasts ${p} as long` : `the ${f.en} lasts ${p} ${r < 1 ? "less" : "longer"}`
  }
  const first = it ? `il primo 1% ${f.itThe.startsWith("l'") ? "dell'" + f.it : "del " + f.it}` : `the first 1% of the ${f.en}`
  if (it) return big ? `${first} impiega ${p} il tempo` : `${first} brucia ${ilPct(p)} ${r < 1 ? "prima" : "dopo"}`
  return big ? `${first} takes ${p} as long` : `${first} burns ${p} ${r < 1 ? "sooner" : "later"}`
}

export function curiosityText(spec: CuriositySpec, r: number, lang: CLang, ctx: CuriosityContext): CuriosityText {
  const it = lang === "it"
  const percent = percentText(r, lang)
  const lead = it ? `Se la ${ctx.reaction} fosse due volte più veloce,` : `If ${ctx.reaction} were twice as fast,`
  let amount: string
  let parts: { text: string; bold?: boolean }[]
  if (spec.kind === "energy") {
    amount = powerWords(r, lang)
    const f = ctx.fuel ? FUEL[ctx.fuel] : null
    const fr = ctx.fuelRatio
    parts = [
      { text: lead, bold: true },
      { text: it ? ` ${spec.where.it} produrrebbe ` : ` ${spec.where.en} would make ` },
      { text: amount, bold: true },
      { text: ` (${percent})` },
    ]
    if (f && fr !== null && fr !== undefined) {
      const verb = ctx.until
        ? it
          ? ` ed esaurirebbe ${f.itThe} `
          : ` and run out of ${f.en} `
        : it
          ? ` e brucerebbe il primo 1% ${f.itThe.startsWith("l'") ? "dell'" + f.it : "del " + f.it} `
          : ` and burn its first 1% of ${f.en} `
      parts.push({ text: verb }, { text: soonerWords(fr, lang), bold: true }, { text: ` (${percentText(fr, lang)}).` })
    } else parts.push({ text: "." })
  } else {
    const plural = spec.kind === "neutrino"
    amount = spec.per
      ? ratioWords(r, spec.name[lang], spec.perName![lang], lang)
      : amountWords(r, spec.name[lang], lang, plural)
    const mid = plural
      ? it
        ? ` ${spec.where.it} emetterebbe `
        : ` ${spec.where.en} would give off `
      : it
        ? ` ${spec.where.it} finirebbe con `
        : ` ${spec.where.en} would end up with `
    parts = [{ text: lead, bold: true }, { text: mid }, { text: amount, bold: true }, { text: ` (${percent}).` }]
  }
  const T = temperatureWords(ctx.T9, lang)
  const d = durationWords(ctx.tFinal, lang)
  const knockLine = ctx.knock
    ? it
      ? `Effetto a catena più forte: ${ctx.knock.label} (${percentText(ctx.knock.ratio, lang)}).`
      : `Biggest knock-on effect: ${ctx.knock.label} (${percentText(ctx.knock.ratio, lang)}).`
    : null
  const e = ctx.energy
  const scope = spec.energyScope?.[lang]
  // a burn that stops when its fuel runs out releases the same energy whatever the rate: only how fast changes
  const same = Boolean(!scope && e && ctx.until && e.fuel !== null && Math.abs(e.power * e.fuel - 1) < EXTRA_MIN)
  const energyLine = same
    ? it
      ? `La stessa energia, liberata ${soonerWords(e!.fuel!, lang)}: potenza ${percentText(e!.power, lang)}.`
      : `The same energy, released ${soonerWords(e!.fuel!, lang)}: power ${percentText(e!.power, lang)}.`
    : e
    ? (scope
        ? it
          ? `${scope}: energia prodotta ${percentText(e.power, lang)}`
          : `${scope}: energy output ${percentText(e.power, lang)}`
        : it
          ? `Energia prodotta ${percentText(e.power, lang)}`
          : `Energy output ${percentText(e.power, lang)}`) +
      (!scope && e.fuel !== null && ctx.fuel && Math.abs(e.fuel - 1) >= 0.01 ? `; ${fuelClause(e.fuel, ctx.fuel, Boolean(ctx.until), lang)}` : "") +
      "."
    : null
  const hasEnergy = spec.kind === "energy" || spec.kind === "neutrino" || energyLine !== null
  const energyNote = hasEnergy
    ? spec.kind === "neutrino"
      ? it
        ? "I neutrini sono quelli di questo gas alla temperatura del modello: una stella vera regolerebbe la temperatura per mantenere la sua luminosità."
        : "The neutrinos are those of this gas at the model's temperature: a real star would adjust its temperature to keep its luminosity."
      : it
        ? "L'energia è quella di questo gas alla temperatura del modello, non la luminosità della stella: una stella vera regolerebbe la temperatura per mantenere la sua luminosità."
        : "The energy is that of this gas at the model's temperature, not the star's luminosity: a real star would adjust its temperature to keep its luminosity."
    : null
  const shortEnergy = hasEnergy
    ? spec.kind === "neutrino"
      ? it
        ? "Neutrini di questo gas: una stella vera regolerebbe la temperatura."
        : "Neutrinos of this gas: a real star would adjust its temperature."
      : it
        ? "Energia del gas, non luminosità della stella: una stella vera regolerebbe la temperatura."
        : "Energy of this gas, not the star's luminosity: a real star would adjust its temperature."
    : null
  const extra = [SITE_NOTES[spec.site]?.[lang], spec.note?.[lang], energyNote].filter(Boolean).map((x) => ` ${x}`).join("")
  const shortCaveat = it
    ? `Modello a zona singola${ctx.cooling ? ` che si raffredda da ${T}` : `, ${T}`}, ${d}. Una stella vera si riassesta.`
    : `One-zone model ${ctx.cooling ? `cooling from ${T}` : `at ${T}`} over ${d}. Real stars adjust.`
  const caveat = shortCaveat + extra
  return {
    parts,
    sentence: parts.map((p) => p.text).join(""),
    hook: spec.hook[lang],
    caveat,
    shortCaveat,
    shortEnergy,
    amount,
    percent,
    knockLine,
    energyLine,
  }
}

/** Everything a card prints in words, for the social cards' manifest and its staleness test. */
export const cardText = (c: CuriosityText) => [c.sentence, c.knockLine, c.energyLine].filter(Boolean).join("\n")

/** The explorer's address that applies the change: `{ path, hash }`. */
export function curiosityTry(spec: CuriositySpec): { path: string; hash: string } {
  const s = `site=${spec.site}&s=${spec.reaction}:2&c=${spec.id}`
  return spec.net === "sprocess"
    ? { path: "/atlas/rates/s-process", hash: `#${s}` }
    : { path: "/atlas/rates", hash: `#${spec.net}&${s}` }
}

export const curiosityPath = (id: string) => `/atlas/rates/curiosities/${id}`

// -- one card's context, from the files ------------------------------------------

/** What curiosityContext reads of a network file and its baseline (structural, so this file imports nothing). */
export interface NetworkLike {
  id: string
  nuclei: { name: string; label: string; Z: number }[]
  reactions: { id: string; label: string; reactants: number[]; products: number[]; weakType?: string | null }[]
  scenarios: { id: string; T9: number; profile?: unknown; until: unknown }[]
}
export interface BaselineLike {
  runs: Record<string, { tFinal: number; final: number[]; energy?: { fuel: string | null } }>
}

/** A knock-on line names only a nucleus with a final mass fraction of at least this. */
export const KNOCK_FLOOR = 1e-10

/**
 * A reaction's own nuclei, by name: its reactants and products and what
 * each of them decays to in one step (¹⁸F(p,α)¹⁵O owns ¹⁸O, ²⁰Ne(p,γ)²¹Na
 * owns ²¹Ne), since a nucleus one decay away moves with them by
 * construction and is no knock-on effect.
 */
export function ownNuclei(network: NetworkLike, reaction: NetworkLike["reactions"][number]): string[] {
  const direct = new Set([...reaction.reactants, ...reaction.products])
  const own = new Set(direct)
  for (const d of network.reactions)
    if (d.weakType && d.reactants.length === 1 && direct.has(d.reactants[0])) for (const i of d.products) own.add(i)
  return [...own].map((i) => network.nuclei[i].name)
}

/** Everything curiosityText needs besides the ratio, read from the shipped files. */
export function curiosityContext(
  spec: CuriositySpec,
  sens: SensitivityLike,
  network: NetworkLike,
  baseline: BaselineLike,
): CuriosityContext {
  const s = network.scenarios.find((x) => x.id === spec.site)
  const r = network.reactions.find((x) => x.id === spec.reaction)
  const run = baseline.runs[spec.site]
  if (!s || !r || !run) throw new Error(`curiosity ${spec.id}: no scenario, reaction or baseline`)
  const own = ownNuclei(network, r)
  const index = new Map(network.nuclei.map((n, i) => [n.name, i]))
  // in the s-process the iron-group seeds (Z ≤ 28) only follow the neutrons: the knock-on is a product
  const knock = curiosityKnock(spec, sens, own, (name) => {
    const i = index.get(name) ?? -1
    const x = run.final[i] ?? 0
    return x >= KNOCK_FLOOR && (network.id !== "sprocess" || network.nuclei[i].Z > 28) ? x : 0
  })
  return {
    reaction: r.label,
    T9: s.T9,
    tFinal: run.tFinal,
    cooling: Boolean(s.profile),
    knock: knock ? { label: network.nuclei[index.get(knock.name)!].label, ratio: knock.ratio } : null,
    energy: curiosityEnergy(spec, sens),
    fuelRatio: spec.kind === "energy" ? curiosityFuel(spec, sens) : null,
    fuel: run.energy?.fuel ?? null,
    until: Boolean(s.until),
  }
}
