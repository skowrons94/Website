/**
 * The public data explorer's strings (/data, /data/path/*), EN and IT.
 *
 * Kept out of lib/i18n.ts, like lib/i18n-eval.ts, so the explorer's client
 * components (the element search, the guided paths) can import their strings
 * without the whole site dictionary; lib/i18n.ts spreads them back into
 * `dict()` for the server components.
 *
 * Every number arrives as an argument, already formatted by lib/data/public.ts
 * from the data (the EXFOR index, the atlas, the rates' network files): none is
 * typed here. Nuclides in running text are written for the eye (¹⁴N, through
 * <Sci>); the words a screen reader hears ("nitrogen-14") come from the
 * atlas' `plain` field and `particleName`.
 */

import { itDate } from "./format.ts"
import { RULE_TEXT } from "./rule-text.ts"
import type { Lang } from "@/lib/locale"
import { elideItalian } from "../localize.mjs"

/** One step of a guided path, in words; the numbers are in the arguments. */
export interface PathWords {
  title: string
  teaser: string
  steps: { title: string; text: string; link: string }[]
  unknownTitle: string
  unknown: string[]
  share: string
}

const en = {
  dataPublic: {
    name: "Nuclear data explorer",
    metaTitle: "Nuclear data explorer",
    promise: "Every nucleus has a file. See what has been measured, and where the measurements stop.",
    description:
      "What has been measured for the reactions that power stars, and where the measurements stop: the world's nuclear-reaction data (EXFOR) and nuclear levels (ENSDF), in plain language.",
    lead: (datasets: string, entries: string, reactions: string) =>
      `${datasets} measured datasets from ${entries} experiments in the world's nuclear-data logbook, linked to the ${reactions} reactions of the atlas, to the energy levels of each nucleus and to the rates that stars run on.`,
    jump: "On this page",
    jumps: {
      known: "How well do we know it?",
      gap: "The gap",
      stories: "Stories",
      nucleus: "Inside the nucleus",
      search: "Find an element",
      paths: "Guided paths",
    },

    /* -- the four words -------------------------------------------------- */
    wordsTitle: "Four words, in plain language",
    words: [
      {
        term: "EXFOR",
        text: "The world's logbook of nuclear experiments: most published measurements, with who, where and when.",
      },
      {
        term: "ENSDF",
        text: "The reference book of each nucleus: its energy levels, how long they live, which γ-rays they emit.",
      },
      { term: "Evaluation", text: "The best curve through all the measurements, with its uncertainty band." },
      { term: "Rate", text: "How often a reaction happens in a star at a given temperature." },
    ],

    /* -- entry cards ----------------------------------------------------- */
    cards: {
      known: (n: string) => `${n} reactions on the chart of nuclides, each marked by how well its rate is known.`,
      gap: (n: string) =>
        `${n} reactions, from the energy a star uses to the lowest energy in EXFOR. The empty stretch is the story.`,
      stories: "The slowest reaction in the Sun, the step that sets the pace of the CNO cycle, and why physicists go underground.",
      nucleus: "The energy levels of a nucleus, with the narrow band a star uses drawn across them.",
      search: "Type an element, in English or Italian: its isotopes, their reactions and their rates.",
      paths: "Short walks through the site, from a question to what we still don't know.",
      go: "Go",
    },

    /* -- how well do we know it? ----------------------------------------- */
    knownTitle: "How well do we know it?",
    knownLead:
      "Each arrow is a reaction of the atlas, from the nucleus it starts on to the one it makes. Its line says how well its rate is known. Choose an arrow to open the reaction.",
    chartLabel: (n: string) =>
      `Chart of the light nuclides, protons up and neutrons across, with ${n} reactions drawn as arrows; the list below gives the same reactions by status.`,
    axisZ: "Protons (Z)",
    axisN: "Neutrons (N)",
    legendTitle: "How well the rate is known",
    statusCount: (n: number) => (n === 1 ? "1 reaction" : `${n} reactions`),
    listTitle: "The same reactions, by status",
    heavyNote: (n: string) =>
      `Plus ${n} neutron captures from iron to bismuth, on the s-process chart.`,
    heavyLink: "The s-process",
    measurements: "measurements",
    measurementsAria: (reaction: string) => `Measurements of ${reaction}`,

    /* -- the gap --------------------------------------------------------- */
    gapTitle: "The gap: what EXFOR has no measurement of yet",
    gapLead:
      "A star uses each reaction in a narrow band of energies, its Gamow window. Laboratories measure from high energies downwards, and the counting rate falls steeply as they go. For each reaction: the window a star needs and the lowest energy in EXFOR. The empty stretch between them is filled by extrapolation.",
    gapLegendWindow: "Energies the star uses (Gamow window)",
    gapLegendGap: "Never measured",
    gapLegendData: "Measured",
    gapAxis: "Centre-of-mass energy",
    gapNever: (site: string, e0: string) => `Never measured directly. Needed: about ${e0} (${site}).`,
    gapAbove: (low: string, site: string, e0: string) => `Data down to ${low}. Needed: about ${e0} (${site}).`,
    gapInside: (low: string, site: string, e0: string) =>
      `Data down to ${low}, inside the window (about ${e0}, ${site}).`,
    gapFactor: (x: string) => `${x} × the peak energy (above the window)`,
    gapReached: "Window reached",
    gapEdge: (low: string, site: string, e0: string) =>
      `Data down to ${low}: only the upper edge of the window (about ${e0}, ${site}); below it, extrapolation or indirect data.`,
    gapEdgeOnly: "Upper edge only",
    gapNewer: (text: string) => `A lower measurement is not yet in EXFOR: ${text}.`,
    gapNone: "No direct data",
    gapBy: (who: string) => `Lowest: ${who}`,
    gapUnderground: "underground (LUNA)",
    gapShowAll: (n: number) => `Show all ${n} reactions`,
    gapHide: "Show fewer",
    gapRule: RULE_TEXT.en,

    /* -- stories --------------------------------------------------------- */
    storiesTitle: "Three stories",
    stories: {
      pp: {
        title: "The slowest reaction in the Sun",
        text: (tau: string) =>
          `Two protons fuse only if one of them turns into a neutron in the instant they touch. In the rate explorer's model of the Sun's centre, a proton waits about ${tau} for that to happen. That is why the Sun is still shining. It is far too rare to measure in any laboratory: the rate comes from theory.`,
      },
      cno: {
        title: "The step that sets the CNO pace",
        text: (tau: string, low: string, e0: string) =>
          `In stars heavier than the Sun, carbon, nitrogen and oxygen help turn hydrogen into helium. The slow step is nitrogen-14 capturing a proton: in the core of a 15 M☉ star a nitrogen-14 nucleus waits about ${tau}. Measurements reach down to ${low}; the centre of the Sun needs about ${e0}.`,
      },
      underground: {
        title: "Why underground",
        text: (datasets: string, reactions: string, lowest: string) =>
          `At the energies stars use, a target may see a few reactions a day, fewer than the counts that cosmic rays leave in a detector at the surface. Under 1.4 km of rock at Gran Sasso, LUNA counts in near silence. In EXFOR, ${datasets} datasets on ${reactions} reactions of the atlas come from there, and for ${lowest} of them they are still the lowest energies ever measured.`,
      },
      atlas: "In the atlas",
      rates: "In the rate explorer",
      data: "The measurements",
      luna: "LUNA in the atlas",
      curiosity: "If it were twice as fast",
    },

    /* -- inside the nucleus ---------------------------------------------- */
    nucleusTitle: "Inside the nucleus",
    nucleusLead:
      "When nitrogen-14 captures a proton, for an instant the two are one nucleus: oxygen-15. Its energy levels are the doors the reaction can go through. A level inside the narrow band of energies a star uses, or just below it, can decide the rate.",
    nucleusCaption: (sp: string, e0: string) =>
      `Energy levels of oxygen-15 from ENSDF. The proton can enter above ${sp}, the energy needed to pull a proton out; the band shows the energies the Sun uses (about ${e0} above it).`,
    nucleusThreshold: "nitrogen-14 + proton",
    nucleusWindow: "the Sun's window",
    nucleusSub: "just below: shapes the rate",
    nucleusRes: "first door above",
    nucleusOpen: "Open the file of oxygen-15",
    nucleusOthers: "Other nuclei",
    nucleusAria: (n: number, sp: string) =>
      `Level scheme of oxygen-15: ${n} energy levels; the threshold for nitrogen-14 plus proton at ${sp}.`,

    /* -- search by element ----------------------------------------------- */
    searchTitle: "Find an element",
    searchLead: "Type the name of an element, in English or Italian, or its symbol.",
    searchLabel: "Element",
    searchPlaceholder: "sodium, sodio, Na…",
    searchExamples: "Try",
    searchNone: (q: string) => `No element of the atlas matches “${q}”.`,
    searchIsotopes: "Isotopes",
    searchReactions: "Reactions",
    searchNoReactions: "No reaction of the atlas starts or ends here.",
    searchFile: "Its file",
    searchRates: "Rates",
    searchData: "Measurements",
    searchResults: (n: number) => (n === 1 ? "1 element found" : `${n} elements found`),
    searchMore: "Search the whole site",

    /* -- guided paths ---------------------------------------------------- */
    pathsTitle: "Guided paths",
    pathsLead: "From a question to what we still don't know, a few steps at a time.",
    pathSteps: (n: number) => `${n} steps`,
    stepOf: (i: number, n: number) => `Step ${i} of ${n}`,
    next: "Next",
    back: "Back",
    restart: "Start again",
    progress: "Progress",
    goToStep: (i: number) => `Go to step ${i}`,
    allPaths: "All guided paths",
    movedToAtlas: "Stories and guided paths:",
    movedToAtlasLink: "in the atlas →",
    shareTitle: "Share it",
    share: "Share",
    copy: "Copy link",
    copied: "Link copied",
    caveat: "One-zone model of a star's centre at constant temperature and density. Real stars adjust.",

    /* -- attribution ----------------------------------------------------- */
    sourcesTitle: "Where the data come from",
    ensdfLine: (date: string) => `Levels: ENSDF (NNDC for the NSDD network), archive of ${date}.`,
    physicists: "For physicists",
    physicistsSnapshot: (commit: string) => `EXFOR master files at commit ${commit}.`,
    physicistsCite: "Cite",
    physicistsPipeline: "How the data were processed",
    citeEach: "and each dataset's own paper.",

    /* -- the guided paths: words; the numbers are in `c` (lib/data/paths.ts) -- */
    paths: {
      sun: (c: Record<string, string>): PathWords => ({
        title: "Why does the Sun shine slowly?",
        teaser: "From the slowest reaction in the Sun to what would change if it were faster.",
        steps: [
          {
            title: "It starts with two protons",
            text: "Almost every helium nucleus the Sun makes starts with two protons fusing into deuterium. For that, one of the two must turn into a neutron in the instant they touch, through the weak force. It almost never happens.",
            link: "The reaction in the atlas",
          },
          {
            title: "Nobody has ever measured it",
            text: `The Sun runs this reaction at about ${c.e0}. No experiment has measured it at any energy: EXFOR, the world's logbook of nuclear experiments, has no dataset for it. Its rate comes from theory, and the neutrinos it gives off, counted on Earth, agree with it. Later in the chain, the fusion of two helium-3 nuclei has been measured down to ${c.he3low} (${c.he3who}), inside the Sun's window.`,
            link: "See the gap for every reaction",
          },
          {
            title: `A proton waits ${c.tau}`,
            text: `In the rate explorer's model of the Sun's centre (${c.T} million kelvin, ${c.rho} g/cm³), a proton waits on average ${c.tau} before it fuses with another.${c.bottleneck ? ` It is the slowest step on the way to helium. The next-slowest is a ${c.nextName} nucleus, which waits about ${c.next}, all its reactions together; the rate explorer lists each reaction on its own.` : ""} Slow fuel, long life.`,
            link: "Open the rate explorer",
          },
          {
            title: "And if it were twice as fast?",
            text: c.curiosity,
            link: "Open the curiosity",
          },
        ],
        unknownTitle: "What we still don't know",
        unknown: [
          "The rate of proton + proton rests on theory alone. No experiment can reach it, so the check is indirect, through the Sun's neutrinos.",
          "How much carbon, nitrogen and oxygen the centre of the Sun holds is still debated, and with it how much of the Sun's energy comes from the CNO cycle.",
          "The explorer is a model of the centre alone, at a fixed temperature. A real Sun adjusts its temperature to its rates.",
        ],
        share: `A proton in the centre of the Sun waits about ${c.tau} before it fuses with another. That is why the Sun shines slowly.`,
      }),
      sodium: (c: Record<string, string>): PathWords => ({
        title: "Where does the sodium in salt come from?",
        teaser: "From a proton meeting neon-22 to the sodium we see change from star to star.",
        steps: [
          {
            title: "Two ways to make sodium",
            text: `Most of the sodium in your salt was made in massive stars, when two carbon nuclei fuse (${c.carbon}). A smaller share comes from hydrogen burning, when neon-22 captures a proton. We follow this second way: it is why the amount of sodium changes from star to star in old star clusters.`,
            link: "Neon-22 + proton in the atlas",
          },
          {
            title: "Who measured it, and how low",
            text: `EXFOR lists ${c.datasets} datasets for neon-22 + proton, from ${c.y0} to ${c.y1}; ${c.luna} of them come from LUNA, under the Gran Sasso mountain. The lowest energy measured is ${c.low} (${c.who}). The star needs about ${c.e0} (${c.site}).${c.inside ? " The measurements have reached the window." : c.edge ? " The measurements reach only the upper edge of the window; the rest is extrapolated." : " The last stretch is extrapolated."}`,
            link: "See every measurement",
          },
          {
            title: "Inside sodium-23",
            text: `For a moment the proton and the neon-22 become one nucleus, sodium-23. They can enter it above ${c.sp}, the energy that binds a proton in sodium-23, and each level of sodium-23 above that is a door. ${c.levels}`,
            link: "Open the file of sodium-23",
          },
          {
            title: "And if it were twice as fast?",
            text: c.curiosity,
            link: "Open the curiosity",
          },
        ],
        unknownTitle: "What we still don't know",
        unknown: [
          "A resonance inside the window is known only as an upper limit: its strength has never been measured.",
          "Whether the sodium that changes from star to star in old clusters comes from AGB stars, from massive stars or from both is still debated.",
          "The explorer's AGB envelope is one zone at a fixed temperature. A real envelope mixes and cools.",
        ],
        share: c.curiositySentence,
      }),
      iron: (c: Record<string, string>): PathWords => ({
        title: "From iron to lead",
        teaser: "How stars build heavy elements one neutron at a time, and where the neutrons come from.",
        steps: [
          {
            title: "One neutron at a time",
            text: "About half the nuclei heavier than iron are made by slow neutron captures in red giants: a nucleus captures a neutron, waits, often decays, and captures again, step by step from iron to lead.",
            link: "The s-process in the atlas",
          },
          {
            title: "Where the neutrons come from",
            text: `In red giants most neutrons come from carbon-13 + helium-4 → oxygen-16 + a neutron. EXFOR lists ${c.datasets} datasets for it, from ${c.y0} to ${c.y1}. Deep underground at Gran Sasso, LUNA measured it down to 230 keV (Ciani et al., 2021), the upper edge of the star's window; the star needs about ${c.e0} (${c.site}), and below 230 keV the rate is still extrapolated.`,
            link: "See every measurement",
          },
          {
            title: "The best curve",
            text: `An evaluation draws the best curve through all those measurements, with its uncertainty band, and turns it into a rate a star model can use. The atlas lists ${c.evaluations} evaluations of this reaction.`,
            link: "The evaluations, in the atlas",
          },
          {
            title: "And if it were twice as fast?",
            text: c.curiosity,
            link: "Open the curiosity",
          },
        ],
        unknownTitle: "What we still don't know",
        unknown: [
          `The second neutron source, neon-22 + helium-4, has been seen directly only down to about 700 keV, where it has a resonance; below that there are only upper limits, and a thermal pulse needs about ${c.ne22e0}.`,
          "How much carbon-13 a star's pocket holds is set by mixing inside the star, which models cannot yet predict.",
          "At some branch points of the path the nucleus is radioactive, and its neutron capture is hard or impossible to measure.",
        ],
        share: c.curiositySentence,
      }),
    },
    curiosityCaveatNote: "From the rate explorer:",
    evaluationLink: (system: string) => `The R-matrix evaluation of ${system}`,
  },
}

export type DataPublicDict = (typeof en)["dataPublic"]

const it: typeof en = {
  dataPublic: {
    name: "Esploratore dei dati nucleari",
    metaTitle: "Esploratore dei dati nucleari",
    promise: "Ogni nucleo ha una scheda. Guarda che cosa è stato misurato, e dove si fermano le misure.",
    description:
      "Che cosa è stato misurato per le reazioni che fanno brillare le stelle, e dove si fermano le misure: i dati mondiali sulle reazioni nucleari (EXFOR) e sui livelli dei nuclei (ENSDF), in parole semplici.",
    lead: (datasets: string, entries: string, reactions: string) =>
      `${datasets} serie di dati da ${entries} esperimenti del registro mondiale dei dati nucleari, collegate alle ${reactions} reazioni dell'atlante, ai livelli di energia di ogni nucleo e ai tassi con cui bruciano le stelle.`,
    jump: "In questa pagina",
    jumps: {
      known: "Quanto la conosciamo?",
      gap: "Il vuoto",
      stories: "Storie",
      nucleus: "Dentro il nucleo",
      search: "Cerca un elemento",
      paths: "Percorsi guidati",
    },

    wordsTitle: "Quattro termini, in parole semplici",
    words: [
      {
        term: "EXFOR",
        text: "Il registro mondiale degli esperimenti nucleari: la maggior parte delle misure pubblicate, con chi, dove e quando.",
      },
      {
        term: "ENSDF",
        text: "La carta d'identità di ogni nucleo: i suoi livelli di energia, quanto vivono, quali raggi γ emettono.",
      },
      { term: "Valutazione", text: "La curva che meglio riproduce tutte le misure, con la sua fascia d'incertezza." },
      { term: "Tasso", text: "Quante volte avviene una reazione in una stella, a una data temperatura." },
    ],

    cards: {
      known: (n: string) => `${n} reazioni sulla carta dei nuclidi, ognuna segnata secondo quanto è noto il suo tasso.`,
      gap: (n: string) =>
        `${n} reazioni, dall'energia che usa una stella alla più bassa presente in EXFOR. Il punto è proprio quel tratto vuoto.`,
      stories: "La reazione più lenta del Sole, il passo che detta il ritmo del ciclo CNO, e perché i fisici vanno sotto terra.",
      nucleus: "I livelli di energia di un nucleo, con sopra la stretta fascia di energie che usa una stella.",
      search: "Scrivi un elemento, in italiano o in inglese: i suoi isotopi, le loro reazioni e i loro tassi.",
      paths: "Brevi passeggiate nel sito, da una domanda a ciò che ancora non sappiamo.",
      go: "Vai",
    },

    knownTitle: "Quanto la conosciamo?",
    knownLead:
      "Ogni freccia è una reazione dell'atlante, dal nucleo da cui parte a quello che produce. Il tipo di linea indica quanto è noto il suo tasso. Scegli una freccia per aprire la reazione.",
    chartLabel: (n: string) =>
      `Carta dei nuclidi leggeri, protoni in verticale e neutroni in orizzontale, con ${n} reazioni disegnate come frecce; l'elenco qui sotto riporta le stesse reazioni divise per stato.`,
    axisZ: "Protoni (Z)",
    axisN: "Neutroni (N)",
    legendTitle: "Quanto bene è noto il tasso",
    statusCount: (n: number) => (n === 1 ? "1 reazione" : `${n} reazioni`),
    listTitle: "Le stesse reazioni, per stato",
    heavyNote: (n: string) => `Più ${n} catture di neutroni dal ferro al bismuto, sulla carta del processo s.`,
    heavyLink: "Il processo s",
    measurements: "misure",
    measurementsAria: (reaction: string) => `Misure della ${reaction}`,

    gapTitle: "Il vuoto: dove EXFOR non ha ancora misure",
    gapLead:
      "Una stella usa ogni reazione in una stretta banda di energie, la sua finestra di Gamow. I laboratori misurano dalle energie alte verso il basso, e il numero di conteggi crolla man mano che scendono. Per ogni reazione: la finestra che serve alla stella e l'energia più bassa in EXFOR. Il tratto vuoto in mezzo si riempie con un'estrapolazione.",
    gapLegendWindow: "Energie che usa la stella (finestra di Gamow)",
    gapLegendGap: "Mai misurato",
    gapLegendData: "Misurato",
    gapAxis: "Energia nel centro di massa",
    gapNever: (site: string, e0: string) => `Mai misurata direttamente. Serve: circa ${e0} (${site}).`,
    gapAbove: (low: string, site: string, e0: string) => `Dati fino a ${low}. Serve: circa ${e0} (${site}).`,
    gapInside: (low: string, site: string, e0: string) =>
      `Dati fino a ${low}, dentro la finestra (circa ${e0}, ${site}).`,
    gapFactor: (x: string) => `${x} volte l'energia del picco (sopra la finestra)`,
    gapReached: "Finestra raggiunta",
    gapEdge: (low: string, site: string, e0: string) =>
      `Dati fino a ${low}: solo il bordo superiore della finestra (circa ${e0}, ${site}); più in basso, estrapolazione o dati indiretti.`,
    gapEdgeOnly: "Solo il bordo superiore",
    gapNewer: (text: string) => `Una misura più bassa non è ancora in EXFOR: ${text}.`,
    gapNone: "Nessun dato diretto",
    gapBy: (who: string) => `La più bassa: ${who}`,
    gapUnderground: "sotto terra (LUNA)",
    gapShowAll: (n: number) => `Mostra tutte le ${n} reazioni`,
    gapHide: "Mostra meno",
    gapRule: RULE_TEXT.it,

    storiesTitle: "Tre storie",
    stories: {
      pp: {
        title: "La reazione più lenta del Sole",
        text: (tau: string) =>
          `Due protoni si fondono solo se uno dei due si trasforma in neutrone nell'istante in cui si toccano. Nel modello del centro del Sole dell'esploratore dei tassi, un protone aspetta circa ${tau} prima che accada. È per questo che il Sole brilla ancora. È troppo rara per misurarla in qualunque laboratorio: il suo tasso viene dalla teoria.`,
      },
      cno: {
        title: "Il passo che detta il ritmo del ciclo CNO",
        text: (tau: string, low: string, e0: string) =>
          `Nelle stelle più pesanti del Sole, carbonio, azoto e ossigeno aiutano a trasformare l'idrogeno in elio. Il passo lento è l'azoto-14 che cattura un protone: nel cuore di una stella di 15 M☉ un nucleo di azoto-14 aspetta circa ${tau}. Le misure arrivano fino a ${low}; al centro del Sole servono circa ${e0}.`,
      },
      underground: {
        title: "Perché sotto terra",
        text: (datasets: string, reactions: string, lowest: string) =>
          `Alle energie che usano le stelle, un bersaglio può vedere poche reazioni al giorno, meno dei conteggi che i raggi cosmici lasciano in un rivelatore in superficie. Sotto 1,4 km di roccia, al Gran Sasso, LUNA misura quasi nel silenzio. In EXFOR, ${datasets} serie di dati su ${reactions} reazioni dell'atlante vengono da lì, e per ${lowest} di queste sono ancora le energie più basse mai misurate.`,
      },
      atlas: "Nell'atlante",
      rates: "Nell'esploratore dei tassi",
      data: "Le misure",
      luna: "LUNA nell'atlante",
      curiosity: "Se fosse due volte più veloce",
    },

    nucleusTitle: "Dentro il nucleo",
    nucleusLead:
      "Quando l'azoto-14 cattura un protone, per un istante i due sono un solo nucleo: l'ossigeno-15. I suoi livelli di energia sono le porte da cui la reazione può passare. Un livello dentro la stretta banda di energie che usa una stella, o appena sotto, può deciderne il tasso.",
    nucleusCaption: (sp: string, e0: string) =>
      `Livelli di energia dell'ossigeno-15 da ENSDF. Il protone può entrare sopra ${sp}, l'energia che serve per strappare un protone al nucleo; la fascia indica le energie che usa il Sole (circa ${e0} più in alto).`,
    nucleusThreshold: "azoto-14 + protone",
    nucleusWindow: "finestra del Sole",
    nucleusSub: "appena sotto: conta per il tasso",
    nucleusRes: "prima porta sopra",
    nucleusOpen: "Apri la scheda dell'ossigeno-15",
    nucleusOthers: "Altri nuclei",
    nucleusAria: (n: number, sp: string) =>
      `Schema dei livelli dell'ossigeno-15: ${n} livelli di energia; la soglia per azoto-14 più protone a ${sp}.`,

    searchTitle: "Cerca un elemento",
    searchLead: "Scrivi il nome di un elemento, in italiano o in inglese, o il suo simbolo.",
    searchLabel: "Elemento",
    searchPlaceholder: "sodio, sodium, Na…",
    searchExamples: "Prova",
    searchNone: (q: string) => `Nessun elemento dell'atlante corrisponde a «${q}».`,
    searchIsotopes: "Isotopi",
    searchReactions: "Reazioni",
    searchNoReactions: "Nessuna reazione dell'atlante parte o arriva qui.",
    searchFile: "La sua scheda",
    searchRates: "Tassi",
    searchData: "Misure",
    searchResults: (n: number) => (n === 1 ? "1 elemento trovato" : `${n} elementi trovati`),
    searchMore: "Cerca in tutto il sito",

    pathsTitle: "Percorsi guidati",
    pathsLead: "Da una domanda a ciò che ancora non sappiamo, pochi passi alla volta.",
    pathSteps: (n: number) => `${n} passi`,
    stepOf: (i: number, n: number) => `Passo ${i} di ${n}`,
    next: "Avanti",
    back: "Indietro",
    restart: "Ricomincia",
    progress: "Avanzamento",
    goToStep: (i: number) => `Vai al passo ${i}`,
    allPaths: "Tutti i percorsi guidati",
    movedToAtlas: "Storie e percorsi guidati:",
    movedToAtlasLink: "nell'atlante →",
    shareTitle: "Condividilo",
    share: "Condividi",
    copy: "Copia il link",
    copied: "Link copiato",
    caveat: "Modello a zona singola del centro di una stella, a temperatura e densità costanti. Una stella vera si riassesta.",

    sourcesTitle: "Da dove vengono i dati",
    ensdfLine: (date: string) => `Livelli: ENSDF (NNDC per la rete NSDD), archivio ${itDate("di", date)}.`,
    physicists: "Per i fisici",
    physicistsSnapshot: (commit: string) => `File master di EXFOR al commit ${commit}.`,
    physicistsCite: "Come citare",
    physicistsPipeline: "Come sono stati elaborati i dati",
    citeEach: "e l'articolo di ogni serie di dati.",

    paths: {
      sun: (c: Record<string, string>): PathWords => ({
        title: "Perché il Sole brilla lentamente?",
        teaser: "Dalla reazione più lenta del Sole a che cosa cambierebbe se fosse più veloce.",
        steps: [
          {
            title: "Tutto comincia da due protoni",
            text: "Quasi ogni nucleo di elio prodotto dal Sole comincia con due protoni che si fondono in deuterio. Perché accada, uno dei due deve trasformarsi in neutrone nell'istante in cui si toccano, attraverso la forza debole. Non succede quasi mai.",
            link: "La reazione nell'atlante",
          },
          {
            title: "Nessuno l'ha mai misurata",
            text: `Il Sole fa avvenire questa reazione intorno a ${c.e0}. Nessun esperimento l'ha misurata, a nessuna energia: EXFOR, il registro mondiale degli esperimenti nucleari, non ne contiene nemmeno una serie di dati. Il suo tasso viene dalla teoria, e i neutrini che emette, contati sulla Terra, le danno ragione. Più avanti nella catena, la fusione di due nuclei di elio-3 è stata misurata fino a ${c.he3low} (${c.he3who}), dentro la finestra del Sole.`,
            link: "Guarda il vuoto per ogni reazione",
          },
          {
            title: `Un protone aspetta ${c.tau}`,
            text: `Nel modello del centro del Sole dell'esploratore dei tassi (${c.T} milioni di kelvin, ${c.rho} g/cm³), un protone aspetta in media ${c.tau} prima di fondersi con un altro.${c.bottleneck ? ` È il passo più lento sulla strada verso l'elio. Il secondo più lento è quello di un nucleo di ${c.nextName}, che, sommando tutte le sue reazioni, aspetta circa ${c.next}; l'esploratore dei tassi elenca ogni reazione per conto suo.` : ""} Combustibile lento, vita lunga.`,
            link: "Apri l'esploratore dei tassi",
          },
          {
            title: "E se fosse due volte più veloce?",
            text: c.curiosity,
            link: "Apri la curiosità",
          },
        ],
        unknownTitle: "Che cosa ancora non sappiamo",
        unknown: [
          "Il tasso di protone + protone si basa solo sulla teoria. Nessun esperimento può raggiungerlo, quindi la verifica è indiretta, attraverso i neutrini del Sole.",
          "Quanto carbonio, azoto e ossigeno ci sia al centro del Sole è ancora discusso, e con questo quanta parte della sua energia venga dal ciclo CNO.",
          "L'esploratore è un modello del solo centro, a temperatura fissa. Un Sole vero adatta la sua temperatura ai suoi tassi.",
        ],
        share: `Al centro del Sole un protone aspetta circa ${c.tau} prima di fondersi con un altro. Per questo il Sole brilla lentamente.`,
      }),
      sodium: (c: Record<string, string>): PathWords => ({
        title: "Da dove viene il sodio del sale?",
        teaser: "Da un protone che incontra il neon-22 al sodio che vediamo cambiare da stella a stella.",
        steps: [
          {
            title: "Due modi di fare il sodio",
            text: `Quasi tutto il sodio del tuo sale è nato nelle stelle massicce, quando due nuclei di carbonio si fondono (${c.carbon}). Una parte più piccola viene dalla combustione dell'idrogeno, quando il neon-22 cattura un protone. Seguiamo questa seconda strada: spiega perché la quantità di sodio cambia da stella a stella negli ammassi stellari antichi.`,
            link: "Neon-22 + protone nell'atlante",
          },
          {
            title: "Chi l'ha misurata, e fin dove",
            text: `EXFOR elenca ${c.datasets} serie di dati per neon-22 + protone, dal ${c.y0} al ${c.y1}; ${c.luna} vengono da LUNA, sotto il Gran Sasso. L'energia più bassa misurata è ${c.low} (${c.who}). Alla stella servono circa ${c.e0} (${c.site}).${c.inside ? " Le misure hanno raggiunto la finestra." : c.edge ? " Le misure raggiungono solo il bordo superiore della finestra; il resto è estrapolato." : " L'ultimo tratto è estrapolato."}`,
            link: "Guarda tutte le misure",
          },
          {
            title: "Dentro il sodio-23",
            text: `Per un istante il protone e il neon-22 diventano un solo nucleo, il sodio-23. Il protone può entrare a energie superiori a ${c.sp}, l'energia che lega un protone nel sodio-23, e ogni livello più in alto è una porta. ${c.levels}`,
            link: "Apri la scheda del sodio-23",
          },
          {
            title: "E se fosse due volte più veloce?",
            text: c.curiosity,
            link: "Apri la curiosità",
          },
        ],
        unknownTitle: "Che cosa ancora non sappiamo",
        unknown: [
          "Di una risonanza dentro la finestra si conosce solo un limite superiore: la sua intensità non è mai stata misurata.",
          "Se il sodio che cambia da stella a stella negli ammassi antichi venga dalle stelle AGB, dalle stelle massicce o da entrambe è ancora discusso.",
          "L'inviluppo AGB dell'esploratore è una sola zona a temperatura fissa. Un inviluppo vero si rimescola e si raffredda.",
        ],
        share: c.curiositySentence,
      }),
      iron: (c: Record<string, string>): PathWords => ({
        title: "Dal ferro al piombo",
        teaser: "Come le stelle costruiscono gli elementi pesanti un neutrone alla volta, e da dove vengono i neutroni.",
        steps: [
          {
            title: "Un neutrone alla volta",
            text: "Circa metà dei nuclei più pesanti del ferro nasce da catture lente di neutroni nelle giganti rosse: un nucleo cattura un neutrone, aspetta, spesso decade, e ne cattura un altro, passo dopo passo dal ferro al piombo.",
            link: "Il processo s nell'atlante",
          },
          {
            title: "Da dove vengono i neutroni",
            text: `Nelle giganti rosse quasi tutti i neutroni vengono da carbonio-13 + elio-4 → ossigeno-16 + un neutrone. EXFOR elenca ${c.datasets} serie di dati per questa reazione, dal ${c.y0} al ${c.y1}. Sotto il Gran Sasso, LUNA l'ha misurata fino a 230 keV (Ciani et al., 2021), il bordo alto della finestra della stella; alla stella servono circa ${c.e0} (${c.site}), e sotto i 230 keV il tasso è ancora estrapolato.`,
            link: "Guarda tutte le misure",
          },
          {
            title: "La curva migliore",
            text: `Una valutazione traccia la curva che meglio riproduce tutte queste misure, con la sua fascia d'incertezza, e la trasforma in un tasso che un modello di stella può usare. L'atlante elenca ${c.evaluations} valutazioni di questa reazione.`,
            link: "Le valutazioni, nell'atlante",
          },
          {
            title: "E se fosse due volte più veloce?",
            text: c.curiosity,
            link: "Apri la curiosità",
          },
        ],
        unknownTitle: "Che cosa ancora non sappiamo",
        unknown: [
          `La seconda sorgente di neutroni, neon-22 + elio-4, è stata osservata direttamente solo fino a circa 700 keV, dove ha una risonanza; più in basso ci sono solo limiti superiori, e un impulso termico richiede circa ${c.ne22e0}.`,
          "Quanto carbonio-13 contenga la tasca di una stella dipende dal rimescolamento al suo interno, che i modelli non sanno ancora prevedere.",
          "In alcuni punti di diramazione del percorso il nucleo è radioattivo, e la sua cattura di neutroni è difficile o impossibile da misurare.",
        ],
        share: c.curiositySentence,
      }),
    },
    curiosityCaveatNote: "Dall'esploratore dei tassi:",
    evaluationLink: (system: string) => elideItalian(`La valutazione R-matrix del ${system}`),
  },
}

export const dataPublicEn = en
export const dataPublicIt = it
export const dataPublicDict = (lang: Lang): DataPublicDict => (lang === "it" ? it : en).dataPublic
