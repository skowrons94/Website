/**
 * The site's two languages: English at the root, Italian under /it.
 *
 * Every UI string lives here, in one dictionary per language with the same
 * shape (TypeScript checks that `it` has every key `en` has). Content — the
 * profile, the research threads, the atlas — is translated in the content files
 * themselves, as `*_it` fields beside the English (see `lib/localize.mjs`).
 *
 * No file access, so client components can import it; but it weighs about
 * 20 kB compressed in a browser bundle, so the site chrome (header, footer,
 * search) takes its strings as props from the server instead.
 */

// The language type and the path helpers live in lib/locale.ts, which client
// components can import without pulling in the dictionaries below.
export { LANGS, englishPath, langOf, localePath, type Lang } from "@/lib/locale"
import type { Lang } from "@/lib/locale"
import { evalEn, evalIt } from "@/lib/i18n-eval"

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
    // --- site (round 3) ---
    home: "Home",
    learn: "Learn",
    glossary: "Glossary",
    methods: "Methods and laboratories",
    methodsShort: "Methods",
    timeline: "Timeline",
    sProcess: "The s-process",
    groups: { work: "Work", explore: "Explore", learn: "Learn" },
    // One line each, under the label in the phone menu and the Learn menu.
    descriptions: {
      research: "Underground measurements, R-matrix theory, γ\u2011ray tracking",
      atlas: "The reactions that power stars, on the chart of nuclides",
      evaluations: "Live R-matrix fits you can adjust",
      publications: "Articles and conference proceedings",
      cv: "Employment, education, talks and teaching",
      software: "AZURE2, LunaSRIM and other code",
      notes: "R-matrix theory written out, with worked examples",
      glossary: "The words the atlas uses, in plain language",
      methods: "How reactions are measured, and where",
      timeline: "A century of nuclear astrophysics",
      sProcess: "How stars make half the heavy elements",
    },
    breadcrumb: "Breadcrumb",
    // --- rates ---
    rates: "Reaction rates",
    ratesDescription: "How fast each reaction runs, and what if it were different",
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
    // --- rates ---
    rates: "Reaction rates",
  },
  // --- site (round 3) ---
  search: {
    button: "Search",
    title: "Search the site",
    placeholder: "Reactions, terms, notes, papers…",
    close: "Close",
    loading: "Loading…",
    error: "The search index could not be loaded. Try again later.",
    // Plain strings with {q} and {n}, not functions: the search dialog is a
    // client component and gets these as props from the server.
    none: "Nothing found for “{q}”.",
    countOne: "1 result",
    countMany: "{n} results",
    suggestions: "Go to",
    hintMove: "move",
    hintOpen: "open",
    hintClose: "close",
    external: "opens the publisher's page",
    groups: {
      page: "Pages",
      process: "Processes in stars",
      reaction: "Reactions",
      evaluation: "Evaluations",
      glossary: "Glossary",
      note: "Notes",
      section: "Sections of notes",
      research: "Research",
      method: "Methods",
      facility: "Laboratories",
      publication: "Publications",
    } as Record<string, string>,
    // --- site (round 4) ---
    // One word per result, beside it: what kind of thing it is.
    types: {
      page: "Page",
      process: "Process",
      reaction: "Reaction",
      evaluation: "Evaluation",
      glossary: "Glossary",
      note: "Note",
      section: "Note",
      research: "Research",
      method: "Method",
      facility: "Laboratory",
      publication: "Paper",
    } as Record<string, string>,
    // Before anything is typed.
    tryLabel: "Try:",
    // Each is typed into the field when chosen.
    tryQueries: ["LUNA", "Sun", "s-process"],
    recent: "Recent",
    // A fixed list of good starting points (not counted from searches).
    popular: "Suggested",
    pages: "Pages",
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
      "Evaluations from published and forthcoming work, running the real AZURE2 code. Open a compound nucleus, look at its level scheme and the data it was fitted to, move a level energy or a reduced width, and watch the cross section and the χ² respond. Nothing is installed, and the input files can be downloaded and run locally.",
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
    // --- site (round 3) ---: the legend in plain words
    legendCapture: "a proton is captured",
    legendDecay: "β⁺ decay: a proton turns into a neutron",
    legendClose: "proton in, helium out: back to carbon",
    selectedPapers: "Selected papers",
    // --- site (round 4) ---
    rolesTitle: "Roles and recognition",
    rolesMore: "All of it in the CV",
    resourcesTitle: "Resources for the community",
    resourcesLead: "Open, dated and citable: what this site offers anyone working on these reactions.",
    resourceAtlas: "Reaction atlas",
    resourceAtlasText: (n: number) => `${n} reactions of stellar burning and the Big Bang on the chart of nuclides: what each does, how well its rate is known, who measured it and how.`,
    resourceSProcess: "The s-process",
    resourceSProcessText: "How stars make half the elements heavier than iron, on the chart from iron to bismuth.",
    resourceSProcessMeta: "Part of the atlas, cited as the atlas",
    resourceEvaluations: "R-matrix evaluations",
    resourceEvaluationsText: (n: number) => `${n} published R-matrix evaluations running AZURE2 in the browser, with their input files to download and run locally.`,
    resourceEvaluationsMeta: "How to cite: on each evaluation's page",
    resourceNotes: "Notes",
    resourceNotesText: (n: number) => `${n} notes on R-matrix theory, each with a worked example on a real reaction (in English).`,
    resourceGlossary: "Glossary",
    resourceGlossaryText: (n: number) => `${n} terms of nuclear astrophysics in plain language, in English and Italian.`,
    licence: (l: string) => `${l} licence`,
    version: (v: string) => `version ${v}`,
    howToCite: "How to cite",
    // The broader-impact line, with the outreach in experience.yaml.
    impactBefore: "The atlas, the glossary and the evaluations are also in ",
    impactLink: "Italian",
    impactAfter:
      ", for students and the public as well as specialists. Outreach so far includes Stelle sulla Terra, nuclear astrophysics for children with disabilities (2024), and courses on nuclear astrophysics for high-school students (PCTO, 2021–2022): ",
    impactCv: "outreach in the CV",
    outlookMore: "What comes next →",
    // --- r9 rates ---
    resourceRates: "Reaction-rate explorer",
    resourceRatesText:
      "The pp chains, CNO, NeNa, MgAl and the s-process. Find the slowest step at a stellar site, change a rate and watch the abundances respond, computed in your browser from JINA REACLIB.",
    resourceRatesSources: "Sources",
    resourceRatesLink: "See where a rate ends up: the rate explorer",
    // --- r7 site ---
    resourceEvaluationsSplit: (n: number, published: number) =>
      `${n} R-matrix evaluations running AZURE2 in the browser: ${published} from published papers, ${n - published} not yet published. Each comes with its input files, to download and run locally.`,
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
      `${articles} peer-reviewed articles and ${proceedings} conference proceedings${review ? `, and ${review} more submitted or under review` : ""}. A dark rule marks the papers I wrote as first author; a light rule marks my other key papers: those on which I am among the first authors or the corresponding author, and those where my role is given beside the authors.`,
    sections: { article: "Research articles", proceedings: "Conference proceedings" } as Record<string, string>,
    // --- site ---
    profiles: "Complete and current lists, with citations:",
    filter: "Show",
    all: "All",
    firstAuthor: "First author",
    underReview: "Submitted or under review",
    underReviewNote: "Submitted and not yet published, so not counted among the peer-reviewed articles above.",
    // --- site (round 2) ---
    luna: "LUNA",
    year: "Year",
    allYears: "All years",
    shown: (n: number) => (n === 1 ? "1 publication shown" : `${n} publications shown`),
    // --- site (round 3) ---
    none: "No publication matches this filter.",
    // --- r7 site ---
    /** "First author: 5 articles (Phys. Rev. Lett., 3 × Phys. Rev. C, J. Phys. G), 2 conference proceedings and 1 submitted." */
    firstAuthorSummary: (articles: number, venues: string, proceedings: number, submitted: number) =>
      `First author: ${articles} ${articles === 1 ? "article" : "articles"}${venues ? ` (${venues})` : ""}, ${proceedings} ${proceedings === 1 ? "conference proceeding" : "conference proceedings"}${submitted ? ` and ${submitted} submitted` : ""}.`,
    firstAuthorTag: "First author",
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

  // Evaluation pages: lib/i18n-eval.ts (kept apart for the client bundles).
  ...evalEn,

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
    // --- rates ---
    exploreRates: "Explore the rates",
    exploreRatesOf: (name: string) => `Explore the rates: ${name}`,
    ratesLink: "Reaction rates",
    ratesCard: "Reaction rates, live",
    ratesCardText: "How fast each reaction runs in a star, and what changes when a rate does. Calculated in your browser.",
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
      tunnelShort: "motorway tunnel",
      items: [
        "At the surface, cosmic rays make a steady rain of muons, which leave signals in any γ-ray detector.",
        "About 1400 m of rock (3800 m water equivalent) stop all but about one muon in a million.",
        "LUNA 400 kV: proton and helium beams for hydrogen burning, since the early 2000s.",
        "LUNA-MV, 3.5 MV, at the Bellotti Ion Beam Facility, inaugurated in 2023: proton, helium and carbon beams for helium and carbon burning.",
        "The beam hits a target; a detector around it counts the γ-rays or particles from the few reactions.",
      ],
      note: "Schematic, not to scale.",
    },
    // --- atlas (round 3) ---
    /** Said once per translated page, where its first English section begins. */
    englishSections: (_sections: string[]) => "",
    sectionNames: { measurements: "the list of measurements", details: "Details", openQuestions: "Open questions" },
    thermalPlain: (kT: string, mk: string) => `about ${kT} keV, the energy of a gas at ${mk} million degrees`,
    thermalBySite: "By stellar site",
    skipToMap: "Skip to the map",
    lunaMountain: "Gran Sasso",
    // --- atlas (round 4) ---
    plotData: "Plot the data",
    plotDataOf: (system: string) => `Plot the data of the ${system} evaluation`,
    // --- r7 site ---
    /** An evaluation linked from a reaction it does not itself fit: "⁴He(α,α)⁴He (⁸Be) evaluation". */
    relatedEvaluation: (reaction: string, system: string) => `${reaction} (${system}) evaluation`,
    relatedEvaluationAria: (reaction: string, system: string) =>
      `Open the ${system} evaluation, which fits ${reaction}, not this reaction`,
    liveEvaluation: "Live evaluation",
    noLiveEvaluation: "No live evaluation yet",
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
    // --- site (round 3) ---
    home: "Home",
    learn: "Approfondimenti",
    glossary: "Glossario",
    methods: "Metodi e laboratori",
    methodsShort: "Metodi",
    timeline: "Cronologia",
    sProcess: "Il processo s",
    groups: { work: "Lavoro", explore: "Esplora", learn: "Approfondimenti" },
    descriptions: {
      research: "Misure sotterranee, teoria R-matrix, tracciamento dei raggi γ",
      atlas: "Le reazioni che alimentano le stelle, sulla carta dei nuclidi",
      evaluations: "Modelli R-matrix da esplorare dal vivo",
      publications: "Articoli e atti di congressi",
      cv: "Impieghi, formazione, seminari e didattica",
      software: "AZURE2, LunaSRIM e altro codice",
      notes: "La teoria R-matrix per esteso, con esempi svolti (in inglese)",
      glossary: "Le parole dell'atlante, in linguaggio semplice",
      methods: "Come si misurano le reazioni, e dove",
      timeline: "Un secolo di astrofisica nucleare",
      sProcess: "Come le stelle producono metà degli elementi pesanti",
    },
    breadcrumb: "Percorso",
    // --- rates ---
    rates: "Tassi di reazione",
    ratesDescription: "Quanto è veloce ogni reazione, e se fosse diversa",
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
    // --- rates ---
    rates: "Tassi di reazione",
  },
  // --- site (round 3) ---
  search: {
    button: "Cerca",
    title: "Cerca nel sito",
    placeholder: "Reazioni, termini, note, articoli…",
    close: "Chiudi",
    loading: "Caricamento…",
    error: "Non è stato possibile caricare l'indice di ricerca. Riprova più tardi.",
    none: "Nessun risultato per «{q}».",
    countOne: "1 risultato",
    countMany: "{n} risultati",
    suggestions: "Vai a",
    hintMove: "sposta",
    hintOpen: "apri",
    hintClose: "chiudi",
    external: "apre la pagina dell'editore",
    groups: {
      page: "Pagine",
      process: "Processi nelle stelle",
      reaction: "Reazioni",
      evaluation: "Valutazioni",
      glossary: "Glossario",
      note: "Note",
      section: "Sezioni delle note",
      research: "Attività di ricerca",
      method: "Metodi",
      facility: "Laboratori",
      publication: "Pubblicazioni",
    } as Record<string, string>,
    // --- site (round 4) ---
    types: {
      page: "Pagina",
      process: "Processo",
      reaction: "Reazione",
      evaluation: "Valutazione",
      glossary: "Glossario",
      note: "Nota",
      section: "Nota",
      research: "Ricerca",
      method: "Metodo",
      facility: "Laboratorio",
      publication: "Articolo",
    } as Record<string, string>,
    tryLabel: "Prova:",
    tryQueries: ["LUNA", "Sole", "processo s"],
    recent: "Recenti",
    popular: "Suggeriti",
    pages: "Pagine",
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
      "Valutazioni da lavori pubblicati e di prossima pubblicazione, calcolate con il vero codice AZURE2. Apri un nucleo composto, guarda il suo schema dei livelli e i dati su cui è stato fatto il fit, sposta l'energia di un livello o una larghezza ridotta e osserva come rispondono la sezione d'urto e il χ². Non serve installare nulla, e i file di input si possono scaricare ed eseguire in locale.",
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
    // --- site (round 3) ---: la legenda in parole semplici
    legendCapture: "viene catturato un protone",
    legendDecay: "decadimento β⁺: un protone diventa un neutrone",
    legendClose: "entra un protone, esce un elio: di nuovo carbonio",
    selectedPapers: "Articoli scelti",
    // --- site (round 4) ---
    rolesTitle: "Ruoli e riconoscimenti",
    rolesMore: "Tutto nel CV",
    resourcesTitle: "Risorse per la comunità",
    resourcesLead: "Aperte, datate e citabili: ciò che questo sito offre a chi lavora su queste reazioni.",
    resourceAtlas: "Atlante delle reazioni",
    resourceAtlasText: (n: number) => `${n} reazioni della combustione stellare e del Big Bang sulla carta dei nuclidi: che cosa fa ciascuna, quanto bene se ne conosce il tasso, chi l'ha misurata e come.`,
    resourceSProcess: "Il processo s",
    resourceSProcessText: "Come le stelle producono metà degli elementi più pesanti del ferro, sulla carta dal ferro al bismuto.",
    resourceSProcessMeta: "Parte dell'atlante, si cita come l'atlante",
    resourceEvaluations: "Valutazioni R-matrix",
    resourceEvaluationsText: (n: number) => `${n} valutazioni R-matrix pubblicate, calcolate con AZURE2 nel browser, con i file di input da scaricare ed eseguire in locale.`,
    resourceEvaluationsMeta: "Come citarle: nella pagina di ciascuna valutazione",
    resourceNotes: "Note",
    resourceNotesText: (n: number) => `${n} note sulla teoria R-matrix, ciascuna con un esempio svolto su una reazione reale (in inglese).`,
    resourceGlossary: "Glossario",
    resourceGlossaryText: (n: number) => `${n} termini dell'astrofisica nucleare in linguaggio semplice, in italiano e in inglese.`,
    licence: (l: string) => `licenza ${l}`,
    version: (v: string) => `versione ${v}`,
    howToCite: "Come citarlo",
    impactBefore: "L'atlante, il glossario e le valutazioni sono in ",
    impactLink: "italiano",
    impactAfter:
      " oltre che in inglese, per arrivare a studenti e pubblico e non solo agli specialisti. Tra le attività di divulgazione: Stelle sulla Terra, astrofisica nucleare per bambini con disabilità (2024), e percorsi di astrofisica nucleare per le scuole superiori (PCTO, 2021–2022): ",
    impactCv: "la divulgazione nel CV",
    outlookMore: "Prospettive →",
    // --- r9 rates ---
    resourceRates: "Esploratore dei tassi di reazione",
    resourceRatesText:
      "Le catene pp, i cicli CNO, NeNa e MgAl e il processo s. Trova il passo più lento in un ambiente stellare, cambia un tasso e guarda come rispondono le abbondanze, calcolate nel tuo browser da JINA REACLIB.",
    resourceRatesSources: "Fonti",
    resourceRatesLink: "Dove va a finire un tasso: l'esploratore dei tassi",
    // --- r7 site ---
    resourceEvaluationsSplit: (n: number, published: number) =>
      `${n} valutazioni R-matrix calcolate con AZURE2 nel browser: ${published} da articoli pubblicati, ${n - published} non ancora pubblicate. Ognuna ha i suoi file di input, da scaricare ed eseguire in locale.`,
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
      `${articles} articoli su riviste con revisione paritaria e ${proceedings} contributi ad atti di conferenze${review ? `, più ${review} inviati o in revisione` : ""}. Una linea scura segna gli articoli di cui sono primo autore; una linea chiara gli altri miei articoli principali: quelli in cui sono tra i primi autori o autore corrispondente, e quelli in cui il mio ruolo è indicato accanto agli autori. I titoli sono riportati come pubblicati.`,
    sections: { article: "Articoli di ricerca", proceedings: "Atti di conferenze" },
    // --- site ---
    profiles: "Elenchi completi e aggiornati, con le citazioni:",
    filter: "Mostra",
    all: "Tutte",
    firstAuthor: "Primo autore",
    underReview: "Inviati o in revisione",
    underReviewNote: "Inviati alle riviste e non ancora pubblicati, quindi non contati tra gli articoli con revisione paritaria qui sopra.",
    // --- site (round 2) ---
    luna: "LUNA",
    year: "Anno",
    allYears: "Tutti gli anni",
    shown: (n: number) => (n === 1 ? "1 pubblicazione mostrata" : `${n} pubblicazioni mostrate`),
    // --- site (round 3) ---
    none: "Nessuna pubblicazione corrisponde a questo filtro.",
    // --- r7 site ---
    firstAuthorSummary: (articles: number, venues: string, proceedings: number, submitted: number) =>
      `Primo autore: ${articles} ${articles === 1 ? "articolo" : "articoli"}${venues ? ` (${venues})` : ""}, ${proceedings} ${proceedings === 1 ? "contributo" : "contributi"} ad atti di conferenze${submitted ? ` e ${submitted} ${submitted === 1 ? "inviato" : "inviati"}` : ""}.`,
    firstAuthorTag: "Primo autore",
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

  // Evaluation pages: lib/i18n-eval.ts.
  ...evalIt,

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
    // --- rates ---
    exploreRates: "Esplora i tassi",
    exploreRatesOf: (name: string) => `Esplora i tassi: ${name}`,
    ratesLink: "Tassi di reazione",
    ratesCard: "Tassi di reazione, dal vivo",
    ratesCardText: "Quanto è veloce ogni reazione in una stella, e che cosa cambia quando cambia un tasso. Calcolati nel tuo browser.",
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
      tunnelShort: "galleria",
      items: [
        "In superficie i raggi cosmici producono una pioggia continua di muoni, che lasciano segnali in qualunque rivelatore di raggi γ.",
        "Circa 1400 m di roccia (3800 m di acqua equivalente) fermano tutti i muoni tranne circa uno su un milione.",
        "LUNA 400 kV: fasci di protoni e di elio per la combustione dell'idrogeno, dai primi anni 2000.",
        "LUNA-MV, 3,5 MV, al Bellotti Ion Beam Facility, inaugurato nel 2023: fasci di protoni, elio e carbonio per la combustione dell'elio e del carbonio.",
        "Il fascio colpisce un bersaglio; un rivelatore intorno conta i raggi γ o le particelle delle poche reazioni.",
      ],
      note: "Schema, non in scala.",
    },
    // --- atlas (round 3) ---
    englishSections: (sections: string[]) =>
      `${sections.length === 1 ? "Questa parte tecnica della pagina" : "Le parti tecniche di questa pagina"} (${sections.join(", ")}) ${sections.length === 1 ? "è" : "sono"} in inglese.`,
    sectionNames: { measurements: "l'elenco delle misure", details: "i dettagli", openQuestions: "le domande aperte" },
    thermalPlain: (kT: string, mk: string) => `circa ${kT} keV, l'energia di un gas a ${mk} milioni di gradi`,
    thermalBySite: "Per ambiente stellare",
    skipToMap: "Vai alla mappa",
    lunaMountain: "Gran Sasso",
    // --- atlas (round 4) ---
    plotData: "Mostra i dati",
    plotDataOf: (system: string) => `Mostra i dati della valutazione del ${system}`,
    // --- r7 site ---
    relatedEvaluation: (reaction: string, system: string) => `Valutazione ${reaction} (${system})`,
    relatedEvaluationAria: (reaction: string, system: string) =>
      `Apri la valutazione del ${system}, che descrive la ${reaction}, non questa reazione`,
    liveEvaluation: "Valutazione interattiva",
    noLiveEvaluation: "Nessuna valutazione interattiva per ora",
  },
}

export const DICTIONARIES: Record<Lang, Dictionary> = { en, it }

/** The UI strings of `lang`. */
export const dict = (lang: Lang): Dictionary => DICTIONARIES[lang]
