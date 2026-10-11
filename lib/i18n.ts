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
  return stripped === name ? name : stripped.charAt(0).toUpperCase() + stripped.slice(1)
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
    runEvaluation: "Run an R-matrix evaluation",
    exploreAtlas: "Explore the reaction atlas",
    publications: "Publications",
    cv: "CV",
    research: "Research",
    allResearch: "All research threads",
    atlasTitle: "A reaction atlas",
    atlasText:
      "The reactions of the pp chains, the CNO cycles, helium burning and the Big Bang, drawn on the chart of nuclides. For each one: what it does in a star, how well its rate is known, and who measured it, where and how, with the references.",
    openAtlas: "Open the atlas",
    evaluationsTitle: "R-matrix evaluations, live",
    evaluationsText:
      "Published evaluations, running the real AZURE2 code. Open a compound nucleus, look at its level scheme and the data it was fitted to, move a level energy or a reduced width, and watch the cross section and the χ² respond. Nothing is installed, and the input files can be downloaded and run locally.",
    browseEvaluations: "Browse the evaluations",
    notes: "Notes",
    allNotes: "All notes",
    notesInEnglish: "",
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
  },

  /* -- publications ------------------------------------------------------- */
  publications: {
    title: "Publications",
    description:
      "Peer-reviewed articles and conference proceedings by Jakub Skowronski in experimental nuclear astrophysics.",
    lead: (n: number) =>
      `${n} peer-reviewed articles and proceedings. Entries marked with a rule are those I authored or co-authored in a leading role.`,
    orcidBefore: "A complete and current list is on ",
    orcidAfter: ".",
    sections: { article: "Research articles", proceedings: "Conference proceedings" } as Record<string, string>,
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
      "Each of these is a published multi-level, multi-channel fit. Open one to see its level scheme and the data it was fitted to, then move a level energy or a reduced width and watch the cross section and the χ² respond — the calculation is the real AZURE2 code, not an approximation. Every evaluation can also be downloaded as an ",
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
  },

  /* -- the evaluation workspace ------------------------------------------- */
  workspace: {
    starting: (id: string) => `Starting AZURE2 for ${id}…`,
    loadingEngine: "Loading the engine…",
    inBrowser: "AZURE2 runs in your browser; the first evaluation takes a few seconds to load.",
    progress: {} as Record<string, string>,
    unexpected: "Unexpected error",
    retry: "Retry",
    back: "Back",
    evaluations: "Evaluations",
    expired: "This session expired on the server.",
    reopen: "Reopen",
    tabs: { scheme: "Level scheme", data: "Data", plot: "Plot", extrap: "Extrapolations" },
    calculatingData: "Calculating data segments…",
    calculatingExtrap: "Calculating extrapolations…",
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
    energyAxis: "Energy (MeV)",
    datasets: "Datasets",
    off: "off",
    downloadCsv: "Download CSV",
    measured: "measured",
    extrapolations: "Extrapolations",
    addMeasured: "Add measured data",
    addMeasuredText: "Overlay measured datasets from this evaluation onto the extrapolation curves.",
    openDataFirst: "Open the Data tab first to load the measured segments.",
    // data table
    data: "Data",
    dataSummary: (segments: number, active: number, points: number) =>
      `${segments} segments · ${active} active · ${points} points`,
    meanChi2: (v: string) => ` · mean χ²/N ${v}`,
    filterDatasets: "Filter datasets…",
    dataset: "Dataset",
    reaction: "Reaction",
    observable: "Observable",
    angle: "Angle (°)",
    points: "Points",
    norm: "Norm",
    inactive: "inactive",
    normFree: "normalization is a fit parameter",
    noMatch: (filter: string) => `No datasets match “${filter}”.`,
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
    lunaTitle: "LUNA measurements",
    lunaOnTimeline: "LUNA on the timeline",
    myLuna: "My work at LUNA",
    lunaText:
      "Reactions in the atlas with at least one measurement published by the LUNA collaboration, with the years of those measurements.",
    timelineCard: "Timeline",
    timelineCardText:
      "From Eddington's guess in 1920 to the latest underground measurements, with the observations and facilities in between.",
    methodsCard: "Methods and laboratories",
    methodsCardText: "How a cross section at stellar energies is measured, directly or indirectly, and where.",
    dataCard: "The data",
    dataCardText: (reactions: number, written: number, references: number) =>
      `The whole atlas as one JSON file: ${reactions} reactions (${written} with an entry), ${references} references, with Q-values and Gamow windows computed from AME2020.`,
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
      "Hover or focus an arrow for its name; select it for the details. Tab moves between the reactions of the process on show.",
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
    runEvaluation: "Prova una valutazione R-matrix",
    exploreAtlas: "Esplora l'atlante delle reazioni",
    publications: "Pubblicazioni",
    cv: "CV",
    research: "Ricerca",
    allResearch: "Tutti i temi di ricerca",
    atlasTitle: "Un atlante delle reazioni",
    atlasText:
      "Le reazioni delle catene protone-protone, dei cicli CNO, della combustione dell'elio e del Big Bang, disegnate sulla carta dei nuclidi. Per ciascuna: che cosa fa in una stella, quanto bene se ne conosce il tasso, e chi l'ha misurata, dove e come, con la bibliografia.",
    openAtlas: "Apri l'atlante",
    evaluationsTitle: "Valutazioni R-matrix, dal vivo",
    evaluationsText:
      "Valutazioni pubblicate, calcolate con il vero codice AZURE2. Apri un nucleo composto, guarda il suo schema dei livelli e i dati su cui è stato fatto il fit, sposta l'energia di un livello o una larghezza ridotta e osserva come rispondono la sezione d'urto e il χ². Non serve installare nulla, e i file di input si possono scaricare ed eseguire in locale.",
    browseEvaluations: "Sfoglia le valutazioni",
    notes: "Note",
    allNotes: "Tutte le note",
    notesInEnglish: "Le note sono scritte in inglese.",
  },

  /* -- research ----------------------------------------------------------- */
  research: {
    title: "Ricerca",
    description:
      "Misure di sezioni d'urto in laboratorio sotterraneo, valutazioni R-matrix, tracciamento dei raggi γ e schermo elettronico.",
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
  },

  /* -- publications ------------------------------------------------------- */
  publications: {
    title: "Pubblicazioni",
    description:
      "Articoli su riviste con revisione paritaria e atti di conferenze di Jakub Skowronski in astrofisica nucleare sperimentale.",
    lead: (n: number) =>
      `${n} articoli con revisione paritaria e atti di conferenze. Le voci segnate da una linea sono quelle di cui sono autore o coautore con un ruolo di primo piano. I titoli sono riportati come pubblicati.`,
    orcidBefore: "Un elenco completo e aggiornato è su ",
    orcidAfter: ".",
    sections: { article: "Articoli di ricerca", proceedings: "Atti di conferenze" },
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
      "Ognuna di queste è un fit pubblicato a più livelli e più canali. Aprine una per vedere il suo schema dei livelli e i dati del fit, poi sposta l'energia di un livello o una larghezza ridotta e osserva come rispondono la sezione d'urto e il χ²: il calcolo è il vero codice AZURE2, non un'approssimazione. Ogni valutazione si può anche scaricare come progetto ",
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
    pageTitle: (nuclide: string) => `Valutazione R-matrix del ${nuclide}`,
    pageDescription: (nuclide: string) =>
      `Una valutazione R-matrix interattiva del sistema ${nuclide} con AZURE2: schema dei livelli, dati del fit ed estrapolazione alle energie stellari.`,
    inAtlas: "Nell'atlante delle reazioni",
    inAtlasText: "Che cosa fa questa reazione nelle stelle, come è stata misurata e che cosa è ancora incerto:",
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
    tabs: { scheme: "Schema dei livelli", data: "Dati", plot: "Grafico", extrap: "Estrapolazioni" },
    calculatingData: "Calcolo dei segmenti di dati…",
    calculatingExtrap: "Calcolo delle estrapolazioni…",
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
    energyAxis: "Energia (MeV)",
    datasets: "Insiemi di dati",
    off: "escluso",
    downloadCsv: "Scarica CSV",
    measured: "misurato",
    extrapolations: "Estrapolazioni",
    addMeasured: "Aggiungi dati misurati",
    addMeasuredText: "Sovrapponi alle curve estrapolate gli insiemi di dati misurati di questa valutazione.",
    openDataFirst: "Apri prima la scheda Dati per caricare i segmenti misurati.",
    data: "Dati",
    dataSummary: (segments: number, active: number, points: number) =>
      `${segments} segmenti · ${active} attivi · ${points} punti`,
    meanChi2: (v: string) => ` · χ²/N medio ${v}`,
    filterDatasets: "Filtra gli insiemi di dati…",
    dataset: "Insieme di dati",
    reaction: "Reazione",
    observable: "Osservabile",
    angle: "Angolo (°)",
    points: "Punti",
    norm: "Norm.",
    inactive: "inattivo",
    normFree: "la normalizzazione è un parametro del fit",
    noMatch: (filter: string) => `Nessun insieme di dati corrisponde a “${filter}”.`,
  },

  /* -- atlas -------------------------------------------------------------- */
  atlas: {
    name: "Atlante delle reazioni",
    description:
      "Le reazioni nucleari che alimentano le stelle e producono gli elementi: dove si trovano sulla carta dei nuclidi, quanto bene è noto ciascuna, e come è stata misurata.",
    title: "Le reazioni nucleari che fanno brillare le stelle",
    history: "Una storia della disciplina",
    methodsLink: "Metodi e laboratori",
    mapLabel: "Mappa delle reazioni",
    lunaTitle: "Le misure di LUNA",
    lunaOnTimeline: "LUNA nella cronologia",
    myLuna: "Il mio lavoro a LUNA",
    lunaText:
      "Le reazioni dell'atlante con almeno una misura pubblicata dalla collaborazione LUNA, con gli anni di quelle misure.",
    timelineCard: "Cronologia",
    timelineCardText:
      "Dall'intuizione di Eddington nel 1920 alle più recenti misure in laboratorio sotterraneo, con le osservazioni e le infrastrutture nel mezzo.",
    methodsCard: "Metodi e laboratori",
    methodsCardText: "Come si misura una sezione d'urto alle energie stellari, in modo diretto o indiretto, e dove.",
    dataCard: "I dati",
    dataCardText: (reactions: number, written: number, references: number) =>
      `L'intero atlante in un unico file JSON: ${reactions} reazioni (${written} con una scheda), ${references} riferimenti bibliografici, con valori Q e finestre di Gamow calcolati da AME2020.`,
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
    decade: (d: number) => `Anni ${d}`,
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
      "Passa sopra una freccia o dalle il focus per vederne il nome; selezionala per i dettagli. Il tasto Tab passa da una reazione all'altra del processo mostrato.",
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
  },
}

export const DICTIONARIES: Record<Lang, Dictionary> = { en, it }

/** The UI strings of `lang`. */
export const dict = (lang: Lang): Dictionary => DICTIONARIES[lang]
