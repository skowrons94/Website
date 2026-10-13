/**
 * The strings of the rates explorer (components/rates/*), English and
 * Italian. Kept apart from lib/i18n.ts so the explorer's bundle carries only
 * these; `it` must have every key of `en` (TypeScript checks it).
 */

import type { Lang } from "@/lib/locale"

/** "all'1%", "allo 0,1%", "al 5%": the Italian article before a percentage, as it is read. */
function alPercent(f: number): string {
  const v = +(f * 100).toPrecision(2)
  const text = `${String(v).replace(".", ",")}%`
  if (v < 1) return `allo ${text}`
  const n = Math.floor(v)
  const vowel = n === 1 || n === 8 || n === 11 || (n >= 80 && n <= 89)
  return vowel ? `all'${text}` : `al ${text}`
}

const en = {
  network: "Network",
  networks: "Choose a network",
  sProcessTab: "s-process",
  where: "Where it burns",
  site: "Site",
  conditions: "Conditions",
  adjust: "Change the conditions",
  temperature: "Temperature",
  density: "Density",
  burnTime: "Burn time",
  stopOnFuel: (fuel: string, f = 0.01) =>
    `Stop when ${fuel} falls to ${+(f * 100).toPrecision(2)}% of its initial amount`,
  metals: "Heavier elements",
  metalsHint: (f: string) => (f === "1" ? "×1 (as in the scenario)" : `×${f} the scenario's`),
  metalsCap: (max: string) =>
    `At most ×${max} here: hydrogen and helium shrink to make room, and keep at least a tenth of the mass.`,
  hydrogen: "Hydrogen",
  helium: "Helium",
  screening: "Electron screening",
  screeningHint: "The electrons around the nuclei lower the Coulomb barrier a little.",
  resetConditions: "Back to the scenario",
  source: "Source",
  sourceOf: "Where these numbers come from",
  sources: "Sources",
  million: "million",
  validity: (t: string) =>
    `${t} is outside the temperature range REACLIB fits are made for (0.01–10 GK): treat the rates with care.`,
  howTo: "Choose a network and a site, drag the temperature, then change a rate and see what follows.",

  // the page's story
  step1: "How fast",
  step2: "Who is slowest",
  step3: "What if",
  headline: (site: string, reaction: string, time: string, cycle = true) =>
    `${site}: the slowest step of the ${cycle ? "cycle" : "chain"} is ${reaction}, ${time} on average. Everything else waits for it.`,
  headlineIdle: (list: string) => `Slower than the whole burn, so they barely run here: ${list}.`,
  headlineLeak: (reaction: string) => `The flow leaves the cycle through ${reaction}.`,
  headlineStall: (nucleus: string) => `So the flow stops and piles up at ${nucleus}.`,
  headlineShort: "Bottleneck",
  tryIt: "What if it were faster?",
  notation: {
    pp: "How to read ¹H(p,e⁺ν)²H: two protons fuse, emitting a positron and a neutrino, and become deuterium.",
    cno: "How to read ¹⁴N(p,γ)¹⁵O: nitrogen-14 captures a proton (p), gives off a gamma ray (γ) and becomes oxygen-15.",
    nena: "How to read ²²Ne(p,γ)²³Na: neon-22 captures a proton (p), gives off a gamma ray (γ) and becomes sodium-23.",
    mgal: "How to read ²⁵Mg(p,γ)²⁶Al: magnesium-25 captures a proton (p), gives off a gamma ray (γ) and becomes aluminium-26.",
  } as Record<string, string>,

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
  showAllNuclei: "Show every nucleus",
  showKeyNuclei: "Show the main nuclei",
  rateAxis: "N_A⟨σv⟩ (cm³ mol⁻¹ s⁻¹)",
  faster: "↑ faster",
  ratioAxis: (ref: string) => `ratio to ${ref}`,
  tAxis: "Temperature (GK)",
  tAxisMK: "million K",
  decaysNote:
    "Not plotted: decays, which hardly depend on temperature (laboratory half-lives), with two exceptions: ²⁶Al, whose short-lived isomer, populated by the heat, speeds up its decay above about 0.1 GK, and ⁷Be's electron capture, which depends on the electron density. All are in the next chart.",
  pickHint: "Choose up to three reactions to colour; the others stay grey.",
  scrubHint: "Drag across the chart, or use the slider below it, to change the temperature.",
  pickFull: "Three reactions are already coloured: clear one to colour another.",
  highlight: "Colour",
  now: "now",
  sites: "Sites",
  hoverAt: (t: string) => `At ${t}`,
  ratesChartLabel: (n: number) =>
    `Line chart of the reaction rates of ${n} reactions against temperature, both on logarithmic scales.`,
  scaledBand: (f: string) => `shaded: your ×${f}`,

  // the Gamow peak
  gamowTitle: "Why heat matters so much",
  gamowLead: (reaction: string) =>
    `For ${reaction}: few nuclei are fast (grey falling curve), and only fast ones tunnel through the Coulomb barrier (grey rising curve). The reactions happen where the two overlap, the Gamow peak.`,
  gamowPeak: (e0: string, w: string) => `Gamow peak: E₀ = ${e0} ± ${w}`,
  gamowAxis: "Energy (keV)",
  gamowWindow: "Gamow window",
  gamowMB: "how many nuclei",
  gamowTunnel: "chance to tunnel",
  gamowProduct: "reactions",
  gamowNone: "Choose a reaction between two charged nuclei to see its Gamow peak.",
  gamowLabel: (reaction: string, T: string) =>
    `The Gamow peak of ${reaction} at ${T}: the Maxwell–Boltzmann distribution, the tunnelling probability and their product against energy.`,

  // lifetimes
  lifeTitle: "How long does a nucleus wait?",
  lifeLead:
    "At these conditions, how long a nucleus waits, on average, before each reaction turns it into something else. Each dot is one reaction, on a logarithmic time axis.",
  lifeFine:
    "Waiting times at the start of the burn (for a nova, at its peak), with the scenario's initial composition: as the partners of a reaction are used up or built up, the waits change.",
  lifeFineNet: {
    pp: "Here ³He starts at its protosolar value, so its waits are shorter than in the Sun today.",
    mgal: "At 25 M☉ the ²⁶Al left at the end is what survives its own decay once ²⁵Mg has run out; in a real star the winds carry part of it away before.",
  } as Record<string, string>,
  pathEnd: (path: string, end: string) => `The flow goes ${path}, and ends as ${end}.`,
  pathStall: (path: string, end: string) => `The flow goes ${path} → ${end}, and piles up at ${end} within the burn.`,
  pathPp: "Most ³He fuses with another ³He (ppI); a share captures ⁴He and goes on through ⁷Be (ppII and ppIII).",
  bottleneck: "bottleneck",
  waits: (nucleus: string) => `${nucleus} nuclei wait`,
  lifeAxis: "Mean waiting time",
  lifeChartLabel: "Dot chart of the mean waiting time of a nucleus before each reaction, on a logarithmic time axis.",
  never: "never (no partner)",
  burnRef: "burn time",
  sunRef: "age of the Sun",
  unscaled: "unchanged",
  cycleOnly: "Bottleneck taken along the path the flow takes.",
  pathNote: (path: string) => `The flow goes ${path}.`,

  // the flow ring
  ringTitle: "Where the matter flows",
  ringLead:
    "The path a nucleus takes, from the network itself: each arrow's width is how much matter went through that step during the burn; side arrows are leaks out of the path.",
  ringLabel: (path: string) => `Diagram of the flow along ${path}; arrow widths are the integrated flows of the burn.`,
  ringChangedKey: "coloured, with the factor: the steps whose flow changed by more than 2%; grey outline: unchanged",
  ringSlowest: "slowest",

  // what if
  whatIfTitle: "What if a rate were different?",
  whatIfLead:
    "Every rate is known only within an uncertainty, from a few per cent to a factor of ten. Choose one, change it, and see which nuclei come out different at the end of the burn.",
  pickReaction: "Choose a reaction to change",
  moreReactionsPick: "Any reaction of the network…",
  yourChanges: "Your changes",
  noChanges: "No rate changed yet.",
  remove: (label: string) => `Undo the change to ${label}`,
  factor: "factor",
  half: "÷2",
  double: "×2",
  resetAll: "Reset all rates",
  reset: "Reset",
  moreReactions: "Every reaction of the network",
  changedTitle: "What changes most",
  changedLead: (time: string, baseTime?: string) =>
    baseTime && baseTime !== time
      ? `Final mass fraction, changed ÷ unchanged: the changed burn stopped after ${time}, the unchanged one after ${baseTime}. Bars to the right: more of that nucleus.`
      : `Final mass fraction after ${time}, changed ÷ unchanged. Bars to the right: more of that nucleus.`,
  noChange: "Change a rate to see what it does: for now every nucleus ends as in the unchanged burn.",
  // what a change did: its own target apart, the knock-on effects as bars
  selfLine: (nucleus: string, ratio: string) => `${nucleus} itself: ${ratio}`,
  selfNote: (decay: boolean): string =>
    decay ? "(expected: it is the nucleus that decays)" : "(expected: it is what this reaction burns)",
  knockTitle: "Knock-on effects on the other nuclei",
  smallFold: (n: number) => `${n} ${n === 1 ? "nucleus changes" : "nuclei change"} by less than 1%`,
  /** [name, "cycle" | "chain"] of each light network (the second stays English in both languages: a key) */
  cycleOf: {
    pp: ["the pp chain", "chain"],
    cno: ["the CN cycle", "cycle"],
    nena: ["the NeNa cycle", "cycle"],
    mgal: ["the MgAl cycle", "cycle"],
  } as Record<string, [string, string]>,
  quietSelf: (nuclei: string, cycle?: [string, string]) =>
    cycle
      ? `In this burn ${cycle[0]} rebalances quickly: only ${nuclei} moves by more than 1%. Each nucleus of the ${cycle[1]} settles where it is burnt as fast as it is made, and the pace of the whole ${cycle[1]} is set by its slowest step.`
      : `Only ${nuclei} moves by more than 1%: the rest of the burn takes up the change.`,
  quietNone:
    "No nucleus moves by more than 1%: in this burn this reaction either barely runs or is not what anything waits for.",
  /** the text around the suggested reaction (a button) */
  trySuggest: (why: "slowest" | "sensitive", kind = "cycle"): [string, string] =>
    why === "slowest"
      ? ["Try ", `, the slowest step, to see the whole ${kind} respond.`]
      : ["Try ", ", one of the reactions this burn is most sensitive to."],
  trySuggestTitle: "Change this reaction instead, by the same factor",
  stripSelf: "itself",
  stripOthers: "the rest under 1%",
  stripQuiet: "no nucleus moves by more than 1%",
  stripTitle: "Effect",
  seeAll: "All results",
  more: "more",
  less: "less",
  ratioAxis2: "changed ÷ unchanged",
  changeChartLabel:
    "Bar chart of the ratio between the final abundances with the changed rates and without, per nucleus, on a logarithmic scale.",
  evolutionTitle: "Abundances during the burn",
  evolutionLead: "Mass fraction of each nucleus against time.",
  evolutionChanged: "Solid: with your changes; dashed: unchanged.",
  evolutionChartLabel: "Line chart of mass fractions against time, both on logarithmic scales.",
  massFraction: "Mass fraction",
  time: "Time",
  pickNuclei: "Nuclei shown (up to three)",
  calculating: "Calculating…",
  calculatingFor: (s: string) => `Calculating… ${s}`,
  calculated: (ms: number, _steps: number) => `Recalculated in your browser in ${ms} ms.`,
  precomputed: "Precomputed with the same solver; change anything to recalculate in your browser.",
  stoppedUntil: (fuel: string, time: string, f = 0.01) =>
    `The burn stopped after ${time}, when ${fuel} ran down to ${+(f * 100).toPrecision(2)}%.`,
  stoppedTime: (time: string) => `The burn ran for ${time}.`,
  failed: "The calculation failed:",
  baselineLabel: "unchanged",
  changedLabel: "changed",
  share: "Link to this setting",
  copied: "Link copied",

  // sensitivity
  sensTitle: "Which rate matters most?",
  sensLead:
    "Every rate doubled in turn, at the scenario's own conditions: the colour says how much each nucleus at the end of the burn follows it. +1: it doubles with the rate; −1: it halves.",
  sensButton: "Show the sensitivity map",
  sensHide: "Hide the sensitivity map",
  sensCustom: "Precomputed for the scenario's own conditions; back to the scenario to compare with them.",
  sensTry: "Click a cell to try that rate ×2 (arrow keys move between cells).",
  sensCell: (reaction: string, nucleus: string, s: string) => `${reaction} ×2: ${nucleus} ${s}`,
  sensLabel: "Heat map of the sensitivity of each nucleus to each reaction rate.",
  sensMore: "more of it",
  sensLess: "less of it",
  sensAll: "Every reaction",
  sensTop: "The most influential",

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
  colNote: "Note",
  colNucleus: "Nucleus",
  colX0: "X initial",
  colXBase: "X final, unchanged",
  colXNew: "X final, changed",
  colRatio: "ratio",
  equationRate: "λ(T₉) = Σ_sets exp(a₀ + a₁/T₉ + a₂ T₉^(−1/3) + a₃ T₉^(1/3) + a₄ T₉ + a₅ T₉^(5/3) + a₆ ln T₉)",
  equationLife:
    "τ = 1 / (c · ρ^n · Y_partner · λ · f_scr) for the target nucleus; for a decay τ = 1/λ (t½ / ln 2 in the laboratory; ²⁶Al's λ grows with T through its thermally populated isomer); for an electron capture τ = 1/(ρ Y_e λ). Y = X/A.",
  equationYdot:
    "dYᵢ/dt = Σ_r c_ir · prefactor_r · ρ^(n_r) · (Y_e) · Π Y_reactants · λ_r(T₉) · f_scr,r — pynucastro's equations term for term.",
  screenNote: "Screening: screen5, as in pynucastro (Wallace, Woosley & Weaver 1982).",
  units1: "s⁻¹",
  units2: "cm³ mol⁻¹ s⁻¹",
  units3: "cm⁶ mol⁻² s⁻¹",
  unitsEC: "cm³ mol⁻¹ s⁻¹ (×ρY_e → s⁻¹)",
  download: "Download",
  downloadCsv: "Rates and waiting times (CSV)",
  downloadRun: "This burn (JSON)",
  downloadNetwork: "Network file (JSON)",
  atlasPage: "Atlas page",
  provenance: (lib: string, tool: string) => `${lib} — ${tool}`,
  dataNote:
    "Rates are the REACLIB fits themselves, evaluated in your browser. Reverse rates are left out (negligible at these temperatures); nuclei outside the network are inert. Decays of nuclei that NUBASE2020 gives as stable or longer-lived than 10⁸ years are dropped.",
  newerTitle: "Rates with newer data",
  gamowResonances:
    "The window is where a smooth (non-resonant) cross section reacts most. A narrow resonance inside it dominates instead (²⁴Mg(p,γ) at 300 million kelvin through its 214 keV resonance, ²⁵Mg(p,γ) at 80 million kelvin): the rate then follows the resonance's energy, not the window.",
  nowFactor: (f: string) => `now ${f}`,
  luna: {
    title: "Rates from LUNA measurements",
    toggle: "Use the LUNA/AZURE2 rates",
    toggleHint: "for ¹²C(p,γ)¹³N and ¹³C(p,γ)¹⁴N",
    lead: "LUNA measured the two proton captures on carbon deep underground, down to 60 keV (Skowronski et al. 2023). Switched on, the burn uses rates computed from the R-matrix evaluations of those data on this site, instead of REACLIB's.",
    ratio: (T: string) => `¹²C/¹³C in CN equilibrium at ${T}`,
    ratioHint: "number ratio, = rate of ¹³C(p,γ) ÷ rate of ¹²C(p,γ): what hydrogen burning leaves, the ratio astronomers measure in red giants",
    reaclib: "REACLIB",
    lunaWord: "LUNA/AZURE2",
    burn: "at the end of this burn",
    versus: (label: string, f: string) => `${label}: ${f} × REACLIB's rate here`,
    evaluations: "The evaluations",
    method:
      "N_A⟨σv⟩ integrated numerically (Maxwell–Boltzmann) from each evaluation's cross section at its published parameters, from 1 keV to 4 MeV, narrow resonances resolved.",
    on: "on",
    off: "off",
  },
  builtBy:
    "Built by J. Skowronski; rates from his AZURE2 evaluations can be dropped in for REACLIB's, as ¹²C(p,γ) and ¹³C(p,γ) are here (What if ▸ LUNA/AZURE2 rates).",
  builtByPlain: "Built by J. Skowronski; the explorer can take rates from his AZURE2 evaluations in place of REACLIB's.",
  lunaChip: "LUNA",
  lunaChipTitle: (refs: string) => `Measured underground at LUNA: ${refs}`,
  // -- curiosities (lib/rates/curiosities.ts) ---------------------------------
  cur: {
    title: "Curiosities: what if a rate were twice as fast?",
    titleShort: "Curiosities",
    eyebrow: "Curiosity",
    lead: "One rate doubled, one burn, one nucleus. Every number comes from the explorer's own calculation.",
    tryIt: "Try it",
    know: "How we know this rate",
    knowSource: "Where this rate comes from",
    share: "Link to this curiosity",
    copyCitation: "Copy citation",
    copyLink: "Copy link",
    copied: "Copied",
    all: (n: number) => `All ${n} curiosities`,
    more: "Show three more",
    whatIf: "Doubling is a what-if, not the rate's actual uncertainty.",
    status: (label: string) => `How well this rate is known: ${label.toLowerCase()}.`,
    noStatus: "This rate has no atlas page yet: see its source.",
    today: "with today's rate",
    doubled: "with the rate ×2",
    ratioToday: "ratio, today's rate",
    ratioDoubled: "ratio, rate ×2",
    rate: "Rate",
    model: "Model",
    indexTitle: "Rate curiosities",
    indexLead:
      "What a reaction twice as fast would change, one sentence at a time. Each one comes from a one-zone burn of the rate explorer (a simplified model: one parcel of gas at a set temperature and density, with no mixing), says what it leaves out, and opens the exact calculation with “Try it”.",
    indexHow:
      "The numbers are read from the explorer's precomputed tables (every rate ×2 at each site's own conditions) and checked against a fresh run of the same solver. They are rounded to two significant figures. ×2 is a what-if: how well each rate is really known is given beside it, from the reaction atlas.",
    back: "Reaction rates",
    backAll: "All curiosities",
  },
  // -- the s-process explorer --------------------------------------------------
  sp: {
    lightTab: "Light-element networks",
    lead: "Choose a site, then change a neutron source, a poison or the seed and see how the heavy isotopes change.",
    whatIfLead: "Double or halve a reaction and see which heavy isotopes follow.",
    headline: (site: string, nc: string) => `${site}: about ${nc} neutrons captured by every iron seed.`,
    groups: {
      sources: ["Neutron sources", "The reactions that release the neutrons."],
      competitors: [
        "Competing and recycling reactions",
        "²²Ne(α,γ) burns the source without a neutron; ¹⁷O(α,n) gives back a neutron a poison took.",
      ],
      poisons: [
        "Neutron poisons",
        "Light nuclei, far more abundant than iron, that capture neutrons before the seeds can.",
      ],
      seeds: ["The seed", "Iron, where the chain starts."],
      branches: [
        "Branch points",
        "Unstable nuclei that can capture a neutron before they decay: their captures steer the path. Laboratory half-lives (¹⁵¹Sm's, for one, is shorter in a star), and ⁸⁵Kr without its isomer.",
      ],
    } as Record<string, [string, string]>,
    knobsTitle: "How much fuel and poison",
    knob: (n: string) => `Initial ${n}`,
    statsTitle: "The neutrons",
    exposure: "Neutron exposure",
    exposureHint: "how many neutrons a nucleus has met, per millibarn of its target area (1 mb = 10⁻²⁷ cm²)",
    exposureFormula: "neutron exposure τ = ∫ n_n v_T dt (mb⁻¹)",
    peak: "Peak neutron density",
    perSeed: "Neutrons captured per seed",
    perSeedHint: "per heavy nucleus from iron up",
    burn: "Burn",
    unchangedWord: "unchanged",
    distTitle: "What the burn made, from iron to bismuth",
    distLead:
      "Each dot is a stable isotope: how much more of it there is at the end of the burn than at the start, which is the solar mix. In this small layer, not in the whole star. Squares are s-only isotopes, made by the s-process alone; the shaded bands are the closed neutron shells, where the flow piles up.",
    distLabel:
      "Production factors of the stable isotopes from iron to bismuth against mass number, on a logarithmic scale.",
    massNumber: "Mass number A",
    productionFactor: "times more than at the start",
    isotope: "stable isotope",
    peaks: "The s-process peaks: strontium, yttrium, zirconium (A ≈ 88), barium, lanthanum, cerium (A ≈ 138) and lead (A = 208), where nuclei with closed neutron shells capture slowly and pile up.",
    shell: (n: number) => `N = ${n}`,
    sOnly: "s-only",
    below: "below a hundredth of the start (burnt)",
    notModelled: "needs a stellar decay this network lacks",
    heavy: "Iron and up",
    toResults: "See what changed",
    light: "Light nuclei",
    neutronTitle: "Neutron density during the burn",
    neutronLead: "Free neutrons per cubic centimetre.",
    neutronAxis: "neutrons per cm³",
    neutronLabel: "Line chart of the neutron density against time, both on logarithmic scales.",
    decayNote:
      "Abundances after the decay of every nucleus with a half-life under 10⁸ years (laboratory half-lives, as in REACLIB: the stellar half-lives of branch points such as ¹⁷⁶Lu or ⁷⁹Se are not modelled).",
    macsCol: (kT: string) => `MACS at kT = ${kT} (mb)`,
    macs30: "MACS at 30 keV (mb)",
    networkNote: (n: number, r: number) =>
      `${n} nuclei and ${r} reactions: the light nuclei that make and steal neutrons, and every nucleus from iron to polonium that the solar mix holds or that a neutron capture or a decay reaches from one living longer than six hours. Between heavy nuclei only (n,γ) and decays.`,
    sensNuclei: "Columns: iron, the s-only isotopes and the peaks",
  },
}

export type RatesDict = typeof en

const it: RatesDict = {
  network: "Rete",
  networks: "Scegli una rete",
  sProcessTab: "processo s",
  where: "Dove brucia",
  site: "Ambiente",
  conditions: "Condizioni",
  adjust: "Cambia le condizioni",
  temperature: "Temperatura",
  density: "Densità",
  burnTime: "Durata della combustione",
  stopOnFuel: (fuel: string, f = 0.01) =>
    `Ferma la combustione quando ${fuel} scende ${alPercent(f)} della quantità iniziale`,
  metals: "Elementi più pesanti",
  metalsHint: (f: string) => (f === "1" ? "×1 (come nello scenario)" : `×${f} rispetto allo scenario`),
  metalsCap: (max: string) =>
    `Al massimo ×${max} qui: idrogeno ed elio si riducono per fare posto, e tengono almeno un decimo della massa.`,
  hydrogen: "Idrogeno",
  helium: "Elio",
  screening: "Schermaggio elettronico",
  screeningHint: "Gli elettroni intorno ai nuclei abbassano un poco la barriera coulombiana.",
  resetConditions: "Torna allo scenario",
  source: "Fonte",
  sourceOf: "Da dove vengono questi numeri",
  sources: "Fonti",
  million: "milioni",
  validity: (t: string) =>
    `${t} è fuori dall'intervallo di temperature per cui sono fatti i fit di REACLIB (0,01–10 GK): prendi i tassi con cautela.`,
  howTo: "Scegli una rete e un ambiente; trascina la temperatura; poi cambia un tasso e guarda che cosa cambia.",

  step1: "Quanto sono veloci",
  step2: "Chi è il più lento",
  step3: "E se",
  headline: (site: string, reaction: string, time: string, cycle = true) =>
    `${site}: il passo più lento ${cycle ? "del ciclo" : "della catena"} è la reazione ${reaction}, in media ${time}. Tutti gli altri devono aspettarla.`,
  headlineIdle: (list: string) => `Più lente dell'intera combustione, quindi qui quasi non avvengono: ${list}.`,
  headlineLeak: (reaction: string) => `Il flusso esce dal ciclo con la ${reaction}.`,
  headlineStall: (nucleus: string) => `Così il flusso si ferma e si accumula nel ${nucleus}.`,
  headlineShort: "Collo di bottiglia",
  tryIt: "E se fosse più veloce?",
  notation: {
    pp: "Come si legge ¹H(p,e⁺ν)²H: due protoni si fondono, emettono un positrone e un neutrino e diventano deuterio.",
    cno: "Come si legge ¹⁴N(p,γ)¹⁵O: l'azoto-14 cattura un protone (p), emette un raggio gamma (γ) e diventa ossigeno-15.",
    nena: "Come si legge ²²Ne(p,γ)²³Na: il neon-22 cattura un protone (p), emette un raggio gamma (γ) e diventa sodio-23.",
    mgal: "Come si legge ²⁵Mg(p,γ)²⁶Al: il magnesio-25 cattura un protone (p), emette un raggio gamma (γ) e diventa alluminio-26.",
  },

  ratesTitle: "Come cambiano i tassi con la temperatura",
  ratesLead:
    "Ogni linea è una reazione: quanto è rapida per una coppia di nuclei, al crescere della temperatura. Le linee ripide sono reazioni tra nuclei carichi, frenate dalla repulsione elettrica: un po' più di calore le accelera enormemente.",
  absolute: "Assoluti",
  relative: "Relativi",
  relativeTo: "Relativi a",
  plotMode: "Mostra",
  showAll: "Mostra tutte le reazioni",
  showKey: "Mostra le reazioni principali",
  showAllNuclei: "Mostra tutti i nuclei",
  showKeyNuclei: "Mostra i nuclei principali",
  rateAxis: "N_A⟨σv⟩ (cm³ mol⁻¹ s⁻¹)",
  faster: "↑ più veloce",
  ratioAxis: (ref: string) => `rapporto con ${ref}`,
  tAxis: "Temperatura (GK)",
  tAxisMK: "milioni di K",
  decaysNote:
    "Non sono nel grafico: i decadimenti, che dipendono pochissimo dalla temperatura (tempi di dimezzamento di laboratorio), con due eccezioni: il ²⁶Al, il cui isomero di vita breve, popolato dal calore, ne accelera il decadimento sopra circa 0,1 GK, e la cattura elettronica del ⁷Be, che dipende dalla densità di elettroni. Sono tutti nel grafico successivo.",
  pickHint: "Scegli fino a tre reazioni da colorare (per una quarta libera prima un colore); le altre restano grigie.",
  scrubHint: "Trascina sul grafico, o usa il cursore sotto, per cambiare la temperatura.",
  pickFull: "Si possono colorare fino a tre reazioni: togline una per colorarne un'altra.",
  highlight: "Colora",
  now: "ora",
  sites: "Ambienti",
  hoverAt: (t: string) => `A ${t}`,
  ratesChartLabel: (n: number) =>
    `Grafico a linee dei tassi di ${n} reazioni in funzione della temperatura, entrambi in scala logaritmica.`,
  scaledBand: (f: string) => `in ombra: il tuo ×${f}`,

  gamowTitle: "Perché il calore conta tanto",
  gamowLead: (reaction: string) =>
    `Per la ${reaction}: pochi nuclei sono veloci (curva grigia che scende), e solo quelli veloci attraversano per effetto tunnel la barriera coulombiana (curva grigia che sale). Le reazioni avvengono dove le due si sovrappongono, il picco di Gamow.`,
  gamowPeak: (e0: string, w: string) => `Picco di Gamow: E₀ = ${e0} ± ${w}`,
  gamowAxis: "Energia (keV)",
  gamowWindow: "finestra di Gamow",
  gamowMB: "quanti nuclei",
  gamowTunnel: "probabilità di tunnel",
  gamowProduct: "reazioni",
  gamowNone: "Scegli una reazione tra due nuclei carichi per vedere il suo picco di Gamow.",
  gamowLabel: (reaction: string, T: string) =>
    `Il picco di Gamow della ${reaction} a ${T}: la distribuzione di Maxwell–Boltzmann, la probabilità di tunnel e il loro prodotto in funzione dell'energia.`,

  lifeTitle: "Quanto aspetta un nucleo?",
  lifeLead:
    "In queste condizioni, quanto aspetta in media un nucleo prima che ciascuna reazione lo trasformi in qualcos'altro. Ogni punto è una reazione, su un asse dei tempi logaritmico.",
  lifeFine:
    "Tempi di attesa all'inizio della combustione (per una nova, al picco), con la composizione iniziale dello scenario: mentre i partner di una reazione si consumano o si accumulano, le attese cambiano.",
  lifeFineNet: {
    pp: "Qui il ³He parte dal valore protosolare, quindi le sue attese sono più brevi che nel Sole di oggi.",
    mgal: "A 25 M☉ il ²⁶Al rimasto alla fine è quello che sopravvive al proprio decadimento dopo che il ²⁵Mg si è esaurito; in una stella vera i venti ne portano via una parte prima.",
  },
  pathEnd: (path: string, end: string) => `Il flusso va ${path} e finisce in ${end}.`,
  pathStall: (path: string, end: string) => `Il flusso va ${path} → ${end} e, nel tempo della combustione, si accumula nel ${end}.`,
  pathPp: "Quasi tutto il ³He si fonde con un altro ³He (ppI); una parte cattura ⁴He e prosegue attraverso il ⁷Be (ppII e ppIII).",
  bottleneck: "collo di bottiglia",
  waits: (nucleus: string) => `i nuclei di ${nucleus} aspettano`,
  lifeAxis: "Tempo medio di attesa",
  lifeChartLabel:
    "Grafico a punti del tempo medio di attesa di un nucleo prima di ciascuna reazione, su un asse dei tempi logaritmico.",
  never: "mai (manca il partner)",
  burnRef: "durata",
  sunRef: "età del Sole",
  unscaled: "originale",
  cycleOnly: "Collo di bottiglia scelto lungo il percorso che il flusso segue davvero.",
  pathNote: (path: string) => `Il flusso va ${path}.`,

  ringTitle: "Dove scorre la materia",
  ringLead:
    "Il percorso di un nucleo, ricavato dalla rete stessa: lo spessore di ogni freccia è quanta materia è passata per quel passo durante la combustione; le frecce laterali sono le fughe dal percorso.",
  ringLabel: (path: string) =>
    `Diagramma del flusso lungo ${path}; lo spessore delle frecce è il flusso integrato della combustione.`,
  ringChangedKey: "a colori, con il fattore: i passi il cui flusso è cambiato di più del 2%; contorno grigio: originale",
  ringSlowest: "il più lento",

  whatIfTitle: "E se un tasso fosse diverso?",
  whatIfLead:
    "Ogni tasso è noto solo con una certa incertezza, da qualche punto percentuale fino a un fattore dieci. Scegline uno, cambialo e guarda quali nuclei escono diversi alla fine della combustione.",
  pickReaction: "Scegli una reazione da cambiare",
  moreReactionsPick: "Un'altra reazione della rete…",
  yourChanges: "Le tue modifiche",
  noChanges: "Nessun tasso cambiato, per ora.",
  remove: (label: string) => `Annulla la modifica alla ${label}`,
  factor: "fattore",
  half: "÷2",
  double: "×2",
  resetAll: "Ripristina tutti i tassi",
  reset: "Ripristina",
  moreReactions: "Tutte le reazioni della rete",
  changedTitle: "Che cosa cambia di più",
  changedLead: (time: string, baseTime?: string) =>
    baseTime && baseTime !== time
      ? `Frazione di massa finale, modificata ÷ originale: la combustione modificata si è fermata dopo ${time}, quella originale dopo ${baseTime}. Barre a destra: più di quel nucleo.`
      : `Frazione di massa finale dopo ${time}, modificata ÷ originale. Barre a destra: più di quel nucleo.`,
  noChange: "Cambia un tasso per vedere che cosa fa: per ora ogni nucleo finisce come nella combustione originale.",
  selfLine: (nucleus: string, ratio: string) => `${nucleus} stesso: ${ratio}`,
  selfNote: (decay: boolean): string =>
    decay ? "(atteso: è il nucleo che decade)" : "(atteso: è ciò che questa reazione brucia)",
  knockTitle: "Effetti a catena sugli altri nuclei",
  smallFold: (n: number) => `${n} ${n === 1 ? "nucleo cambia" : "nuclei cambiano"} meno dell'1%`,
  cycleOf: {
    pp: ["la catena pp", "chain"],
    cno: ["il ciclo CN", "cycle"],
    nena: ["il ciclo NeNa", "cycle"],
    mgal: ["il ciclo MgAl", "cycle"],
  } as Record<string, [string, string]>,
  quietSelf: (nuclei: string, cycle?: [string, string]) => {
    if (!cycle) return `Solo ${nuclei} cambia più dell'1%: il resto della combustione assorbe il cambiamento.`
    const chain = cycle[1] === "chain"
    const [of, whole] = chain ? ["della catena", "tutta la catena"] : ["del ciclo", "tutto il ciclo"]
    return `In questa combustione ${cycle[0]} si riequilibra in fretta: solo ${nuclei} cambia più dell'1%. Ogni nucleo ${of} si assesta dove viene bruciato con la stessa velocità con cui è prodotto, e il ritmo di ${whole} lo detta il passo più lento.`
  },
  quietNone:
    "Nessun nucleo cambia più dell'1%: in questa combustione questa reazione o quasi non avviene, o non è lei a far aspettare le altre.",
  trySuggest: (why: "slowest" | "sensitive", kind = "cycle"): [string, string] =>
    why === "slowest"
      ? ["Prova ", `, il passo più lento, e vedrai rispondere ${kind === "chain" ? "tutta la catena" : "tutto il ciclo"}.`]
      : ["Prova ", ", una delle reazioni a cui questa combustione è più sensibile."],
  trySuggestTitle: "Cambia invece questa reazione, dello stesso fattore",
  stripSelf: "stesso",
  stripOthers: "il resto meno dell'1%",
  stripQuiet: "nessun nucleo cambia più dell'1%",
  stripTitle: "Effetto",
  seeAll: "Tutti i risultati",
  more: "di più",
  less: "di meno",
  ratioAxis2: "modificata ÷ originale",
  changeChartLabel:
    "Grafico a barre del rapporto tra le abbondanze finali con i tassi modificati e senza, per nucleo, in scala logaritmica.",
  evolutionTitle: "Le abbondanze durante la combustione",
  evolutionLead: "Frazione di massa di ciascun nucleo in funzione del tempo.",
  evolutionChanged: "Linea continua: con le tue modifiche; tratteggiata: originale.",
  evolutionChartLabel: "Grafico a linee delle frazioni di massa in funzione del tempo, entrambe in scala logaritmica.",
  massFraction: "Frazione di massa",
  time: "Tempo",
  pickNuclei: "Nuclei mostrati (fino a tre)",
  calculating: "Calcolo in corso…",
  calculatingFor: (s: string) => `Calcolo in corso… ${s}`,
  calculated: (ms: number, _steps: number) => `Ricalcolato nel tuo browser in ${ms} ms.`,
  precomputed: "Precalcolato con lo stesso risolutore; cambia qualcosa per ricalcolare nel tuo browser.",
  stoppedUntil: (fuel: string, time: string, f = 0.01) =>
    `La combustione si è fermata dopo ${time}, quando ${fuel} è sceso ${alPercent(f)}.`,
  stoppedTime: (time: string) => `La combustione è durata ${time}.`,
  failed: "Il calcolo non è riuscito:",
  baselineLabel: "originale",
  changedLabel: "modificata",
  share: "Link a questa configurazione",
  copied: "Link copiato",

  sensTitle: "Quale tasso conta di più?",
  sensLead:
    "Ogni tasso raddoppiato a turno, alle condizioni dello scenario: il colore dice quanto ciascun nucleo alla fine della combustione lo segue. +1: raddoppia con il tasso; −1: si dimezza.",
  sensButton: "Mostra la mappa di sensibilità",
  sensHide: "Nascondi la mappa di sensibilità",
  sensCustom: "Precalcolata per le condizioni dello scenario; torna allo scenario per confrontarla.",
  sensTry: "Fai clic su una casella per provare quel tasso ×2 (le frecce spostano tra le caselle).",
  sensCell: (reaction: string, nucleus: string, s: string) => `${reaction} ×2: ${nucleus} ${s}`,
  sensLabel: "Mappa di calore della sensibilità di ciascun nucleo a ciascun tasso di reazione.",
  sensMore: "più abbondante",
  sensLess: "meno abbondante",
  sensAll: "Tutte le reazioni",
  sensTop: "Le più influenti",

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
  colNote: "Nota",
  colNucleus: "Nucleo",
  colX0: "X iniziale",
  colXBase: "X finale, originale",
  colXNew: "X finale, modificata",
  colRatio: "rapporto",
  equationRate: "λ(T₉) = Σ_set exp(a₀ + a₁/T₉ + a₂ T₉^(−1/3) + a₃ T₉^(1/3) + a₄ T₉ + a₅ T₉^(5/3) + a₆ ln T₉)",
  equationLife:
    "τ = 1 / (c · ρ^n · Y_partner · λ · f_scr) per il nucleo bersaglio; per un decadimento τ = 1/λ (t½ / ln 2 in laboratorio; il λ del ²⁶Al cresce con T attraverso il suo isomero popolato termicamente); per una cattura elettronica τ = 1/(ρ Y_e λ). Y = X/A.",
  equationYdot:
    "dYᵢ/dt = Σ_r c_ir · prefattore_r · ρ^(n_r) · (Y_e) · Π Y_reagenti · λ_r(T₉) · f_scr,r — le equazioni di pynucastro, termine per termine.",
  screenNote: "Schermaggio: screen5, come in pynucastro (Wallace, Woosley e Weaver 1982).",
  units1: "s⁻¹",
  units2: "cm³ mol⁻¹ s⁻¹",
  units3: "cm⁶ mol⁻² s⁻¹",
  unitsEC: "cm³ mol⁻¹ s⁻¹ (×ρY_e → s⁻¹)",
  download: "Scarica",
  downloadCsv: "Tassi e tempi di attesa (CSV)",
  downloadRun: "Questa combustione (JSON)",
  downloadNetwork: "File della rete (JSON)",
  atlasPage: "Scheda nell'atlante",
  provenance: (lib: string, tool: string) => `${lib} — ${tool}`,
  dataNote:
    "I tassi sono i fit di REACLIB stessi, calcolati nel tuo browser. I tassi inversi sono esclusi (trascurabili a queste temperature); i nuclei fuori dalla rete sono inerti. I decadimenti dei nuclei che NUBASE2020 dà come stabili o con vita più lunga di 10⁸ anni sono esclusi.",
  newerTitle: "Tassi con dati più recenti",
  gamowResonances:
    "La finestra è dove reagisce di più una sezione d'urto liscia (non risonante). Una risonanza stretta al suo interno domina invece (la ²⁴Mg(p,γ) a 300 milioni di K con la sua risonanza a 214 keV, la ²⁵Mg(p,γ) a 80 milioni di K): allora il tasso segue l'energia della risonanza, non la finestra.",
  nowFactor: (f: string) => `ora ${f}`,
  luna: {
    title: "Tassi dalle misure di LUNA",
    toggle: "Usa i tassi LUNA/AZURE2",
    toggleHint: "per la ¹²C(p,γ)¹³N e la ¹³C(p,γ)¹⁴N",
    lead: "LUNA ha misurato sotto terra le due catture protoniche sul carbonio, fino a 60 keV (Skowronski et al. 2023). Se li attivi, la combustione usa i tassi calcolati dalle valutazioni R-matrix di quei dati su questo sito, al posto di quelli di REACLIB.",
    ratio: (T: string) => `¹²C/¹³C all'equilibrio del ciclo CN a ${T}`,
    ratioHint: "rapporto tra numeri di nuclei, = tasso della ¹³C(p,γ) ÷ tasso della ¹²C(p,γ): ciò che lascia la combustione dell'idrogeno, il rapporto che gli astronomi misurano nelle giganti rosse",
    reaclib: "REACLIB",
    lunaWord: "LUNA/AZURE2",
    burn: "alla fine di questa combustione",
    versus: (label: string, f: string) => `${label}: ${f} × il tasso di REACLIB, qui`,
    evaluations: "Le valutazioni",
    method:
      "N_A⟨σv⟩ integrato numericamente (Maxwell–Boltzmann) dalla sezione d'urto di ciascuna valutazione ai parametri pubblicati, da 1 keV a 4 MeV, con le risonanze strette risolte.",
    on: "attivi",
    off: "spenti",
  },
  builtBy:
    "Realizzato da J. Skowronski; i tassi delle sue valutazioni AZURE2 possono prendere il posto di quelli di REACLIB, come qui per la ¹²C(p,γ) e la ¹³C(p,γ) (E se ▸ tassi LUNA/AZURE2).",
  builtByPlain: "Realizzato da J. Skowronski; l'esploratore può usare i tassi delle sue valutazioni AZURE2 al posto di quelli di REACLIB.",
  lunaChip: "LUNA",
  lunaChipTitle: (refs: string) => `Misurata sotto terra a LUNA: ${refs}`,
  cur: {
    title: "Curiosità: e se un tasso fosse due volte più veloce?",
    titleShort: "Curiosità",
    eyebrow: "Curiosità",
    lead: "Un tasso raddoppiato, una combustione, un nucleo. Ogni numero viene dal calcolo dell'esploratore.",
    tryIt: "Provalo",
    know: "Come conosciamo questo tasso",
    knowSource: "Da dove viene questo tasso",
    share: "Link a questa curiosità",
    copyCitation: "Copia la citazione",
    copyLink: "Copia il link",
    copied: "Copiato",
    all: (n: number) => `Tutte le ${n} curiosità`,
    more: "Altre tre",
    whatIf: "×2 è un'ipotesi, non l'incertezza reale del tasso.",
    status: (label: string) => `Quanto è noto questo tasso: ${label.toLowerCase()}.`,
    noStatus: "Questo tasso non ha ancora una pagina nell'atlante: vedi la sua fonte.",
    today: "con il tasso di oggi",
    doubled: "con il tasso ×2",
    ratioToday: "rapporto, tasso di oggi",
    ratioDoubled: "rapporto, tasso ×2",
    rate: "Tasso",
    model: "Modello",
    indexTitle: "Curiosità sui tassi",
    indexLead:
      "Che cosa cambierebbe una reazione due volte più veloce, in sedici frasi. Ognuna viene da una combustione a una zona dell'esploratore dei tassi (un modello semplificato: una sola porzione di gas a temperatura e densità date, senza rimescolamento), dice che cosa lascia fuori e con «Provalo» apre esattamente quel calcolo.",
    indexHow:
      "I numeri sono letti dalle tabelle precalcolate dell'esploratore (ogni tasso ×2 alle condizioni di ciascun ambiente) e verificati con un nuovo calcolo dello stesso risolutore. Sono arrotondati a due cifre significative. ×2 è un'ipotesi: accanto è indicato quanto è noto davvero ogni tasso, dall'atlante delle reazioni.",
    back: "Tassi di reazione",
    backAll: "Tutte le curiosità",
  },
  sp: {
    lightTab: "Reti degli elementi leggeri",
    lead: "Scegli un ambiente, poi cambia una sorgente di neutroni, un veleno o il seme e guarda come si spostano gli isotopi pesanti.",
    whatIfLead: "Raddoppia o dimezza una reazione e guarda quali isotopi pesanti la seguono.",
    headline: (site: string, nc: string) => `${site}: circa ${nc} neutroni catturati da ogni seme di ferro.`,
    groups: {
      sources: ["Sorgenti di neutroni", "Le reazioni che liberano i neutroni."],
      competitors: [
        "Reazioni concorrenti e di recupero",
        "La ²²Ne(α,γ) consuma la sorgente senza un neutrone; la ¹⁷O(α,n) restituisce un neutrone preso da un veleno.",
      ],
      poisons: [
        "Veleni neutronici",
        "Nuclei leggeri, molto più abbondanti del ferro, che catturano i neutroni prima dei semi.",
      ],
      seeds: ["Il seme", "Il ferro, da cui parte la catena."],
      branches: [
        "Punti di diramazione",
        "Nuclei instabili che possono catturare un neutrone prima di decadere: le loro catture orientano il percorso. Tempi di dimezzamento di laboratorio (quello del ¹⁵¹Sm, per esempio, in una stella è più breve), e ⁸⁵Kr senza il suo isomero.",
      ],
    } as Record<string, [string, string]>,
    knobsTitle: "Quanto combustibile e quanto veleno",
    knob: (n: string) => `${n} iniziale`,
    statsTitle: "I neutroni",
    exposure: "Esposizione ai neutroni",
    exposureHint: "quanti neutroni ha incontrato un nucleo, per millibarn della sua area bersaglio (1 mb = 10⁻²⁷ cm²)",
    exposureFormula: "esposizione ai neutroni τ = ∫ n_n v_T dt (mb⁻¹)",
    peak: "Densità di neutroni massima",
    perSeed: "Neutroni catturati per seme",
    perSeedHint: "per nucleo pesante, dal ferro in su",
    burn: "Combustione",
    unchangedWord: "originale",
    distTitle: "Che cosa ha prodotto la combustione, dal ferro al bismuto",
    distLead:
      "Ogni punto è un isotopo stabile: quanto ce n'è alla fine della combustione rispetto all'inizio, che è la miscela solare. In questo piccolo strato, non in tutta la stella. I quadrati sono gli isotopi solo s, prodotti soltanto dal processo s; le bande ombreggiate sono i gusci di neutroni chiusi, dove il flusso si accumula.",
    distLabel:
      "Fattori di produzione degli isotopi stabili dal ferro al bismuto in funzione del numero di massa, in scala logaritmica.",
    massNumber: "Numero di massa A",
    productionFactor: "volte più che all'inizio",
    isotope: "isotopo stabile",
    peaks: "I picchi del processo s: stronzio, ittrio, zirconio (A ≈ 88), bario, lantanio, cerio (A ≈ 138) e piombo (A = 208), dove i nuclei con gusci di neutroni chiusi catturano lentamente e si accumulano.",
    shell: (n: number) => `N = ${n}`,
    sOnly: "solo s",
    below: "sotto un centesimo dell'inizio (bruciati)",
    notModelled: "richiede un decadimento stellare che la rete non ha",
    heavy: "Dal ferro in su",
    toResults: "Guarda che cosa è cambiato",
    light: "Nuclei leggeri",
    neutronTitle: "La densità di neutroni durante la combustione",
    neutronLead: "Neutroni liberi per centimetro cubo.",
    neutronAxis: "neutroni per cm³",
    neutronLabel: "Grafico a linee della densità di neutroni in funzione del tempo, entrambi in scala logaritmica.",
    decayNote:
      "Abbondanze dopo il decadimento di ogni nucleo con tempo di dimezzamento inferiore a 10⁸ anni (tempi di dimezzamento di laboratorio, come in REACLIB: i tempi stellari dei punti di diramazione come il ¹⁷⁶Lu o il ⁷⁹Se non sono modellati).",
    macsCol: (kT: string) => `MACS a kT = ${kT} (mb)`,
    macs30: "MACS a 30 keV (mb)",
    networkNote: (n: number, r: number) =>
      `${n} nuclei e ${r} reazioni: i nuclei leggeri che producono e sottraggono neutroni, e ogni nucleo dal ferro al polonio presente nella miscela solare o raggiunto, con una cattura neutronica o un decadimento, da uno che vive più di sei ore. Tra i nuclei pesanti solo (n,γ) e decadimenti.`,
    sensNuclei: "Colonne: il ferro, gli isotopi solo s e i picchi",
  },
}

export const RATES_DICT: Record<Lang, RatesDict> = { en, it }
export const ratesDict = (lang: Lang): RatesDict => RATES_DICT[lang]
