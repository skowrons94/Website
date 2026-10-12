/**
 * The site's two languages: English at the root, Italian under /it.
 *
 * Every UI string lives here, in one dictionary per language with the same
 * shape (TypeScript checks that `it` has every key `en` has). Content — the
 * profile, the research threads, the atlas — is translated in the content files
 * themselves, as `*_it` fields beside the English (see `lib/localize.mjs`).
 *
 * No file access, so client components import it as freely as server ones.
 */

export type Lang = "en" | "it"
export const LANGS: Lang[] = ["en", "it"]

/** The path of `path` (an English, root-relative path) in `lang`. */
export function localePath(lang: Lang, path: string): string {
  if (lang === "en" || !path.startsWith("/") || path.startsWith("//")) return path
  if (path === "/" || path.startsWith("/#") || path.startsWith("/?")) return `/it${path.slice(1)}`
  return `/it${path}`
}

/** Which language a pathname (without the base path) is in. */
export function langOf(pathname: string): Lang {
  return pathname === "/it" || pathname.startsWith("/it/") ? "it" : "en"
}

/** The English path a localized pathname corresponds to. */
export function englishPath(pathname: string): string {
  if (langOf(pathname) === "en") return pathname || "/"
  return pathname.slice(3) || "/"
}

/** `1.5` → `1,5` in Italian. */
export function decimal(text: string | number, lang: Lang): string {
  return lang === "en" ? String(text) : String(text).replace(/(\d)\.(\d)/g, "$1,$2")
}

/** `The CNO cycles` → `CNO cycles`, `Le catene pp` → `Catene pp`: a chip label. */
export function withoutArticle(name: string): string {
  const stripped = name.replace(/^(The|Il|Lo|La|I|Gli|Le)\s+/, "").replace(/^L['’]/, "")
  if (stripped === name) return name
  // `s-process`: a lower-case symbol stays lower case.
  if (/^[a-z]-/.test(stripped)) return stripped
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

const en = {
  /* -- site chrome -------------------------------------------------------- */
  langName: "English",
  skip: "Skip to content",
  nav: {
    label: "Main",
    research: "Research",
    atlas: "Atlas",
    notes: "Notes",
    evaluations: "Evaluations",
    software: "Software",
    publications: "Publications",
    publicationsShort: "Papers",
    cv: "CV",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    theme: "Toggle colour theme",
    language: "Language",
    switchTo: "Read this page in English",
  },
  footer: {
    work: "Work",
    explore: "Explore",
    elsewhere: "Elsewhere",
    research: "Research",
    publications: "Publications",
    software: "Software",
    evaluations: "R-matrix evaluations",
    cv: "Curriculum vitae",
    atlas: "Reaction atlas",
    timeline: "History timeline",
    glossary: "Glossary",
    methods: "Methods and laboratories",
    notes: "Notes on R-matrix theory",
  },
  notFound: {
    title: "Page not found",
    lead: "There is nothing at this address. It may have moved, or the link may be mistyped. One of these may be what you were looking for:",
    places: [
      { href: "/", label: "Home", text: "Who I am and what I work on." },
      { href: "/atlas", label: "Reaction atlas", text: "The nuclear reactions that power stars, on the chart of nuclides." },
      { href: "/research", label: "Research", text: "Underground measurements, R-matrix theory and more." },
      { href: "/publications", label: "Publications", text: "Articles and conference proceedings." },
    ],
  },

  /* -- landing ------------------------------------------------------------ */
  home: {
    exploreAtlas: "Explore the reaction atlas",
    publications: "Publications",
    cv: "CV",
    research: "Research",
    allResearch: "All research threads",
    atlasTitle: "A reaction atlas",
    atlasText:
      "The reactions of the pp chains, the CNO, NeNa and MgAl cycles, helium and carbon burning and the Big Bang, drawn on the chart of nuclides. For each one: what it does in a star, how well its rate is known, and who measured it, where and how, with the references.",
    openAtlas: "Open the atlas",
    evaluationsTitle: "R-matrix evaluations, live",
    evaluationsText:
      "Published evaluations, running the real AZURE2 code. Open a compound nucleus, look at its level scheme and the data it was fitted to, move a level energy or a reduced width, and watch the cross section and the χ² respond. Nothing is installed, and the input files can be downloaded and run locally.",
    browseEvaluations: "Browse the evaluations",
    notes: "Notes",
    allNotes: "All notes",
    notesInEnglish: "",
    // --- site ---
    researchButton: "Research and publications",
    software: "Software",
    figureAlt: (name: string) =>
      `${name}, drawn on the chart of nuclides: each square is a nucleus, with one more proton going up and one more neutron going right; each arrow is a reaction.`,
    figureCaption: (name: string, summary: string) =>
      `${name}. ${summary} Going up adds a proton, going right a neutron.`,
    figureLink: "See it in the atlas",
    selected: "Selected work",
    firstAuthor: "First author",
    about: "In more detail",
    // --- site (round 2) ---
    legendCapture: "proton capture",
    legendDecay: "β⁺ decay",
    legendClose: "(p,α): back to carbon",
    selectedPapers: "Selected papers",
  },

  /* -- research ----------------------------------------------------------- */
  research: {
    title: "Research",
    description:
      "Underground cross-section measurements, R-matrix evaluation, γ-ray tracking and electron screening.",
    lead: "Four programmes, all pointed at the same problem: knowing a nuclear cross section at the energies where stars use it, rather than only where a beam can reach.",
    more: "More about my work",
    publications: "Publications",
    software: "Software",
    cv: "Curriculum vitae",
    atlas: "The reactions, explained: the reaction atlas",
  },

  /* -- software ----------------------------------------------------------- */
  software: {
    title: "Software",
    description:
      "AZURE2, the R-matrix code for nuclear astrophysics; LunaSRIM, SRIM-2013 in pure Python; and LUNA Skills, agent skills for experimental nuclear astrophysics.",
    lead: "Code I maintain or wrote for the analysis of low-energy nuclear reactions. All of it is open source.",
    version: (v: string) => `version ${v}`,
    licence: (l: string) => `${l} licence`,
    uses: "What it is for",
    links: "Links",
    // --- site ---
    cite: "How to cite",
  },

  /* -- publications ------------------------------------------------------- */
  publications: {
    title: "Publications",
    description:
      "Peer-reviewed articles and conference proceedings by Jakub Skowronski in experimental nuclear astrophysics.",
    lead: (articles: number, proceedings: number, review: number) =>
      `${articles} peer-reviewed articles and ${proceedings} conference proceedings${review ? `, and ${review} more under review` : ""}. Entries marked with a rule are those I authored or co-authored in a leading role.`,
    sections: { article: "Research articles", proceedings: "Conference proceedings" } as Record<string, string>,
    // --- site ---
    profiles: "Complete and current lists, with citations:",
    filter: "Show",
    all: "All",
    firstAuthor: "First author",
    underReview: "Under review",
    underReviewNote: "Submitted and not yet published, so not counted among the peer-reviewed articles above.",
    // --- site (round 2) ---
    luna: "LUNA",
    year: "Year",
    allYears: "All years",
    shown: (n: number) => (n === 1 ? "1 publication shown" : `${n} publications shown`),
  },

  /* -- CV ----------------------------------------------------------------- */
  cv: {
    title: "Curriculum Vitae",
    metaTitle: "CV",
    description:
      "Curriculum vitae of Jakub Skowronski, experimental nuclear astrophysicist: employment, education, research experience, awards, talks and teaching.",
    publications: "Publications",
    research: "Research",
    employment: "Employment",
    education: "Education",
    researchExperience: "Research experience",
    projects: "Projects",
    awards: "Awards and appointments",
    invited: "Invited contributions",
    organisation: "Organisation and committees",
    participation: "Selected participation",
    teaching: "Teaching",
    supervision: "Supervision",
    outreach: "Outreach",
    skills: "Skills",
  },

  /* -- notes -------------------------------------------------------------- */
  notes: {
    title: "Notes",
    description:
      "Explanatory notes on R-matrix theory: polarization observables, identical particles, the channel radius, reaction pathways and stellar reaction rates.",
    lead: "Pieces of R-matrix theory written out properly — the physics first, then a worked example on a real reaction. Written for someone who wants to understand the machinery, not just use it.",
    seeBefore: "To see the machinery at work, open one of the ",
    seeEvaluations: "live R-matrix evaluations",
    seeMiddle: "; for what the reactions do in stars, see the ",
    seeAtlas: "reaction atlas",
    seeAfter: ".",
    inEnglish: "",
    readMinutes: (n: number) => `${n} min read`,
    minutes: (n: number) => `${n} min`,
    none: "No notes yet.",
    all: "All notes",
    references: "References",
    contents: "Contents",
    more: "More notes",
    tryTitle: "Try it on a real fit",
    tryText: "Live AZURE2 evaluations: move a level and watch the cross section respond.",
    reactionsTitle: "The reactions themselves",
    reactionsText: "The reaction atlas: what each reaction does in a star and how it was measured.",
    noteInEnglish: "",
  },

  /* -- evaluations -------------------------------------------------------- */
  evaluations: {
    metaTitle: "Evaluations",
    description:
      "Interactive R-matrix evaluations running on AZURE2: level schemes, fitted data and extrapolations.",
    eyebrow: "Running on AZURE2",
    title: "R-matrix evaluations",
    introBefore:
      "Each of these is a multi-level, multi-channel R-matrix fit. Open one to see its level scheme and the data it was fitted to, then move a level energy or a reduced width and watch the cross section and the χ² respond — the calculation is the real AZURE2 code, not an approximation. Every evaluation can also be downloaded as an ",
    introAfter: " project and run locally.",
    loading: "Loading evaluations…",
    loadFailed: "Failed to load evaluations",
    serverDown: "The evaluation server is not available right now",
    serverDownText:
      "The list of evaluations comes from the server that runs AZURE2, and it did not answer. Try again in a moment; in the meantime the reaction atlas and the notes explain the physics behind these fits.",
    tryAgain: "Try again",
    atlas: "Reaction atlas",
    notes: "Notes on R-matrix theory",
    aboutAzure: "About AZURE2",
    noneTitle: "No evaluations found",
    noneText: "Add a directory containing an .azr file to the server's evaluations folder.",
    open: "Open",
    download: (file: string) => `Download ${file}`,
    pageTitle: (nuclide: string) => `${nuclide} R-matrix evaluation`,
    pageDescription: (nuclide: string) =>
      `An interactive AZURE2 R-matrix evaluation of the ${nuclide} system: level scheme, fitted data and the extrapolation to stellar energies.`,
    inAtlas: "In the reaction atlas",
    inAtlasText: "What this reaction does in stars, how it has been measured and what is still uncertain:",
    // --- evaluations ---
    specialistBefore:
      "A research tool for nuclear physicists, built to be used rather than read. For what these reactions do in stars and how they are measured, the ",
    specialistLink: "reaction atlas",
    specialistAfter: " is the place to start.",
    openAria: (name: string) => `Open the evaluation: ${name}`,
    reactionsFitted: "Reactions fitted",
    channelsLabel: "Channels",
    paper: "Paper",
    unpublished: "Unpublished",
    noReference: "Unpublished",
    allEvaluations: "All evaluations",
    headerEyebrow: "R-matrix evaluation · AZURE2",
    authors: "Authors",
    energies: "Energies",
    energiesText:
      "Centre-of-mass energies E_c.m. in MeV throughout; AZURE2 converts the laboratory beam energies of the data files. Level energies are excitation energies of the compound nucleus.",
    engine: "Engine",
    engineText: "AZURE2, commit",
    fitted: "What was fitted",
    fittedText: (active: number, files: number, parts: string) =>
      `${active} data segment${active === 1 ? "" : "s"} from ${files} data file${files === 1 ? "" : "s"}: ${parts}. The Plot & data tab overlays the model on the measurements, lets you move any free level, and lists every segment with its normalisation and χ² in its table.`,
    observableCount: (n: number, code: string) => {
      const names: Record<string, [string, string]> = {
        "angle-integrated": ["angle-integrated cross section", "angle-integrated cross sections"],
        differential: ["differential cross section", "differential cross sections"],
        "differential-cm": ["differential cross section (c.m. angle)", "differential cross sections (c.m. angles)"],
        "total-capture": ["total-capture cross section", "total-capture cross sections"],
        "phase-shift": ["phase shift", "phase shifts"],
        "angle-integrated-E1": ["E1 cross section", "E1 cross sections"],
        "angle-integrated-E2": ["E2 cross section", "E2 cross sections"],
        "analyzing-power": ["analysing power", "analysing powers"],
      }
      const [one, many] = names[code] ?? [code, code]
      return `${n} ${n === 1 ? one : many}`
    },
    howToCite: "How to cite",
    citeWithPaper: "Please cite the paper this evaluation belongs to:",
    citeNoPaper:
      "This evaluation has no publication yet. Please cite this page with the date you used it, and the authors listed above.",
    citeAzure: "and the AZURE2 code:",
    azureReference: "R. E. Azuma et al., Phys. Rev. C 81, 045805 (2010)",
    notFoundTitle: "No such evaluation",
    notFoundText: (id: string) =>
      `There is no evaluation called “${id}”. It may have been renamed or removed; the list of evaluations has every one this site serves.`,
    // --- evaluations (round 2) ---
    analysis: "R-matrix analysis",
    compound: (nuclide: string) => `Compound nucleus ${nuclide}`,
    citeVersion: "version",
    citeWhat:
      "Cite the paper for the evaluation, AZURE2 for the code, and this page (with its version) if you use the interactive calculation or its numbers. The measured data belong to their authors: cite the original papers listed in the table of the Plot & data tab.",
    licence: (name: string) => `This page and the model file are shared under ${name}.`,
  },

  /* -- the evaluation workspace ------------------------------------------- */
  workspace: {
    starting: (id: string) => `Starting AZURE2 for ${id}…`,
    loadingEngine: "Loading the engine…",
    inBrowser: "AZURE2 runs in your browser; the first evaluation takes a few seconds to load.",
    progress: {} as Record<string, string>,
    unexpected: "Unexpected error",
    retry: "Try again",
    back: "Back",
    evaluations: "Evaluations",
    expired: "This session expired on the server.",
    reopen: "Reopen",
    tabs: { scheme: "Level scheme", data: "Data", plot: "Plot & data", extrap: "Extrapolations", extrapShort: "Extrap." },
    calculatingData: "Calculating data segments…",
    calculatingExtrap: "Calculating extrapolations… a model with external capture can take a minute.",
    // level scheme
    levelScheme: "Level scheme",
    schemeSummary: (levels: number, pairs: number, free: number) =>
      `${levels} levels across ${pairs} particle pairs · ${free} free R-matrix parameters`,
    exportScheme: "Export scheme",
    downloadFile: (file: string) => `Download ${file}`,
    energyMin: "Energy min (MeV)",
    energyMax: "Energy max (MeV)",
    showFixed: "Show fixed channels",
    clear: "Clear",
    shownOf: (n: number, of: number) => `${n} of ${of} levels`,
    levels: "Levels",
    selectRow: "Select a row to show its channels.",
    energyMeV: "Energy (MeV)",
    energy: "Energy",
    channels: "Channels",
    free: "Free",
    was: (v: string) => `(was ${v})`,
    fixedWord: "fixed",
    freeWord: "free",
    noFreeChannels: "No free channels.",
    noLevels: "No levels match the current filters.",
    pairs: "Particle pairs",
    pair: "Pair",
    channel: "Channel",
    type: "Type",
    separation: "Separation (MeV)",
    excitation: "Excitation (MeV)",
    radius: "Radius (fm)",
    entrance: "entrance",
    photon: "photon",
    particle: "particle",
    // level diagram
    levelDiagram: "Level diagram",
    diagramText: "Levels by excitation energy, grouped by spin-parity. Free levels are drawn solid, fixed levels dashed.",
    diagramLabel: (n: number) => `Energy level diagram with ${n} levels`,
    excitationAxis: "Excitation energy (MeV)",
    // level controls
    noFreeParameters: "This model has no free R-matrix parameters to vary.",
    interactiveLevels: "Interactive levels",
    nFree: (n: number) => `${n} free`,
    modified: "modified",
    collapseAll: "Collapse all",
    expandAll: "Expand all",
    reset: "Reset",
    changed: "changed",
    nParameters: (n: number) => `${n} parameter${n === 1 ? "" : "s"}`,
    wasValue: (v: string) => `was ${v}`,
    levelEnergy: "level energy",
    levelEnergyAria: (jpi: string) => `${jpi} level energy`,
    // plots
    quantity: "Quantity",
    sfactor: "S-factor",
    crossSection: "Cross section",
    logEnergy: "Log energy",
    logSfactor: "Log S-factor",
    logCrossSection: "Log cross section",
    logValue: "Log value",
    recalculating: "recalculating",
    calculating: "calculating",
    facets: (n: number, limit: number, what: "datasets" | "series") =>
      `Showing ${n} ${what} as small multiples — beyond ${limit} overlaid series the colors are no longer reliably distinguishable.`,
    selectDataset: "Select a dataset to plot.",
    selectExtrap: "Select an extrapolation to plot.",
    energyAxis: "Energy, c.m. (MeV)",
    datasets: "Datasets",
    off: "off",
    downloadCsv: "Download CSV",
    measured: "measured",
    extrapolations: "Extrapolations",
    addMeasured: "Add measured data",
    addMeasuredText: "Overlay measured datasets from this evaluation onto the extrapolation curves.",
    openDataFirst: "Loading the measured data…",
    // data table
    data: "Data",
    dataSummary: (segments: number, active: number, points: number) =>
      `${segments} segments · ${active} active · ${points} points`,
    meanChi2: (v: string) => ` · mean χ²/N ${v}`,
    filterDatasets: "Filter datasets…",
    dataset: "Dataset",
    reaction: "Reaction",
    observable: "Observable",
    angle: "Angle, c.m. (°)",
    points: "Points",
    norm: "Norm",
    inactive: "inactive",
    normFree: "normalization is a fit parameter",
    noMatch: (filter: string) => `No datasets match “${filter}”.`,
    // --- evaluations ---
    tryAgain: "Try again",
    serverDown: "The evaluation server is not available right now",
    serverDownText:
      "This evaluation runs on the server that hosts AZURE2, and it did not answer. Try again in a moment; the reaction atlas explains the physics in the meantime.",
    atlas: "Reaction atlas",
    elasticAxis: "dσ/dΩ (b/sr)",
    elasticNote:
      "Elastic-scattering segments are always shown as dσ/dΩ: an astrophysical S-factor is not defined for scattering.",
    mixedNote: "The selected segments measure different quantities, so each has its own panel.",
    plotAria: (quantity: string, names: string) => `Plot of ${quantity} against centre-of-mass energy: ${names}. Points are measurements, lines the R-matrix model.`,
    chi2Status: (v: string) => `Recalculated: mean χ²/N of the shown datasets is now ${v}.`,
    sliderValue: (value: string, unit: string) => `${value} ${unit}`,
    levelGroupAria: (jpi: string, energy: string) => `Level ${jpi} at ${energy} MeV`,
    showDatasets: (n: number, total: number) => `Datasets (${n} of ${total} shown)`,
    chi2Total: (chi2: string, points: number, perPoint: string) =>
      `Total χ² = ${chi2} for ${points} points (χ²/N = ${perPoint}).`,
    chi2Explain:
      "χ² is the data term at the shipped parameters and normalisations, computed exactly as AZURE2 does (the normalisation scales data and error together). Large values are reported as they are.",
    penaltyText: (v: string) => ` AZURE2's normalisation prior adds ${v}.`,
    normSummary: (free: number, constrained: number, fixed: number) =>
      `Normalisations: ${free} free in the fit (${constrained} with a stated systematic uncertainty, ${free - constrained} unconstrained), ${fixed} fixed.`,
    normFixed: "fixed",
    normFreeSigma: (sigma: string) => `free, σ = ${sigma}%`,
    normFreeNone: "free, no prior",
    file: "File",
    previewHint: "The plot stays pinned while you scroll the levels.",
    nothingToPlot: "Nothing to plot: a log axis hides non-positive values.",
    model: "model",
    // --- evaluations (round 2) ---
    chi2Shown: "χ²/N of the shown datasets",
    chi2None: "No χ² for the shown datasets (no uncertainties)",
    chi2All: "all active",
    residuals: "Residuals",
    residualAxis: "(d − m)/σ",
    residualAria: (names: string) =>
      `Residuals, (normalised data − model) / uncertainty, against centre-of-mass energy: ${names}.`,
    ratioRutherford: "σ / σ Rutherford",
    rutherfordNote:
      "Elastic dσ/dΩ divided by the Rutherford cross section (Mott for identical particles), in the centre of mass; other segments are shown as cross sections.",
    fineLoading: "Calculating the model on a fine energy grid… the line through the points is shown meanwhile.",
    finePointwise: (names: string) =>
      `Model shown at the measured energies only, joined by straight lines: ${names}. For these segments a calculation on an energy grid of their own does not reproduce AZURE2's values at the data (or they have no single angle or energy range), so no smooth curve is drawn.`,
    sZero: (energy: string) => `S at ${energy}`,
    sZeroNote:
      "S(E_min): the model's S-factor at the lowest energy of each selected extrapolation (centre of mass), read from the curve itself and marked on it; it is S(0) only if that energy is close enough to zero.",
    rateNote:
      "Reaction rates (N_A⟨σv⟩) are not calculated here: the engine interface used by this site does not expose AZURE2's rate integration, and a rate integrated from these curves would miss narrow resonances between grid points.",
    source: "Source",
    backgroundPoles: (energy: string, n: number) =>
      `${n} background poles at ${energy} MeV (fixed, one per spin-parity; axis broken)`,
    // --- evaluations (round 3) ---
    tipData: "data × n",
    keyLabel: "Key",
    keyText: "Points: measured data × their normalisation n, with ±1σ error bars. Black line: the R-matrix model.",
    keyOriginal: "Dashed grey line: the fit as published, before your changes.",
    zoomHint: "Drag across the plot to zoom in; double-click to reset.",
    resetZoom: "Reset zoom",
    save: "Save",
    chi2ShownShort: "for the datasets shown",
    chi2AllShort: "for all active data",
    chi2Gloss:
      "χ²/N near 1: the model passes through the data within their uncertainties; larger values mean a worse fit.",
    chi2Same: "unchanged",
    better: "better",
    worse: "worse",
    undo: "Undo",
    redo: "Redo",
    angleAxis: "Angle θ, c.m. (°)",
    tableDrawer: (n: number) => `Table of all ${n} datasets: references, normalisations, χ²`,
    plotColumn: "Plot",
    plotThis: (name: string) => `Plot ${name}`,
    copyLink: "Copy link",
    copied: "Link copied",
    loadingView: "Loading the view…",
    gamowTemperature: "Gamow window",
    gamowOff: "none",
    gamowBand: (T9: string) => `Gamow window, T₉ = ${T9}`,
    gamowNote: (T9: string, E0: string, width: string, pair: string) =>
      `Shaded: the Gamow window of ${pair} at T₉ = ${T9} (${T9} billion kelvin), centred at E₀ = ${E0} with width Δ = ${width} — the energies at which this reaction mostly happens in a star at that temperature.`,
    glossaryLink: "More in the glossary",
    editLevel: "Adjust its parameters →",
  },

  /* -- atlas -------------------------------------------------------------- */
  atlas: {
    name: "Reaction atlas",
    description:
      "The nuclear reactions that power stars and make the elements: where they sit on the chart of nuclides, how well each is known, and how it was measured.",
    title: "The nuclear reactions that make stars shine",
    history: "A history of the field",
    methodsLink: "Methods and laboratories",
    mapLabel: "Network map",
    lunaTitle: "LUNA results in the atlas",
    lunaOnTimeline: "LUNA on the timeline",
    myLuna: "My part in LUNA, since 2020",
    lunaText:
      "Reactions in the atlas with at least one measurement published by the LUNA collaboration, with the years of those measurements.",
    timelineCard: "Timeline",
    timelineCardText:
      "From Eddington's guess in 1920 to the latest underground measurements, with the observations and facilities in between.",
    methodsCard: "Methods and laboratories",
    methodsCardText: "How a cross section at stellar energies is measured, directly or indirectly, and where.",
    dataCard: "The data",
    dataCardText: (reactions: number, written: number, references: number) =>
      `The whole atlas as one JSON file: ${reactions} reactions${written === reactions ? "" : ` (${written} with an entry)`}, ${references} references, with Q-values and Gamow windows computed from AME2020.`,
    dataInEnglish: "",
    lunaMarks: "marks LUNA work throughout the atlas. Q-values from the AME2020 mass evaluation, half-lives from NUBASE2020.",
    measuredAtLuna: "Measured at LUNA",
    entryInPreparation: "Entry in preparation",
    englishSection: "",
    // reaction page
    entryDescription: (label: string) => `${label}: entry in preparation in the reaction atlas.`,
    facts: "Facts",
    qValue: "Q-value",
    qAnnihilation: (kinetic: string) => [
      "Q includes positron annihilation (2m",
      "e",
      `c² = 1.022 MeV). Without it, `,
      `${kinetic} MeV`,
      " is shared by the positron and the neutrino.",
    ],
    halfLifeOf: "Half-life of",
    halfLifeLab: "In the laboratory, as a neutral atom. In a star the electron density, and so the rate, differs.",
    halfLifeLabCapture:
      "In the laboratory. In a star, thermally excited states and ionisation can change it; it decides how often this nucleus decays before it captures a neutron.",
    gamow: "Gamow window",
    gamowNote: ["Peak energy E", "0", " ± half the 1/e width, centre of mass, from the AME2020 masses."],
    thermal: "Thermal energy kT",
    whyNoGamow: "Why no Gamow window",
    energies: "Energies",
    product: "Product",
    radioactive: "radioactive",
    kind: "Kind",
    preparationText: (one: boolean) =>
      `The description of this reaction and its measurements has not been written yet. Its place in ${one ? "its network" : "its networks"} and the quantities computed from the nuclear masses are already here.`,
    onTimeline: "On the timeline",
    howMeasured: "How it was measured",
    labNotGiven: "Laboratory not given",
    tryTitle: "Try it: an R-matrix evaluation",
    tryText:
      "An AZURE2 model of this system runs on this site. Change the energies and widths of the levels and watch the fit to the data and the extrapolation to stellar energies follow.",
    openEvaluation: ["Open the ", " evaluation →"],
    details: "Details",
    evaluationsTitle: "Evaluations",
    evaluationsText: "Compilations that combine the data into a recommended rate.",
    openQuestions: "Open questions",
    related: "Related reactions",
    references: "References",
    referenceNotFound: "reference not found",
    along: (name: string) => `Along ${name}`,
    theNetwork: "the network",
    previousIn: "Previous in",
    nextIn: "Next in",
    // timeline page
    timelineMeta: "Timeline · Reaction atlas",
    timelineDescription:
      "A history of nuclear astrophysics: the theory, the experiments, the observations and the laboratories, from 1920 to today.",
    timelineTitle: "A history of nuclear astrophysics",
    timelineLead:
      "How we learned what powers the stars: the ideas, the measurements, the observations that tested them, and the laboratories that made the measurements possible.",
    timelinePending:
      "The timeline is being written. In the meantime, each reaction page lists its measurements in chronological order.",
    // timeline view
    show: "Show",
    all: "All",
    categories: {
      theory: "Theory",
      experiment: "Experiment",
      observation: "Observation",
      facility: "Facility",
      luna: "LUNA",
    } as Record<string, string>,
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    decades: "Decades",
    decade: (d: number) => `${d}s`,
    undated: "Undated",
    nothingHere: "Nothing in this category yet.",
    officialPage: "Official page",
    // methods page
    methodsMeta: "Methods and laboratories · Reaction atlas",
    methodsDescription:
      "How cross sections at stellar energies are measured, directly and indirectly, and the laboratories that measure them.",
    methodsTitle: "Methods and laboratories",
    methodsLead:
      "A cross section at stellar energies can be measured directly, by aiming a beam at a target and counting the reactions, or inferred from other reactions and from theory. Each way has its own reach and its own systematic limits.",
    methods: "Methods",
    methodsPending: "The methods are being described.",
    groups: {
      underground: {
        title: "Underground laboratories",
        lead: "Accelerators under rock, where the cosmic-ray background is low enough to measure the smallest cross sections.",
      },
      surface: {
        title: "Laboratories at the surface",
        lead: "Accelerators, recoil separators and neutron sources above ground, where the higher-energy data and most indirect measurements come from.",
      },
      other: { title: "Other facilities", lead: "Facilities whose description is still being written." },
    },
    descriptionPending: "Description in preparation.",
    strengths: "Strengths",
    limits: "Limits",
    examples: "Examples in the atlas",
    facts_: {
      lab: "Laboratory",
      location: "Location",
      depth: "Depth",
      accelerator: "Accelerator",
      years: "Years",
    },
    measurementsHere: "Measurements in the atlas",
    website: "Website",
    // the map
    process: "Process",
    networksShown: "Networks shown",
    zoomToProcess: "Zoom to process",
    wholeChart: "Whole chart",
    chartLabel: (name: string) =>
      `Chart of nuclides, neutron number across and proton number up, with the reactions of ${name} in colour`,
    theAtlas: "the atlas",
    protonsAxis: "↑ protons Z",
    neutronsAxis: "neutrons N →",
    tipPending: "Entry in preparation.",
    legendWeight: "Line weight: key, major, minor reaction",
    legendOther: "Other processes",
    legendStable: "Stable, radioactive",
    mapHelp:
      "Hover over an arrow for its name and click it for the details, or click a square for the reactions of that nucleus. With a keyboard, Tab reaches the map and the arrow keys move along the reactions of the process on show.",
    closeDetails: "Close details",
    close: "Close",
    selectArrow: "Select an arrow to see what the reaction does, its energy release and how well it is known.",
    decay: "decay",
    panelPending:
      "The entry for this reaction is in preparation. Its place in the network, its energy release and its Gamow window are below.",
    networks: "Networks",
    qShort: (kinetic: string) => `Q includes positron annihilation; ${kinetic} MeV without it`,
    halfLife: "Half-life",
    measurements: "Measurements",
    noneYet: "none listed yet",
    rmatrix: "R-matrix",
    interactive: "Interactive evaluation →",
    fullEntry: "The full entry",
    soFar: "What there is so far",
    // --- atlas ---
    mapHelpTouch:
      "Tap an arrow to see what the reaction does, or tap a square to list the reactions of that nucleus; the buttons above the map choose the process in colour.",
    startHere: "Start here",
    startHereTitle: (n: number) => `A century of stellar fusion in ${n} moments`,
    startHereText: (total: number) =>
      `From Eddington's guess in 1920 to measurements deep under a mountain: how we learned what makes the stars shine. The full timeline has ${total} entries.`,
    howToRead: "How to read the map",
    readSteps: [
      "Each square is an atomic nucleus. One step up adds a proton and makes the next element; one step to the right adds a neutron.",
      "Each arrow is a reaction or a decay. Straight up: a proton is captured. Two up and two right: a helium nucleus is captured. One down and one right: a β⁺ decay, in which a proton turns into a neutron.",
      "Squares filled in grey are stable nuclei; outlined squares are radioactive.",
      "The colour of an arrow tells which process it belongs to; the buttons above the map choose the process. Thicker lines are the more important reactions.",
      "Some arrows jump far. When two nuclei heavier than helium fuse, as in carbon burning, they form a highly excited nucleus that at once breaks up: ¹²C + ¹²C makes ²⁴Mg*, which falls apart into ²⁰Ne and an alpha particle or into ²³Na and a proton. The arrow goes straight from ¹²C to the end product.",
    ],
    diagram: {
      label:
        "Diagram: how to read the chart. A square for a nucleus; an arrow up for a proton capture, to the right for a neutron capture, two up and two right for a helium capture, one down and one right for a β⁺ decay; a filled square is stable, an outlined one radioactive.",
      protons: "protons",
      neutrons: "neutrons",
      pCapture: "+ proton",
      nCapture: "+ neutron",
      aCapture: "+ helium‑4",
      betaPlus: "β⁺",
      stable: "stable",
      radioactive: "radioactive",
    },
    notationTitle: "Reading a reaction",
    notation: [
      "means: a nitrogen‑14 nucleus (the target) captures a proton (what goes in) and becomes oxygen‑15 (the product), giving off a gamma ray (what comes out). Every reaction is written the same way:",
      "target(in,out)product",
    ],
    primerTitle: "Why these reactions matter, and why they are measured underground",
    statusLegend: "How well each rate is known:",
    moreInGlossary: "More in the glossary",
    glossaryLink: "Glossary",
    readNotation: "How to read the notation",
    measurementCount: (n: number, span: string, luna: number) =>
      `${n} ${n === 1 ? "measurement" : "measurements"}${span ? `, ${span}` : ""}${luna ? `, ${luna} at LUNA` : ""}`,
    showList: "Show the list",
    hideList: "Hide the list",
    statusFact: "How well known",
    lastUpdated: "Last updated",
    onThisPage: "On this page",
    summaryAnchor: "In brief",
    forSpecialists: "For specialists",
    citeTitle: "How to cite this atlas",
    citeVersion: "version",
    citeAccessed: "Cite the version you used; the date is the last change to the content.",
    licence: (name: string) =>
      `The text and the data, including data.json, are released under the ${name} licence: you may reuse them, with credit.`,
    licenceLink: "Licence",
    // glossary page
    glossaryMeta: "Glossary · Reaction atlas",
    glossaryTitle: "Glossary",
    glossaryDescription:
      "The terms of nuclear astrophysics used in the reaction atlas, in plain words: cross section, S-factor, Gamow window, resonance, Q-value and more.",
    glossaryLead:
      "The words the atlas uses, in plain language. Each reaction page links here the first time a term appears.",
    seeAlso: "See also",
    familyPageLink: (name: string) => `${name}, from iron to lead`,
    sProcessLink: "The s-process",
    sProcessCard: "The s-process",
    sProcessCardText:
      "How slow neutron captures carry iron to lead: the path on the chart of nuclides, its branch points, and how the captures are measured.",
    glossaryPage: "Read more on its own page",
    alsoInAtlas: "In the atlas",
    readMore: "Read more",
    readLess: "Show less",
    // --- atlas (round 2) ---
    qReleased: "energy released",
    qNeeded: "energy needed",
    thresholdLimited: (q: string) => `Above the ${q} MeV threshold`,
    thresholdExplain:
      "For an endothermic reaction the ordinary window would lie partly or wholly below the threshold, |Q|, where the reaction cannot happen; the range shown starts at the threshold and runs to where the product of the Boltzmann factor and the Coulomb penetration, exp(−E/kT − 2πη), has fallen by 1/e from its maximum above threshold.",
    statusInDetail: "How well known, in detail",
    highlights: "Highlights",
    arrowKeyTitle: "The kinds of arrow",
    arrowKey: [
      ["(p,γ)", "a proton is captured: one up"],
      ["(α,γ)", "a helium nucleus is captured: two up, two right"],
      ["(p,α)", "a proton in, a helium nucleus out: one down, two left"],
      ["(α,n)", "a helium nucleus in, a neutron out: two up, one right"],
      ["(n,γ)", "a neutron is captured: one right"],
      ["β⁺", "a proton turns into a neutron: one down, one right"],
      ["¹²C + ¹²C", "two heavy nuclei fuse: a long jump"],
    ] as [string, string][],
    nuclide: "Nucleus",
    stableNuclide: "stable",
    cellFrom: (name: string) => `Reactions starting from ${name}`,
    cellTo: (name: string) => `Reactions making ${name}`,
    cellNone: "No reaction of the atlas starts or ends here.",
    lunaFigureTitle: "Why underground",
    lunaFigure: {
      alt: "Schematic cross-section of the Gran Sasso mountain. Cosmic-ray muons coming from above stop in the rock; only about one in a million reaches the underground halls, about 1400 m below the summit, where the LUNA 400 kV accelerator and the 3.5 MV LUNA-MV accelerator of the Bellotti Ion Beam Facility send their beams onto targets surrounded by detectors.",
      rock: "rock",
      tunnel: "motorway tunnel",
      items: [
        "At the surface, cosmic rays make a steady rain of muons, which leave signals in any γ-ray detector.",
        "About 1400 m of rock (3800 m water equivalent) stop all but about one muon in a million.",
        "LUNA 400 kV: proton and helium beams for hydrogen burning, since the early 2000s.",
        "LUNA-MV, 3.5 MV, at the Bellotti Ion Beam Facility, inaugurated in 2023: proton, helium and carbon beams for helium and carbon burning.",
        "The beam hits a target; a detector around it counts the γ-rays or particles from the few reactions.",
      ],
      note: "Schematic, not to scale.",
    },
  },
}

export type Dictionary = typeof en

const it: Dictionary = {
  /* -- site chrome -------------------------------------------------------- */
  langName: "Italiano",
  skip: "Vai al contenuto",
  nav: {
    label: "Principale",
    research: "Ricerca",
    atlas: "Atlante",
    notes: "Note",
    evaluations: "Valutazioni",
    software: "Software",
    publications: "Pubblicazioni",
    publicationsShort: "Articoli",
    cv: "CV",
    openMenu: "Apri il menu",
    closeMenu: "Chiudi il menu",
    theme: "Cambia tema chiaro/scuro",
    language: "Lingua",
    switchTo: "Leggi questa pagina in italiano",
  },
  footer: {
    work: "Lavoro",
    explore: "Esplora",
    elsewhere: "Altrove",
    research: "Ricerca",
    publications: "Pubblicazioni",
    software: "Software",
    evaluations: "Valutazioni R-matrix",
    cv: "Curriculum vitae",
    atlas: "Atlante delle reazioni",
    timeline: "Cronologia",
    glossary: "Glossario",
    methods: "Metodi e laboratori",
    notes: "Note sulla teoria R-matrix",
  },
  notFound: {
    title: "Pagina non trovata",
    lead: "A questo indirizzo non c'è nulla. La pagina potrebbe essere stata spostata, oppure il link contiene un errore. Forse cercavi una di queste:",
    places: [
      { href: "/", label: "Home", text: "Chi sono e di cosa mi occupo." },
      {
        href: "/atlas",
        label: "Atlante delle reazioni",
        text: "Le reazioni nucleari che alimentano le stelle, sulla carta dei nuclidi.",
      },
      { href: "/research", label: "Ricerca", text: "Misure in laboratorio sotterraneo, teoria R-matrix e altro." },
      { href: "/publications", label: "Pubblicazioni", text: "Articoli e atti di conferenze." },
    ],
  },

  /* -- landing ------------------------------------------------------------ */
  home: {
    exploreAtlas: "Esplora l'atlante delle reazioni",
    publications: "Pubblicazioni",
    cv: "CV",
    research: "Ricerca",
    allResearch: "Tutti i temi di ricerca",
    atlasTitle: "Un atlante delle reazioni",
    atlasText:
      "Le reazioni delle catene protone-protone, dei cicli CNO, NeNa e MgAl, della combustione dell'elio e del carbonio e del Big Bang, disegnate sulla carta dei nuclidi. Per ciascuna: che cosa fa in una stella, quanto bene se ne conosce il tasso, e chi l'ha misurata, dove e come, con la bibliografia.",
    openAtlas: "Apri l'atlante",
    evaluationsTitle: "Valutazioni R-matrix, dal vivo",
    evaluationsText:
      "Valutazioni pubblicate, calcolate con il vero codice AZURE2. Apri un nucleo composto, guarda il suo schema dei livelli e i dati su cui è stato fatto il fit, sposta l'energia di un livello o una larghezza ridotta e osserva come rispondono la sezione d'urto e il χ². Non serve installare nulla, e i file di input si possono scaricare ed eseguire in locale.",
    browseEvaluations: "Sfoglia le valutazioni",
    notes: "Note",
    allNotes: "Tutte le note",
    notesInEnglish: "Le note sono scritte in inglese.",
    // --- site ---
    researchButton: "Ricerca e pubblicazioni",
    software: "Software",
    figureAlt: (name: string) =>
      `${name}, disegnato sulla carta dei nuclidi: ogni quadrato è un nucleo, con un protone in più salendo e un neutrone in più andando a destra; ogni freccia è una reazione.`,
    figureCaption: (name: string, summary: string) =>
      `${name}. ${summary} Salendo si aggiunge un protone, andando a destra un neutrone.`,
    figureLink: "Guardalo nell'atlante",
    selected: "Lavori scelti",
    firstAuthor: "Primo autore",
    about: "Più nel dettaglio",
    // --- site (round 2) ---
    legendCapture: "cattura protonica",
    legendDecay: "decadimento β⁺",
    legendClose: "(p,α): di nuovo carbonio",
    selectedPapers: "Articoli scelti",
  },

  /* -- research ----------------------------------------------------------- */
  research: {
    title: "Ricerca",
    description:
      "Misure di sezioni d'urto in laboratorio sotterraneo, valutazioni R-matrix, tracciamento dei raggi γ e schermaggio elettronico.",
    lead: "Quattro programmi, tutti rivolti allo stesso problema: conoscere una sezione d'urto nucleare alle energie a cui la usano le stelle, e non solo dove arriva un fascio.",
    more: "Altro sul mio lavoro",
    publications: "Pubblicazioni",
    software: "Software",
    cv: "Curriculum vitae",
    atlas: "Le reazioni, spiegate: l'atlante delle reazioni",
  },

  /* -- software ----------------------------------------------------------- */
  software: {
    title: "Software",
    description:
      "AZURE2, il codice R-matrix per l'astrofisica nucleare; LunaSRIM, SRIM-2013 in puro Python; e LUNA Skills, skill per agenti dedicate all'astrofisica nucleare sperimentale.",
    lead: "Codice che mantengo o che ho scritto per l'analisi delle reazioni nucleari a bassa energia. È tutto open source.",
    version: (v: string) => `versione ${v}`,
    licence: (l: string) => `licenza ${l}`,
    uses: "A cosa serve",
    links: "Link",
    // --- site ---
    cite: "Come citarlo",
  },

  /* -- publications ------------------------------------------------------- */
  publications: {
    title: "Pubblicazioni",
    description:
      "Articoli su riviste con revisione paritaria e atti di conferenze di Jakub Skowronski in astrofisica nucleare sperimentale.",
    lead: (articles: number, proceedings: number, review: number) =>
      `${articles} articoli su riviste con revisione paritaria e ${proceedings} contributi ad atti di conferenze${review ? `, più ${review} in revisione` : ""}. Le voci segnate da una linea sono quelle di cui sono autore o coautore con un ruolo di primo piano. I titoli sono riportati come pubblicati.`,
    sections: { article: "Articoli di ricerca", proceedings: "Atti di conferenze" },
    // --- site ---
    profiles: "Elenchi completi e aggiornati, con le citazioni:",
    filter: "Mostra",
    all: "Tutte",
    firstAuthor: "Primo autore",
    underReview: "In revisione",
    underReviewNote: "Inviati alle riviste e non ancora pubblicati, quindi non contati tra gli articoli con revisione paritaria qui sopra.",
    // --- site (round 2) ---
    luna: "LUNA",
    year: "Anno",
    allYears: "Tutti gli anni",
    shown: (n: number) => (n === 1 ? "1 pubblicazione mostrata" : `${n} pubblicazioni mostrate`),
  },

  /* -- CV ----------------------------------------------------------------- */
  cv: {
    title: "Curriculum Vitae",
    metaTitle: "CV",
    description:
      "Curriculum vitae di Jakub Skowronski, astrofisico nucleare sperimentale: impieghi, formazione, esperienze di ricerca, premi, seminari e didattica.",
    publications: "Pubblicazioni",
    research: "Ricerca",
    employment: "Impieghi",
    education: "Formazione",
    researchExperience: "Esperienze di ricerca",
    projects: "Progetti",
    awards: "Premi e incarichi",
    invited: "Contributi su invito",
    organisation: "Organizzazione e comitati",
    participation: "Partecipazioni scelte",
    teaching: "Didattica",
    supervision: "Supervisione",
    outreach: "Divulgazione",
    skills: "Competenze",
  },

  /* -- notes -------------------------------------------------------------- */
  notes: {
    title: "Note",
    description:
      "Note esplicative sulla teoria R-matrix: osservabili di polarizzazione, particelle identiche, raggio di canale, percorsi di reazione e tassi di reazione stellari.",
    lead: "Pezzi di teoria R-matrix scritti per esteso: prima la fisica, poi un esempio svolto su una reazione reale. Pensate per chi vuole capire il meccanismo, e non solo usarlo.",
    seeBefore: "Per vedere il meccanismo all'opera, apri una delle ",
    seeEvaluations: "valutazioni R-matrix dal vivo",
    seeMiddle: "; per sapere che cosa fanno le reazioni nelle stelle, consulta l'",
    seeAtlas: "atlante delle reazioni",
    seeAfter: ".",
    inEnglish:
      "Le note sono testi tecnici, ricchi di formule, e sono scritte in inglese: qui sotto trovi titoli e riassunti originali.",
    readMinutes: (n: number) => `${n} min di lettura`,
    minutes: (n: number) => `${n} min`,
    none: "Ancora nessuna nota.",
    all: "Tutte le note",
    references: "Bibliografia",
    contents: "Indice",
    more: "Altre note",
    tryTitle: "Provalo su un fit reale",
    tryText: "Valutazioni AZURE2 dal vivo: sposta un livello e osserva come risponde la sezione d'urto.",
    reactionsTitle: "Le reazioni stesse",
    reactionsText: "L'atlante delle reazioni: che cosa fa ogni reazione in una stella e come è stata misurata.",
    noteInEnglish: "Questa nota è disponibile solo in inglese.",
  },

  /* -- evaluations -------------------------------------------------------- */
  evaluations: {
    metaTitle: "Valutazioni",
    description:
      "Valutazioni R-matrix interattive calcolate con AZURE2: schemi dei livelli, dati del fit ed estrapolazioni.",
    eyebrow: "Calcolate con AZURE2",
    title: "Valutazioni R-matrix",
    introBefore:
      "Ognuna di queste è un fit R-matrix a più livelli e più canali. Aprine una per vedere il suo schema dei livelli e i dati del fit, poi sposta l'energia di un livello o una larghezza ridotta e osserva come rispondono la sezione d'urto e il χ²: il calcolo è il vero codice AZURE2, non un'approssimazione. Ogni valutazione si può anche scaricare come progetto ",
    introAfter: " ed eseguire in locale.",
    loading: "Caricamento delle valutazioni…",
    loadFailed: "Impossibile caricare le valutazioni",
    serverDown: "Il server delle valutazioni al momento non è disponibile",
    serverDownText:
      "L'elenco delle valutazioni arriva dal server che esegue AZURE2, e non ha risposto. Riprova tra poco; nel frattempo l'atlante delle reazioni e le note spiegano la fisica che sta dietro questi fit.",
    tryAgain: "Riprova",
    atlas: "Atlante delle reazioni",
    notes: "Note sulla teoria R-matrix",
    aboutAzure: "Che cos'è AZURE2",
    noneTitle: "Nessuna valutazione trovata",
    noneText: "Aggiungi una cartella con un file .azr alla cartella delle valutazioni del server.",
    open: "Apri",
    download: (file: string) => `Scarica ${file}`,
    // "dell'⁸Be": the article follows the spoken mass number (otto, undici, diciotto).
    pageTitle: (nuclide: string) =>
      `Valutazione R-matrix ${/^(⁸|¹¹|¹⁸)[A-Z]/.test(nuclide) ? "dell'" : "del "}${nuclide}`,
    pageDescription: (nuclide: string) =>
      `Una valutazione R-matrix interattiva del sistema ${nuclide} con AZURE2: schema dei livelli, dati del fit ed estrapolazione alle energie stellari.`,
    inAtlas: "Nell'atlante delle reazioni",
    inAtlasText: "Che cosa fa questa reazione nelle stelle, come è stata misurata e che cosa è ancora incerto:",
    // --- evaluations ---
    specialistBefore:
      "Uno strumento di ricerca per fisici nucleari, pensato per essere usato più che letto. Per sapere che cosa fanno queste reazioni nelle stelle e come si misurano, il punto di partenza è l'",
    specialistLink: "atlante delle reazioni",
    specialistAfter: ".",
    openAria: (name: string) => `Apri la valutazione: ${name}`,
    reactionsFitted: "Reazioni nel fit",
    channelsLabel: "Canali",
    paper: "Articolo",
    unpublished: "Non pubblicata",
    noReference: "Non pubblicata",
    allEvaluations: "Tutte le valutazioni",
    headerEyebrow: "Valutazione R-matrix · AZURE2",
    authors: "Autori",
    energies: "Energie",
    energiesText:
      "Energie nel centro di massa, E_c.m., in MeV ovunque; AZURE2 converte le energie del fascio nel laboratorio riportate nei file di dati. Le energie dei livelli sono energie di eccitazione del nucleo composto.",
    engine: "Codice",
    engineText: "AZURE2, commit",
    fitted: "Che cosa contiene il fit",
    fittedText: (active: number, files: number, parts: string) =>
      `${active} segment${active === 1 ? "o" : "i"} di dati da ${files} file: ${parts}. La scheda Grafico e dati sovrappone il modello alle misure, permette di spostare qualunque livello libero ed elenca nella sua tabella ogni segmento con la sua normalizzazione e il χ².`,
    observableCount: (n: number, code: string) => {
      const names: Record<string, [string, string]> = {
        "angle-integrated": ["sezione d'urto integrata sugli angoli", "sezioni d'urto integrate sugli angoli"],
        differential: ["sezione d'urto differenziale", "sezioni d'urto differenziali"],
        "differential-cm": ["sezione d'urto differenziale (angolo nel c.m.)", "sezioni d'urto differenziali (angoli nel c.m.)"],
        "total-capture": ["sezione d'urto di cattura totale", "sezioni d'urto di cattura totale"],
        "phase-shift": ["sfasamento", "sfasamenti"],
        "angle-integrated-E1": ["sezione d'urto E1", "sezioni d'urto E1"],
        "angle-integrated-E2": ["sezione d'urto E2", "sezioni d'urto E2"],
        "analyzing-power": ["potere di analisi", "poteri di analisi"],
      }
      const [one, many] = names[code] ?? [code, code]
      return `${n} ${n === 1 ? one : many}`
    },
    howToCite: "Come citare",
    citeWithPaper: "Cita l'articolo a cui appartiene questa valutazione:",
    citeNoPaper:
      "Questa valutazione non è ancora pubblicata. Cita questa pagina, con la data in cui l'hai consultata, e gli autori indicati sopra.",
    citeAzure: "e il codice AZURE2:",
    azureReference: "R. E. Azuma et al., Phys. Rev. C 81, 045805 (2010)",
    notFoundTitle: "Valutazione inesistente",
    notFoundText: (id: string) =>
      `Non esiste una valutazione chiamata “${id}”. Potrebbe essere stata rinominata o rimossa; l'elenco delle valutazioni le riporta tutte.`,
    // --- evaluations (round 2) ---
    analysis: "Analisi R-matrix",
    compound: (nuclide: string) => `Nucleo composto ${nuclide}`,
    citeVersion: "versione",
    citeWhat:
      "Cita l'articolo per la valutazione, AZURE2 per il codice e questa pagina (con la sua versione) se usi il calcolo interattivo o i suoi numeri. I dati misurati appartengono ai loro autori: cita gli articoli originali elencati nella tabella della scheda Grafico e dati.",
    licence: (name: string) => `Questa pagina e il file del modello sono distribuiti con licenza ${name}.`,
  },

  /* -- the evaluation workspace ------------------------------------------- */
  workspace: {
    starting: (id: string) => `Avvio di AZURE2 per ${id}…`,
    loadingEngine: "Caricamento del motore di calcolo…",
    inBrowser: "AZURE2 gira nel tuo browser; la prima valutazione richiede qualche secondo per caricarsi.",
    progress: {
      "Loading Python": "Caricamento di Python",
      "Loading NumPy and Flask": "Caricamento di NumPy e Flask",
      "Loading AZURE2": "Caricamento di AZURE2",
      "Loading the evaluation": "Caricamento della valutazione",
      "Opening the model": "Apertura del modello",
    },
    unexpected: "Errore imprevisto",
    retry: "Riprova",
    back: "Indietro",
    evaluations: "Valutazioni",
    expired: "Questa sessione è scaduta sul server.",
    reopen: "Riapri",
    tabs: { scheme: "Schema dei livelli", data: "Dati", plot: "Grafico e dati", extrap: "Estrapolazioni", extrapShort: "Estrap." },
    calculatingData: "Calcolo dei segmenti di dati…",
    calculatingExtrap: "Calcolo delle estrapolazioni… con la cattura esterna può servire un minuto.",
    levelScheme: "Schema dei livelli",
    schemeSummary: (levels: number, pairs: number, free: number) =>
      `${levels} livelli su ${pairs} coppie di particelle · ${free} parametri R-matrix liberi`,
    exportScheme: "Esporta lo schema",
    downloadFile: (file: string) => `Scarica ${file}`,
    energyMin: "Energia min (MeV)",
    energyMax: "Energia max (MeV)",
    showFixed: "Mostra i canali fissi",
    clear: "Azzera",
    shownOf: (n: number, of: number) => `${n} livelli su ${of}`,
    levels: "Livelli",
    selectRow: "Seleziona una riga per vederne i canali.",
    energyMeV: "Energia (MeV)",
    energy: "Energia",
    channels: "Canali",
    free: "Liberi",
    was: (v: string) => `(era ${v})`,
    fixedWord: "fissa",
    freeWord: "libera",
    noFreeChannels: "Nessun canale libero.",
    noLevels: "Nessun livello corrisponde ai filtri.",
    pairs: "Coppie di particelle",
    pair: "Coppia",
    channel: "Canale",
    type: "Tipo",
    separation: "Separazione (MeV)",
    excitation: "Eccitazione (MeV)",
    radius: "Raggio (fm)",
    entrance: "ingresso",
    photon: "fotone",
    particle: "particella",
    levelDiagram: "Diagramma dei livelli",
    diagramText:
      "Livelli per energia di eccitazione, raggruppati per spin e parità. I livelli liberi sono a tratto continuo, quelli fissi tratteggiati.",
    diagramLabel: (n: number) => `Diagramma dei livelli energetici con ${n} livelli`,
    excitationAxis: "Energia di eccitazione (MeV)",
    noFreeParameters: "Questo modello non ha parametri R-matrix liberi da variare.",
    interactiveLevels: "Livelli interattivi",
    nFree: (n: number) => `${n} liberi`,
    modified: "modificato",
    collapseAll: "Chiudi tutti",
    expandAll: "Apri tutti",
    reset: "Ripristina",
    changed: "modificato",
    nParameters: (n: number) => `${n} parametr${n === 1 ? "o" : "i"}`,
    wasValue: (v: string) => `era ${v}`,
    levelEnergy: "energia del livello",
    levelEnergyAria: (jpi: string) => `energia del livello ${jpi}`,
    quantity: "Grandezza",
    sfactor: "Fattore S",
    crossSection: "Sezione d'urto",
    logEnergy: "Energia in scala log",
    logSfactor: "Fattore S in scala log",
    logCrossSection: "Sezione d'urto in scala log",
    logValue: "Valori in scala log",
    recalculating: "ricalcolo in corso",
    calculating: "calcolo in corso",
    facets: (n: number, limit: number, what: "datasets" | "series") =>
      `${n} ${what === "datasets" ? "insiemi di dati" : "serie"} in grafici separati: oltre ${limit} serie sovrapposte i colori non sono più distinguibili con sicurezza.`,
    selectDataset: "Seleziona un insieme di dati da mostrare.",
    selectExtrap: "Seleziona un'estrapolazione da mostrare.",
    energyAxis: "Energia nel c.m. (MeV)",
    datasets: "Insiemi di dati",
    off: "escluso",
    downloadCsv: "Scarica CSV",
    measured: "misurato",
    extrapolations: "Estrapolazioni",
    addMeasured: "Aggiungi dati misurati",
    addMeasuredText: "Sovrapponi alle curve estrapolate gli insiemi di dati misurati di questa valutazione.",
    openDataFirst: "Caricamento dei dati misurati…",
    data: "Dati",
    dataSummary: (segments: number, active: number, points: number) =>
      `${segments} segmenti · ${active} attivi · ${points} punti`,
    meanChi2: (v: string) => ` · χ²/N medio ${v}`,
    filterDatasets: "Filtra gli insiemi di dati…",
    dataset: "Insieme di dati",
    reaction: "Reazione",
    observable: "Osservabile",
    angle: "Angolo, c.m. (°)",
    points: "Punti",
    norm: "Norm.",
    inactive: "inattivo",
    normFree: "la normalizzazione è un parametro del fit",
    noMatch: (filter: string) => `Nessun insieme di dati corrisponde a “${filter}”.`,
    // --- evaluations ---
    tryAgain: "Riprova",
    serverDown: "Il server delle valutazioni al momento non è disponibile",
    serverDownText:
      "Questa valutazione gira sul server che ospita AZURE2, e non ha risposto. Riprova tra poco; nel frattempo l'atlante delle reazioni spiega la fisica.",
    atlas: "Atlante delle reazioni",
    elasticAxis: "dσ/dΩ (b/sr)",
    elasticNote:
      "I segmenti di diffusione elastica sono sempre mostrati come dσ/dΩ: per la diffusione il fattore S astrofisico non è definito.",
    mixedNote: "I segmenti scelti misurano grandezze diverse, quindi ognuno ha il suo grafico.",
    plotAria: (quantity: string, names: string) => `Grafico di ${quantity} in funzione dell'energia nel centro di massa: ${names}. I punti sono le misure, le linee il modello R-matrix.`,
    chi2Status: (v: string) => `Ricalcolato: il χ²/N medio degli insiemi di dati mostrati ora è ${v}.`,
    sliderValue: (value: string, unit: string) => `${value} ${unit}`,
    levelGroupAria: (jpi: string, energy: string) => `Livello ${jpi} a ${energy} MeV`,
    showDatasets: (n: number, total: number) => `Insiemi di dati (${n} su ${total} mostrati)`,
    chi2Total: (chi2: string, points: number, perPoint: string) =>
      `χ² totale = ${chi2} su ${points} punti (χ²/N = ${perPoint}).`,
    chi2Explain:
      "Il χ² è il termine dei dati ai parametri e alle normalizzazioni del modello pubblicato, calcolato come in AZURE2 (la normalizzazione scala insieme dati ed errori). I valori grandi sono riportati così come sono.",
    penaltyText: (v: string) => ` Il vincolo di AZURE2 sulle normalizzazioni aggiunge ${v}.`,
    normSummary: (free: number, constrained: number, fixed: number) =>
      `Normalizzazioni: ${free} libere nel fit (${constrained} con un'incertezza sistematica dichiarata, ${free - constrained} senza vincolo), ${fixed} fisse.`,
    normFixed: "fissa",
    normFreeSigma: (sigma: string) => `libera, σ = ${sigma}%`,
    normFreeNone: "libera, senza vincolo",
    file: "File",
    previewHint: "Il grafico resta in vista mentre scorri i livelli.",
    nothingToPlot: "Niente da mostrare: una scala logaritmica nasconde i valori non positivi.",
    model: "modello",
    // --- evaluations (round 2) ---
    chi2Shown: "χ²/N degli insiemi di dati mostrati",
    chi2None: "Nessun χ² per gli insiemi di dati mostrati (mancano le incertezze)",
    chi2All: "tutti gli attivi",
    residuals: "Residui",
    residualAxis: "(d − m)/σ",
    residualAria: (names: string) =>
      `Residui, (dati normalizzati − modello) / incertezza, in funzione dell'energia nel centro di massa: ${names}.`,
    ratioRutherford: "σ / σ Rutherford",
    rutherfordNote:
      "dσ/dΩ elastica divisa per la sezione d'urto di Rutherford (di Mott per particelle identiche), nel centro di massa; gli altri segmenti sono mostrati come sezioni d'urto.",
    fineLoading: "Calcolo del modello su una griglia fine in energia… nel frattempo è mostrata la linea che unisce i punti.",
    finePointwise: (names: string) =>
      `Modello mostrato solo alle energie misurate, con i punti uniti da segmenti: ${names}. Per questi segmenti un calcolo su una griglia di energie propria non riproduce i valori di AZURE2 nei punti misurati (oppure non hanno un unico angolo o un intervallo di energie), quindi non viene tracciata una curva continua.`,
    sZero: (energy: string) => `S a ${energy}`,
    sZeroNote:
      "S(E_min): il fattore S del modello all'energia più bassa di ciascuna estrapolazione selezionata (centro di massa), letto dalla curva stessa e segnato su di essa; è S(0) solo se quell'energia è abbastanza vicina a zero.",
    rateNote:
      "I tassi di reazione (N_A⟨σv⟩) non sono calcolati qui: l'interfaccia del codice usata da questo sito non espone l'integrazione dei tassi di AZURE2, e un tasso integrato da queste curve perderebbe le risonanze strette tra un punto e l'altro della griglia.",
    source: "Fonte",
    backgroundPoles: (energy: string, n: number) =>
      `${n} poli di fondo a ${energy} MeV (fissi, uno per spin-parità; asse interrotto)`,
    // --- evaluations (round 3) ---
    tipData: "dati × n",
    keyLabel: "Legenda",
    keyText: "Punti: dati misurati × la loro normalizzazione n, con barre d'errore di ±1σ. Linea nera: il modello R-matrix.",
    keyOriginal: "Linea grigia tratteggiata: il fit pubblicato, prima delle tue modifiche.",
    zoomHint: "Trascina sul grafico per ingrandire; doppio clic per tornare indietro.",
    resetZoom: "Annulla lo zoom",
    save: "Salva",
    chi2ShownShort: "per gli insiemi di dati mostrati",
    chi2AllShort: "per tutti i dati attivi",
    chi2Gloss:
      "χ²/N vicino a 1: il modello passa per i dati entro le loro incertezze; valori più grandi indicano un fit peggiore.",
    chi2Same: "invariato",
    better: "meglio",
    worse: "peggio",
    undo: "Annulla",
    redo: "Ripeti",
    angleAxis: "Angolo θ, c.m. (°)",
    tableDrawer: (n: number) => `Tabella di tutti i ${n} insiemi di dati: riferimenti, normalizzazioni, χ²`,
    plotColumn: "Grafico",
    plotThis: (name: string) => `Mostra ${name} nel grafico`,
    copyLink: "Copia il link",
    copied: "Link copiato",
    loadingView: "Caricamento della vista…",
    gamowTemperature: "Finestra di Gamow",
    gamowOff: "nessuna",
    gamowBand: (T9: string) => `Finestra di Gamow, T₉ = ${T9}`,
    gamowNote: (T9: string, E0: string, width: string, pair: string) =>
      `In grigio: la finestra di Gamow di ${pair} a T₉ = ${T9} (${T9} miliardi di kelvin), centrata in E₀ = ${E0} e larga Δ = ${width}: le energie a cui questa reazione avviene per lo più in una stella a quella temperatura.`,
    glossaryLink: "Approfondisci nel glossario",
    editLevel: "Regola i suoi parametri →",
  },

  /* -- atlas -------------------------------------------------------------- */
  atlas: {
    name: "Atlante delle reazioni",
    description:
      "Le reazioni nucleari che alimentano le stelle e producono gli elementi: dove si trovano sulla carta dei nuclidi, quanto bene è nota ciascuna, e come è stata misurata.",
    title: "Le reazioni nucleari che fanno brillare le stelle",
    history: "Una storia della disciplina",
    methodsLink: "Metodi e laboratori",
    mapLabel: "Mappa delle reazioni",
    lunaTitle: "Risultati LUNA nell'atlante",
    lunaOnTimeline: "LUNA nella cronologia",
    myLuna: "Il mio ruolo in LUNA, dal 2020",
    lunaText:
      "Le reazioni dell'atlante con almeno una misura pubblicata dalla collaborazione LUNA, con gli anni di quelle misure.",
    timelineCard: "Cronologia",
    timelineCardText:
      "Dall'intuizione di Eddington nel 1920 alle più recenti misure in laboratorio sotterraneo, passando per le osservazioni e le infrastrutture.",
    methodsCard: "Metodi e laboratori",
    methodsCardText: "Come si misura una sezione d'urto alle energie stellari, in modo diretto o indiretto, e dove.",
    dataCard: "I dati",
    dataCardText: (reactions: number, written: number, references: number) =>
      `L'intero atlante in un unico file JSON: ${reactions} reazioni${written === reactions ? "" : ` (${written} con una scheda)`}, ${references} riferimenti bibliografici, con valori Q e finestre di Gamow calcolati da AME2020.`,
    dataInEnglish: "Il file è in inglese.",
    lunaMarks:
      "indica il lavoro di LUNA in tutto l'atlante. Valori Q dalla valutazione delle masse AME2020, tempi di dimezzamento da NUBASE2020.",
    measuredAtLuna: "Misurata a LUNA",
    entryInPreparation: "Scheda in preparazione",
    englishSection: "Questa sezione tecnica è in inglese.",
    entryDescription: (label: string) => `${label}: scheda in preparazione nell'atlante delle reazioni.`,
    facts: "Dati essenziali",
    qValue: "Valore Q",
    qAnnihilation: (kinetic: string) => [
      "Q include l'annichilazione del positrone (2m",
      "e",
      "c² = 1,022 MeV). Senza di essa, ",
      `${kinetic} MeV`,
      " sono ripartiti tra il positrone e il neutrino.",
    ],
    halfLifeOf: "Tempo di dimezzamento del",
    halfLifeLabCapture:
      "In laboratorio. In una stella gli stati eccitati dalla temperatura e la ionizzazione possono cambiarlo; decide quanto spesso questo nucleo decade prima di catturare un neutrone.",
    halfLifeLab:
      "In laboratorio, come atomo neutro. In una stella la densità di elettroni, e quindi il tasso, è diversa.",
    gamow: "Finestra di Gamow",
    gamowNote: [
      "Energia del picco E",
      "0",
      " ± metà della larghezza a 1/e, nel centro di massa, dalle masse AME2020.",
    ],
    thermal: "Energia termica kT",
    whyNoGamow: "Perché non c'è una finestra di Gamow",
    energies: "Energie",
    product: "Prodotto",
    radioactive: "radioattivo",
    kind: "Tipo",
    preparationText: (one: boolean) =>
      `La descrizione di questa reazione e delle sue misure non è ancora stata scritta. La sua posizione ${one ? "nella sua rete" : "nelle sue reti"} e le grandezze calcolate dalle masse nucleari sono già qui.`,
    onTimeline: "Nella cronologia",
    howMeasured: "Come è stata misurata",
    labNotGiven: "Laboratorio non indicato",
    tryTitle: "Provala: una valutazione R-matrix",
    tryText:
      "Su questo sito gira un modello AZURE2 di questo sistema. Cambia le energie e le larghezze dei livelli e osserva come seguono il fit ai dati e l'estrapolazione alle energie stellari.",
    openEvaluation: ["Apri la valutazione del ", " →"],
    details: "Dettagli",
    evaluationsTitle: "Valutazioni",
    evaluationsText: "Compilazioni che combinano i dati in un tasso di reazione raccomandato.",
    openQuestions: "Questioni aperte",
    related: "Reazioni correlate",
    references: "Bibliografia",
    referenceNotFound: "riferimento non trovato",
    along: (name: string) => `Lungo ${name}`,
    theNetwork: "la rete",
    previousIn: "Precedente in",
    nextIn: "Successiva in",
    timelineMeta: "Cronologia · Atlante delle reazioni",
    timelineDescription:
      "Una storia dell'astrofisica nucleare: la teoria, gli esperimenti, le osservazioni e i laboratori, dal 1920 a oggi.",
    timelineTitle: "Una storia dell'astrofisica nucleare",
    timelineLead:
      "Come abbiamo capito che cosa alimenta le stelle: le idee, le misure, le osservazioni che le hanno messe alla prova e i laboratori che hanno reso possibili le misure.",
    timelinePending:
      "La cronologia è in preparazione. Nel frattempo, la pagina di ogni reazione elenca le sue misure in ordine cronologico.",
    show: "Mostra",
    all: "Tutti",
    categories: {
      theory: "Teoria",
      experiment: "Esperimento",
      observation: "Osservazione",
      facility: "Infrastruttura",
      luna: "LUNA",
    },
    months: ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
    decades: "Decenni",
    decade: (d: number) => (d >= 1910 && d < 2000 ? `Anni '${String(d).slice(2)}` : `Anni ${d}`),
    undated: "Senza data",
    nothingHere: "Ancora nulla in questa categoria.",
    officialPage: "Pagina ufficiale",
    methodsMeta: "Metodi e laboratori · Atlante delle reazioni",
    methodsDescription:
      "Come si misurano le sezioni d'urto alle energie stellari, in modo diretto e indiretto, e i laboratori che le misurano.",
    methodsTitle: "Metodi e laboratori",
    methodsLead:
      "Una sezione d'urto alle energie stellari si può misurare direttamente, puntando un fascio su un bersaglio e contando le reazioni, oppure ricavare da altre reazioni e dalla teoria. Ogni strada ha la sua portata e i suoi limiti sistematici.",
    methods: "Metodi",
    methodsPending: "I metodi sono in fase di descrizione.",
    groups: {
      underground: {
        title: "Laboratori sotterranei",
        lead: "Acceleratori sotto la roccia, dove il fondo dovuto ai raggi cosmici è abbastanza basso da misurare le sezioni d'urto più piccole.",
      },
      surface: {
        title: "Laboratori in superficie",
        lead: "Acceleratori, separatori di rinculo e sorgenti di neutroni in superficie, da cui vengono i dati a energia più alta e la maggior parte delle misure indirette.",
      },
      other: { title: "Altre infrastrutture", lead: "Infrastrutture la cui descrizione è ancora in preparazione." },
    },
    descriptionPending: "Descrizione in preparazione.",
    strengths: "Punti di forza",
    limits: "Limiti",
    examples: "Esempi nell'atlante",
    facts_: {
      lab: "Laboratorio",
      location: "Luogo",
      depth: "Profondità",
      accelerator: "Acceleratore",
      years: "Anni",
    },
    measurementsHere: "Misure nell'atlante",
    website: "Sito web",
    process: "Processo",
    networksShown: "Reti mostrate",
    zoomToProcess: "Ingrandisci il processo",
    wholeChart: "Tutta la carta",
    chartLabel: (name: string) =>
      `Carta dei nuclidi, con il numero di neutroni in orizzontale e il numero di protoni in verticale; a colori le reazioni di ${name}`,
    theAtlas: "tutto l'atlante",
    protonsAxis: "↑ protoni Z",
    neutronsAxis: "neutroni N →",
    tipPending: "Scheda in preparazione.",
    legendWeight: "Spessore della linea: reazione chiave, principale, secondaria",
    legendOther: "Altri processi",
    legendStable: "Stabile, radioattivo",
    mapHelp:
      "Passa con il mouse su una freccia per vederne il nome e fai clic per i dettagli, oppure fai clic su una casella per le reazioni di quel nucleo. Da tastiera, Tab porta alla mappa e i tasti freccia si spostano tra le reazioni del processo mostrato.",
    closeDetails: "Chiudi i dettagli",
    close: "Chiudi",
    selectArrow:
      "Seleziona una freccia per vedere che cosa fa la reazione, quanta energia libera e quanto bene è nota.",
    decay: "decadimento",
    panelPending:
      "La scheda di questa reazione è in preparazione. Qui sotto trovi la sua posizione nella rete, l'energia liberata e la finestra di Gamow.",
    networks: "Reti",
    qShort: (kinetic: string) => `Q include l'annichilazione del positrone; ${kinetic} MeV senza`,
    halfLife: "Tempo di dimezzamento",
    measurements: "Misure",
    noneYet: "nessuna ancora elencata",
    rmatrix: "R-matrix",
    interactive: "Valutazione interattiva →",
    fullEntry: "La scheda completa",
    soFar: "Quello che c'è finora",
    // --- atlas ---
    mapHelpTouch:
      "Tocca una freccia per vedere che cosa fa la reazione, o una casella per l'elenco delle reazioni di quel nucleo; i pulsanti sopra la mappa scelgono il processo a colori.",
    startHere: "Inizia da qui",
    startHereTitle: (n: number) => `Un secolo di fusione stellare in ${n} momenti`,
    startHereText: (total: number) =>
      `Dall'intuizione di Eddington nel 1920 alle misure sotto una montagna: come abbiamo capito che cosa fa brillare le stelle. La cronologia completa ha ${total} voci.`,
    howToRead: "Come leggere la mappa",
    readSteps: [
      "Ogni casella è un nucleo atomico. Un passo verso l'alto aggiunge un protone e dà l'elemento successivo; un passo verso destra aggiunge un neutrone.",
      "Ogni freccia è una reazione o un decadimento. Dritta in alto: viene catturato un protone. Due passi in alto e due a destra: viene catturato un nucleo di elio. Uno in basso e uno a destra: un decadimento β⁺, in cui un protone si trasforma in un neutrone.",
      "Le caselle piene, in grigio, sono nuclei stabili; quelle solo contornate sono radioattive.",
      "Il colore di una freccia indica il processo a cui appartiene; i pulsanti sopra la mappa scelgono il processo. Le linee più spesse sono le reazioni più importanti.",
      "Alcune frecce fanno salti lunghi. Quando si fondono due nuclei più pesanti dell'elio, come nella combustione del carbonio, formano un nucleo molto eccitato che si spezza subito: ¹²C + ¹²C dà ²⁴Mg*, che si divide in ²⁰Ne e una particella alfa oppure in ²³Na e un protone. La freccia va direttamente dal ¹²C al prodotto finale.",
    ],
    diagram: {
      label:
        "Schema: come leggere la carta. Una casella per ogni nucleo; una freccia in alto per la cattura di un protone, a destra per la cattura di un neutrone, due in alto e due a destra per la cattura di un nucleo di elio, una in basso e una a destra per un decadimento β⁺; una casella piena è stabile, una contornata radioattiva.",
      protons: "protoni",
      neutrons: "neutroni",
      pCapture: "+ protone",
      nCapture: "+ neutrone",
      aCapture: "+ elio‑4",
      betaPlus: "β⁺",
      stable: "stabile",
      radioactive: "radioattivo",
    },
    notationTitle: "Come si legge una reazione",
    notation: [
      "significa: un nucleo di azoto‑14 (il bersaglio) cattura un protone (ciò che entra) e diventa ossigeno‑15 (il prodotto), emettendo un raggio gamma (ciò che esce). Ogni reazione si scrive allo stesso modo:",
      "bersaglio(entra,esce)prodotto",
    ],
    primerTitle: "Perché queste reazioni contano, e perché si misurano sotto terra",
    statusLegend: "Quanto bene è noto ciascun tasso di reazione:",
    moreInGlossary: "Di più nel glossario",
    glossaryLink: "Glossario",
    readNotation: "Come si legge la notazione",
    measurementCount: (n: number, span: string, luna: number) =>
      `${n} ${n === 1 ? "misura" : "misure"}${span ? `, ${span}` : ""}${luna ? `, ${luna === 1 ? "una" : `di cui ${luna}`} a LUNA` : ""}`,
    showList: "Mostra l'elenco",
    hideList: "Nascondi l'elenco",
    statusFact: "Quanto è noto",
    lastUpdated: "Ultimo aggiornamento",
    onThisPage: "In questa pagina",
    summaryAnchor: "In breve",
    forSpecialists: "Per specialisti",
    citeTitle: "Come citare questo atlante",
    citeVersion: "versione",
    citeAccessed: "Cita la versione che hai usato; la data è quella dell'ultima modifica dei contenuti.",
    licence: (name: string) =>
      `I testi e i dati, compreso data.json, sono distribuiti con licenza ${name}: puoi riutilizzarli citando la fonte.`,
    licenceLink: "Licenza",
    glossaryMeta: "Glossario · Atlante delle reazioni",
    glossaryTitle: "Glossario",
    glossaryDescription:
      "I termini dell'astrofisica nucleare usati nell'atlante delle reazioni, in parole semplici: sezione d'urto, fattore S, finestra di Gamow, risonanza, valore Q e altri.",
    glossaryLead:
      "Le parole che l'atlante usa, in linguaggio semplice. Ogni pagina di reazione rimanda qui la prima volta che un termine compare.",
    seeAlso: "Vedi anche",
    familyPageLink: (name: string) => `${name}, dal ferro al piombo`,
    sProcessLink: "Il processo s",
    sProcessCard: "Il processo s",
    sProcessCardText:
      "Come le catture lente di neutroni portano il ferro fino al piombo: il percorso sulla carta dei nuclidi, i suoi punti di diramazione e come si misurano le catture.",
    glossaryPage: "Approfondisci nella pagina dedicata",
    alsoInAtlas: "Nell'atlante",
    readMore: "Leggi tutto",
    readLess: "Mostra meno",
    // --- atlas (round 2) ---
    qReleased: "energia liberata",
    qNeeded: "energia richiesta",
    thresholdLimited: (q: string) => `Sopra la soglia di ${q} MeV`,
    thresholdExplain:
      "Per una reazione endotermica la finestra ordinaria cadrebbe in parte o del tutto sotto la soglia, |Q|, dove la reazione non può avvenire; l'intervallo mostrato parte dalla soglia e arriva fin dove il prodotto del fattore di Boltzmann e della penetrazione coulombiana, exp(−E/kT − 2πη), è sceso di 1/e rispetto al suo massimo sopra soglia.",
    statusInDetail: "Quanto è nota, nel dettaglio",
    highlights: "In evidenza",
    arrowKeyTitle: "I tipi di freccia",
    arrowKey: [
      ["(p,γ)", "viene catturato un protone: uno in alto"],
      ["(α,γ)", "viene catturato un nucleo di elio: due in alto, due a destra"],
      ["(p,α)", "entra un protone, esce un nucleo di elio: uno in basso, due a sinistra"],
      ["(α,n)", "entra un nucleo di elio, esce un neutrone: due in alto, uno a destra"],
      ["(n,γ)", "viene catturato un neutrone: uno a destra"],
      ["β⁺", "un protone diventa un neutrone: uno in basso, uno a destra"],
      ["¹²C + ¹²C", "due nuclei pesanti si fondono: un salto lungo"],
    ] as [string, string][],
    nuclide: "Nucleo",
    stableNuclide: "stabile",
    cellFrom: (name: string) => `Reazioni che partono da ${name}`,
    cellTo: (name: string) => `Reazioni che producono ${name}`,
    cellNone: "Nessuna reazione dell'atlante parte o arriva qui.",
    lunaFigureTitle: "Perché sotto terra",
    lunaFigure: {
      alt: "Sezione schematica del Gran Sasso. I muoni dei raggi cosmici che arrivano dall'alto si fermano nella roccia; solo circa uno su un milione raggiunge le sale sotterranee, circa 1400 m sotto la vetta, dove l'acceleratore LUNA da 400 kV e l'acceleratore LUNA-MV da 3,5 MV del Bellotti Ion Beam Facility mandano i loro fasci su bersagli circondati da rivelatori.",
      rock: "roccia",
      tunnel: "galleria autostradale",
      items: [
        "In superficie i raggi cosmici producono una pioggia continua di muoni, che lasciano segnali in qualunque rivelatore di raggi γ.",
        "Circa 1400 m di roccia (3800 m di acqua equivalente) fermano tutti i muoni tranne circa uno su un milione.",
        "LUNA 400 kV: fasci di protoni e di elio per la combustione dell'idrogeno, dai primi anni 2000.",
        "LUNA-MV, 3,5 MV, al Bellotti Ion Beam Facility, inaugurato nel 2023: fasci di protoni, elio e carbonio per la combustione dell'elio e del carbonio.",
        "Il fascio colpisce un bersaglio; un rivelatore intorno conta i raggi γ o le particelle delle poche reazioni.",
      ],
      note: "Schema, non in scala.",
    },
  },
}

export const DICTIONARIES: Record<Lang, Dictionary> = { en, it }

/** The UI strings of `lang`. */
export const dict = (lang: Lang): Dictionary => DICTIONARIES[lang]
