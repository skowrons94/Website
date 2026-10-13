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
 * Pure and dependency-free, so the pages (at build time), the card script
 * (scripts/rates/curiosity-cards.mjs) and test:rates share it.
 */

export type CLang = "en" | "it"
type Words = Record<CLang, string>

export interface CuriositySpec {
  /** the slug of its page, /atlas/rates/curiosities/<id> */
  id: string
  net: string
  site: string
  /** the reaction doubled (an id of the network file) */
  reaction: string
  /** the nucleus the sentence is about, and, for a ratio, the one below it */
  nucleus: string
  per?: string
  /** names in words (a monoisotopic element by its element name) */
  name: Words
  perName?: Words
  /** the site, as the subject of the sentence: "this model of …" */
  where: Words
  /** why it matters, at most 15 words, no numbers of the model */
  hook: Words
  /** a limit of the model for this one result, after the caveat */
  note?: Words
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
      it: "I granelli di polvere di stelle nei meteoriti conservano questo rapporto; LUNA ha misurato il tasso nel 2016.",
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
      it: "Il sodio varia tra le stelle degli ammassi globulari; tasso misurato da LUNA nel 2018.",
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
      en: "Aluminium‑26's 1.809 MeV glow maps the Milky Way.",
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
      en: "Sodium‑22's 1.275 MeV gamma-ray line has not yet been seen from a nova.",
      it: "La riga gamma a 1,275 MeV del sodio‑22 non è ancora mai stata vista in una nova.",
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
      en: "More seeds share the same neutrons, so each one climbs less far towards barium.",
      it: "Più semi si dividono gli stessi neutroni, così ognuno sale meno verso il bario.",
    },
  },
]

/** Nuclei no curiosity may headline (see above). */
export const NEVER_HEADLINE = ["au197", "eu151", "eu153", "f19", "tc99"]

// -- the numbers ----------------------------------------------------------------

export interface SensitivityLike {
  scenarios: Record<string, { nuclei: string[]; reactions: string[]; s: number[][] }>
}

/** The response s of a nucleus to the reaction ×2 (log₂ of the ratio), or null. */
export function sensOf(sens: SensitivityLike, site: string, reaction: string, nucleus: string): number | null {
  const t = sens.scenarios[site]
  if (!t) return null
  const r = t.reactions.indexOf(reaction)
  const n = t.nuclei.indexOf(nucleus)
  return r < 0 || n < 0 ? null : t.s[r][n]
}

/** changed ÷ unchanged at the end of the burn (of the ratio, for a ratio). */
export function curiosityRatio(spec: CuriositySpec, sens: SensitivityLike): number {
  const a = sensOf(sens, spec.site, spec.reaction, spec.nucleus)
  const b = spec.per ? sensOf(sens, spec.site, spec.reaction, spec.per) : 0
  if (a === null || b === null) throw new Error(`curiosity ${spec.id}: no sensitivity for ${spec.reaction} / ${spec.nucleus}`)
  return 2 ** (a - b)
}

// -- the words ------------------------------------------------------------------

const dec = (s: string, lang: CLang) => (lang === "it" ? s.replace(".", ",") : s)
const sig2 = (x: number) => Number(x.toPrecision(2))
/** 1,000 / 1.000 and 78,000 / 78.000: thousands grouped as each language does. */
const group = (x: number, lang: CLang) =>
  x >= 1000 ? Math.round(x).toLocaleString(lang === "it" ? "it-IT" : "en-GB") : dec(String(x), lang)

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
export function amountWords(r: number, name: string, lang: CLang): string {
  const it = lang === "it"
  const about = (exact: boolean) => (exact ? "" : it ? "circa " : "about ")
  if (Math.abs(r - 1) < 0.02) return it ? `quasi la stessa quantità di ${name}` : `almost the same amount of ${name}`
  if (Math.abs(r - 1) < 0.08) return r > 1 ? (it ? `un po' più di ${name}` : `slightly more ${name}`) : it ? `un po' meno di ${name}` : `slightly less ${name}`
  if (r >= 1.75) {
    const n = Math.round(r)
    const exact = Math.abs(r / n - 1) <= 0.05
    if (TIMES[n]) return it ? `${about(exact)}${TIMES[n][1]} di ${name}` : `${about(exact)}${TIMES[n][0]} as much ${name}`
    return it ? `circa ${n} volte più ${name}` : `about ${n} times as much ${name}`
  }
  if (r > 1) {
    const [v, en, itw] = nearest(r - 1, 3 / 4)
    if (v === 1 / 2 && !it) return `about one and a half times as much ${name}`
    return it ? `circa ${itw} di ${name} in più` : `about ${en} more ${name}`
  }
  // less
  if (r >= 0.45 && r <= 0.55) {
    const exact = Math.abs(r - 0.5) <= 0.025
    return it ? `${about(exact)}metà ${delIt(name)}` : `${about(exact)}half as much ${name}`
  }
  if (r < 0.45) {
    const [, en, itw] = nearest(r, 2 / 5)
    return it ? `solo circa ${itw} ${delIt(name)}` : `about ${en} as much ${name}`
  }
  const [, en, itw] = nearest(1 - r, 2 / 5)
  return it ? `circa ${itw} di ${name} in meno` : `about ${en} less ${name}`
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
  return lang === "it" ? `${group(mk, lang)} milioni di K` : `${group(mk, lang)} million K`
}

/** A site's own limit, on every card of that site (from its note in scenarios.yaml). */
const SITE_NOTES: Record<string, Words> = {
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
  /** "One-zone model at 16 million K over 1 billion years. Real stars adjust.", then the site's and the card's own limits */
  caveat: string
  /** the caveat without those limits (one line on the social card) */
  shortCaveat: string
  amount: string
  percent: string
}

export function curiosityText(
  spec: CuriositySpec,
  r: number,
  lang: CLang,
  ctx: { reaction: string; T9: number; tFinal: number; cooling: boolean },
): CuriosityText {
  const it = lang === "it"
  const amount = spec.per
    ? ratioWords(r, spec.name[lang], spec.perName![lang], lang)
    : amountWords(r, spec.name[lang], lang)
  const percent = percentText(r, lang)
  const lead = it ? `Se la ${ctx.reaction} fosse due volte più veloce,` : `If ${ctx.reaction} were twice as fast,`
  const mid = it ? ` ${spec.where.it} finirebbe con ` : ` ${spec.where.en} would end up with `
  const parts = [{ text: lead, bold: true }, { text: mid }, { text: amount, bold: true }, { text: ` (${percent}).` }]
  const T = temperatureWords(ctx.T9, lang)
  const d = durationWords(ctx.tFinal, lang)
  const extra = [SITE_NOTES[spec.site]?.[lang], spec.note?.[lang]].filter(Boolean).map((x) => ` ${x}`).join("")
  const shortCaveat = it
    ? `Modello a una zona${ctx.cooling ? ` che si raffredda da ${T}` : `, ${T}`}, ${d}. Le stelle vere si adattano.`
    : `One-zone model ${ctx.cooling ? `cooling from ${T}` : `at ${T}`} over ${d}. Real stars adjust.`
  const caveat = shortCaveat + extra
  return { parts, sentence: parts.map((p) => p.text).join(""), hook: spec.hook[lang], caveat, shortCaveat, amount, percent }
}

/** The explorer's address that applies the change: `{ path, hash }`. */
export function curiosityTry(spec: CuriositySpec): { path: string; hash: string } {
  const s = `site=${spec.site}&s=${spec.reaction}:2&c=${spec.id}`
  return spec.net === "sprocess"
    ? { path: "/atlas/rates/s-process", hash: `#${s}` }
    : { path: "/atlas/rates", hash: `#${spec.net}&${s}` }
}

export const curiosityPath = (id: string) => `/atlas/rates/curiosities/${id}`
