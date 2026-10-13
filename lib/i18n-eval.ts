/**
 * The evaluation pages' UI strings (the list of evaluations, the workspace,
 * the level diagram), EN and IT.
 *
 * Kept out of lib/i18n.ts so the evaluation pages' client components can
 * import their strings without the whole site dictionary: they are the only
 * client code that needs them (lib/i18n.ts spreads them back into `dict()`
 * for server components).
 */

import type { Lang } from "@/lib/locale"
import { elideItalian } from "@/lib/localize.mjs"

/** `1.5` → `1,5` in Italian (lib/i18n's `decimal`, without the dictionaries). */
export function decimal(text: string | number, lang: Lang): string {
  return lang === "en" ? String(text) : String(text).replace(/(\d)\.(\d)/g, "$1,$2")
}

const sup = (id: string) => id.replace(/^(\d+)/, (m) => m.replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]))

const en = {
  /* -- evaluations -------------------------------------------------------- */
  evaluations: {
    metaTitle: "Evaluations",
    description:
      "Interactive R-matrix evaluations running on AZURE2: level schemes, fitted data and extrapolations.",
    eyebrow: "Running on AZURE2",
    title: "R-matrix evaluations",
    introBefore:
      "Each of these is a multi-level, multi-channel R-matrix fit. Open one to see its level scheme and the data it was fitted to, then move a level energy or a reduced width and see the cross section and the χ² change — the calculation is AZURE2 itself, not an approximation. Every evaluation can also be downloaded as an ",
    introAfter: " project and run locally.",
    loading: "Loading evaluations…",
    loadFailed: "The evaluations could not be loaded.",
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
    unpublished: "Not yet published",
    noReference: "Not yet published",
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
      `${active} data segment${active === 1 ? "" : "s"} from ${files} data file${files === 1 ? "" : "s"}: ${parts}. The Plot & data tab overlays the model on the measurements, lets you move any free level, and lists every segment with its normalization and χ² in its table.`,
    observableCount: (n: number, code: string) => {
      const names: Record<string, [string, string]> = {
        "angle-integrated": ["angle-integrated cross section", "angle-integrated cross sections"],
        differential: ["differential cross section", "differential cross sections"],
        "differential-cm": ["differential cross section (c.m. angle)", "differential cross sections (c.m. angles)"],
        "total-capture": ["total-capture cross section", "total-capture cross sections"],
        "phase-shift": ["phase shift", "phase shifts"],
        "angle-integrated-E1": ["E1 cross section", "E1 cross sections"],
        "angle-integrated-E2": ["E2 cross section", "E2 cross sections"],
        "analyzing-power": ["analyzing power", "analyzing powers"],
      }
      const [one, many] = names[code] ?? [code, code]
      return `${n} ${n === 1 ? one : many}`
    },
    howToCite: "How to cite",
    aboutEvaluation: "About this evaluation",
    aboutEvaluationHint: "What was fitted, energies, engine and how to cite",
    citeWithPaper: "Please cite the paper this evaluation belongs to:",
    citeNoPaper:
      "This evaluation is not yet published. Please cite this page, with its version and the date you used it.",
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
    // --- evaluations (round 4) ---
    whatIsThis: "What am I looking at?",
    citeWhatNoPaper:
      "Cite AZURE2 for the code, and this page (with its version) if you use the interactive calculation or its numbers. The measured data belong to their authors: cite the original papers listed in the table of the Plot & data tab.",
  },

  /* -- the evaluation workspace ------------------------------------------- */
  workspace: {
    starting: (id: string) => `Starting the calculation for ${sup(id)}…`,
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
    calculatingExtrap: "The curves beyond the data take longer than the plot: for some models up to a minute.",
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
    selectRow: "Choose a row to show its channels.",
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
    selectDataset: "Choose a dataset to plot.",
    selectExtrap: "Choose an extrapolation to plot.",
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
      "χ² is the data term at the shipped parameters and normalizations, computed exactly as AZURE2 does (the normalization scales data and error together). Large values are reported as they are.",
    penaltyText: (v: string) => ` AZURE2's normalization prior adds ${v}.`,
    normSummary: (free: number, constrained: number, fixed: number) =>
      `Normalizations: ${free} free in the fit (${constrained} with a stated systematic uncertainty, ${free - constrained} unconstrained), ${fixed} fixed.`,
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
      `Residuals, (normalized data − model) / uncertainty, against centre-of-mass energy: ${names}.`,
    ratioRutherford: "σ / σ Rutherford",
    rutherfordNote:
      "Elastic dσ/dΩ divided by the Rutherford cross section (Mott for identical particles), in the centre of mass; other segments are shown as cross sections.",
    fineLoading: "Calculating the model on a fine energy grid… until then, the line through the points is shown.",
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
    keyText: "Points: measured data × their normalization n, with ±1σ error bars. Solid line: the R-matrix model.",
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
    tableDrawer: (n: number) => `Table of all ${n} datasets: references, normalizations, χ²`,
    plotColumn: "Plot",
    plotThis: (name: string) => `Plot ${name}`,
    copyLink: "Copy link",
    copied: "Link copied",
    loadingView: "Loading the view…",
    gamowTemperature: "Gamow window",
    gamowOff: "none",
    gamowBand: (T9: string) => `Gamow window, T₉ = ${T9}`,
    gamowNote: (T9: string, kelvin: string, E0: string, width: string, pair: string) =>
      `Shaded: the Gamow window of ${pair} at T₉ = ${T9} (${kelvin}), centred at E₀ = ${E0} with width Δ = ${width} — the energies at which this reaction mostly happens in a star at that temperature.`,
    glossaryLink: "More in the glossary",
    kelvin: (value: string, billion: boolean, one: boolean) => `${value} ${billion ? "billion" : "million"} kelvin`,
    atlasTemperatures: "Where it burns (reaction atlas)",
    otherTemperatures: "Other temperatures",
    angularCurve: (energy: string, from: string, to: string) => `E = ${energy} MeV · θ ${from}–${to}°`,
    atAngle: (angle: string) => `θ = ${angle}°`,
    sMinLabel: "S at the lowest energy",
    noGamowScattering: "No Gamow window: elastic scattering is not a reaction that burns anything in a star.",
    editLevel: "Adjust its parameters →",
    // --- evaluations (round 4) ---
    modelLine: "R-matrix model",
    publishedFit: "published fit",
    // --- evaluations (round 5: the model beyond the data) ---
    modelBeyond: "model beyond the data",
    extend: "Extend beyond data",
    extendHint: "Draw the model below and above the measured energies (dashed), and widen the energy axis to show it",
    keyBeyond: "Dashed: the same model beyond the energies of the shown data, where it is an extrapolation.",
    fineUpdating: "Updating the smooth curve for your change… until then, the previous one is shown faded.",
    resetAll: "Reset all",
    resetAllHint: "Back to the evaluation's own parameters (every level)",
    view: "View",
    chi2Plain:
      "χ²/N near 1 means the line passes through the points within their error bars; above 1 it misses some of them by more, often because of normalizations and systematic effects that the error bars leave out.",
    chi2NormNote: (allOne: boolean) =>
      `This page does not refit the normalizations: they stay at the values stored in the file${allOne ? " (n = 1 for every dataset)" : ""}, and the χ² shown counts only each point's own uncertainty, not a dataset's overall scale uncertainty.`,
    chi2AllSummary: "χ² for all the data in the fit",
    chi2AllText: (v: string) => `χ²/N = ${v} over every active dataset (per dataset in the table below).`,
    elapsed: (s: string) => `${s} s`,
    lastTook: (s: string) => `last ${s} s`,
    nDatasets: (n: number) => `${n} datasets`,
    sharedNote: "Panels of one kind share their energy axis; each has its own vertical scale.",
  },

  // --- levels (round 3) ---
  levels: {
    title: "Level diagram",
    description:
      "Levels by excitation energy, one column per spin-parity. Dashed lines are particle thresholds; the right-hand axis gives the centre-of-mass energy in the entrance channel.",
    descriptionList:
      "Levels by excitation energy, with their spin-parity and total width Γ. Dashed entries are particle thresholds.",
    excitation: "Excitation energy",
    cm: (pair: string) => `in ${pair}`,
    aria: (n: number) => `Energy-level diagram with ${n} levels. Use the arrow keys to move between levels and Enter to select one.`,
    status: { free: "energy fitted", partial: "widths fitted", fixed: "fixed" } as Record<"free" | "partial" | "fixed", string>,
    levelAria: (jpi: string, energy: string, status: string, widths: string) =>
      `${jpi} level at ${energy} MeV, ${status}${widths ? `, ${widths}` : ""}`,
    thresholdAria: (pair: string, energy: string) => `${pair} threshold at ${energy} MeV`,
    background: (n: number, energy: string) => `${n} background pole${n === 1 ? "" : "s"} at ${energy} MeV`,
    backgroundShort: (n: number, energy: string) => `${n} background poles · ${energy} MeV`,
    legendEnergyFree: "energy fitted",
    legendWidthsFree: "widths/ANCs fitted",
    legendFixed: "fixed",
    legendAnc: "ANC (below threshold)",
    legendThreshold: "particle threshold",
    legendWidth: "±Γ/2",
    legendData: "fitted data",
    zoomHint: "Drag along the energy axis to zoom.",
    zoomData: "Zoom to data",
    zoomReset: "Whole scheme",
    zoomed: (lo: string, hi: string) => `Showing ${lo}–${hi} MeV`,
    moreAbove: (n: number) => `${n} more above`,
    moreBelow: (n: number) => `${n} more below`,
    crowded: "Crowded: drag along the axis to zoom in.",
    prompt: "Choose a level to see its widths and channels.",
    width: "Γ",
    noWidth: "no partial widths (bound in every particle channel)",
    anc: "ANC",
    clearSelection: "Clear selection",
    // sliders
    flipSign: (name: string, negative: boolean) =>
      `${name}: sign ${negative ? "negative" : "positive"}; press to make it ${negative ? "positive" : "negative"}`,
    valueInput: (name: string, unit: string) => `${name}, exact value in ${unit}`,
    logSlider: "log scale",
    deltaChi2: (v: string) => `Δχ² ${v}`,
    notANumber: "Enter a number, e.g. 34.5 or 1.2e-3",
    levelInDiagram: "Selected in the diagram",
    // --- evaluations (round 4) ---
    groundState: "ground state",
    // Plain-language legend, each entry linked to the glossary where there is one.
    keyEnergyFree: "energy fitted",
    keyWidthsFree: "widths fitted, energy fixed",
    keyFixed: "fixed",
    plainThreshold: "dashed line: a particle threshold — above it the nucleus can break up into that pair",
    plainWidth: "shaded band: the level's width Γ (how short-lived it is), ±Γ/2",
    plainWideWidth: (w: string) => `arrow, and “Γ ${w}” beside the energy: a width too large to shade`,
    plainData: "blue rail on the right-hand axis: the energies the fitted data cover",
    plainAnc: "open circle: a bound state, fitted through its ANC",
    plainBar: "small bar: how the level decays, the share of each channel (Γc/Γ)",
    plainEffective: "dashed level: an effective pole — far above the fitted data, or doubling another of its spin-parity; the data do not measure it as a state",
    glossary: "glossary",
    wideWidth: (w: string) => `Γ ${w}`,
    noteAbove: (max: string) =>
      `Effective pole: it lies far above the fitted data (which reach ${max} MeV), so it shapes the fit from outside the measured range, as a background pole; its parameters are not those of a state measured here.`,
    noteOverlap: (jpi: string, energy: string) =>
      `Effective pole: it overlaps the other ${jpi} pole at ${energy} MeV within their widths. Two poles of one spin-parity this close act together (a broad state and its background), so neither alone is a state of the nucleus.`,
    notePhoton: (particle: string, photon: string) =>
      `Its particle width (${particle}) is under 1% of its γ width (${photon}), so the bar shows γ almost alone: in the particle channels this pole has very little effect.`,
    ancIn: (channel: string) => `ANC in ${channel}`,
    effective: "effective pole",
    filters: "Filter levels",
    filtersSummary: (shown: number, total: number) => `${shown} of ${total} levels shown`,
    backgroundRow: (n: number, energy: string) => `${n} background poles at ${energy} MeV (fixed, far above the data)`,
    columnWidth: "Γ (keV)",
    above: (pair: string, energy: string) => `${pair} threshold · ${energy} MeV`,
    listLegend: "● energy fitted · ○ widths fitted · grey: fixed",
  },

  // --- r7 evalui ---
  live: {
    stages: {
      open: "Getting the model ready…",
      edit: "Recalculating…",
      data: "Calculating the curves…",
      fine: "Calculating the smooth curve…",
      extrap: "Calculating the extrapolations…",
    } as Record<"open" | "edit" | "data" | "fine" | "extrap", string>,
    stagePreparing: "Getting the model ready…",
    firstChange: "First change on this model: it is still being prepared. Later changes are much quicker.",
    seconds: (n: string) => `${n} s`,
    minutes: (n: string) => `${n} min`,
    elapsedLong: (t: string) => `${t} so far`,
    left: (t: string) => `about ${t} left`,
    longer: "taking longer than usual",
    busy: (n: string) => `The server is busy. Trying again in ${n} s…`,
    extrapStale: "Faded: the extrapolations from before your change, shown until the new ones are ready.",
    previewNote: "The published fit is shown while the calculation starts; a change you make now is sent as soon as it is ready.",
    skipToLevels: "Skip to the levels",
    skipToPlot: "Back to the plot",
    nFreeParams: (n: number) => `${n} free`,
    publishedFitLegend: "published fit (before your change)",
    muchWorse: (x: string) => `much worse, ×${x}`,
    muchBetter: (x: string) => `much better, ÷${x}`,
    chi2Huge:
      "Large here because these data have very small error bars: a small shift of a narrow resonance moves the line off many points at once.",
    gridTitle: "Energy × angle grids",
    gridText: (n: number) =>
      `${n === 1 ? "This curve is" : "These curves are"} a differential cross section on a grid of energies and angles: shown on request, as a few angles or as a map.`,
    gridShow: "Show",
    gridHide: "Hide",
    gridAngles: "Angles",
    gridMap: "Map",
    gridMapAria: (name: string) => `Map of ${name}: energy across, angle up, colour the cross section (logarithmic).`,
    gridLoading: "Calculating this grid…",
    gridSummary: (ne: number, na: number, e0: string, e1: string, a0: string, a1: string) =>
      `${ne} energies (${e0}–${e1} MeV) × ${na} angles (${a0}–${a1}°)`,
    finalState: (label: string) => `to ${label}`,
    groundState: "ground state",
    background: "Background (far above the data)",
    showMore: (n: number) => `Show ${n} more`,
    showFewer: "Show fewer",
    opensIn: (s: string) => `opens in about ${s} s`,
  },

  // --- r9 eval ---
  r9: {
    almost: "almost done",
    worse: "much worse",
    better: "much better",
    sharing: "the server is preparing other models too",
    noSpare: "First change on this model: it is still being prepared. Later changes are much quicker.",
    publishedShown: "Published curves shown, faded; yours appear when ready.",
    gridSummaryOne: (ne: number, e0: string, e1: string, a: string) => `${ne} energies (${e0}–${e1} MeV) at ${a}°`,
  },

  // --- r11 eval ---
  r11: {
    stillWorking: "still working",
    serverBusy: "Server busy: other models are being prepared too",
    coldOpen: "No copy of this model was ready in advance: starting one takes a little longer.",
    firstCurve: "First smooth curve on this model: it is still being prepared. Later ones are much quicker.",
    firstExtrap: "First extrapolations on this model: they are still being prepared. Later ones are much quicker.",
    curveSoon: (s: string) => `Smooth curve ready in about ${s} s; until then, the line through the points is shown.`,
    curveAlmost: "Smooth curve almost ready; until then, the line through the points is shown.",
    chi2Settled: (v: string) => `χ²/N of the shown datasets: ${v}.`,
    chi2AllDiffers: "on all data:",
    chi2Published: "the published fit; see why it is above 1",
    sLowest: "S at the lowest energy",
  },
  // --- r13 final ---
  r13: {
    detailsColumn: "Details",
  },
}

export type EvalDictionary = typeof en

const it: EvalDictionary = {
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
    // "dell'⁸Be", "del ¹⁸F": the article follows the mass number as it is read
    // aloud (otto, diciotto), via vowelMassNumber in lib/localize.mjs.
    pageTitle: (nuclide: string) => elideItalian(`Valutazione R-matrix del ${nuclide}`),
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
    unpublished: "Non ancora pubblicata",
    noReference: "Non ancora pubblicata",
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
    aboutEvaluation: "Informazioni su questa valutazione",
    aboutEvaluationHint: "Che cosa è stato adattato, energie, codice e come citare",
    citeWithPaper: "Cita l'articolo a cui appartiene questa valutazione:",
    citeNoPaper:
      "Questa valutazione non è ancora pubblicata. Cita questa pagina, con la sua versione e la data in cui l'hai consultata.",
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
    // --- evaluations (round 4) ---
    whatIsThis: "Che cosa sto guardando?",
    citeWhatNoPaper:
      "Cita AZURE2 per il codice e questa pagina (con la sua versione) se usi il calcolo interattivo o i suoi numeri. I dati misurati appartengono ai loro autori: cita gli articoli originali elencati nella tabella della scheda Grafico e dati.",
  },

  /* -- the evaluation workspace ------------------------------------------- */
  workspace: {
    starting: (id: string) => `Avvio del calcolo per ${sup(id)}…`,
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
    tabs: { scheme: "Schema dei livelli", data: "Dati", plot: "Grafico e dati", extrap: "Estrapolazioni", extrapShort: "Oltre i dati" },
    calculatingData: "Calcolo dei segmenti di dati…",
    calculatingExtrap: "Le curve oltre i dati richiedono più tempo del grafico: per alcuni modelli fino a un minuto.",
    levelScheme: "Schema dei livelli",
    schemeSummary: (levels: number, pairs: number, free: number) =>
      `${levels} livelli, ${pairs} coppie di particelle · ${free} parametri R-matrix liberi`,
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
      "Il χ² è il contributo dei dati, calcolato con i parametri e le normalizzazioni del modello pubblicato come fa AZURE2 (la normalizzazione scala insieme dati ed errori). I valori grandi sono riportati così come sono.",
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
    keyText: "Punti: dati misurati × la loro normalizzazione n, con barre d'errore di ±1σ. Linea continua: il modello R-matrix.",
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
    gamowNote: (T9: string, kelvin: string, E0: string, width: string, pair: string) =>
      `In grigio: la finestra di Gamow di ${pair} a T₉ = ${T9} (${kelvin}), centrata in E₀ = ${E0} e larga Δ = ${width}: le energie a cui questa reazione avviene per lo più in una stella a quella temperatura.`,
    glossaryLink: "Approfondisci nel glossario",
    kelvin: (value: string, billion: boolean, one: boolean) =>
      `${value} ${billion ? (one ? "miliardo" : "miliardi") : one ? "milione" : "milioni"} di kelvin`,
    atlasTemperatures: "Dove avviene (atlante delle reazioni)",
    otherTemperatures: "Altre temperature",
    angularCurve: (energy: string, from: string, to: string) => `E = ${energy} MeV · θ ${from}–${to}°`,
    atAngle: (angle: string) => `θ = ${angle}°`,
    sMinLabel: "S all'energia più bassa",
    noGamowScattering: "Nessuna finestra di Gamow: la diffusione elastica non trasforma nulla in una stella, non è una reazione di combustione.",
    editLevel: "Regola i suoi parametri →",
    // --- evaluations (round 4) ---
    modelLine: "modello R-matrix",
    publishedFit: "fit pubblicato",
    // --- evaluations (round 5: the model beyond the data) ---
    modelBeyond: "modello oltre i dati",
    extend: "Estendi oltre i dati",
    extendHint: "Traccia il modello anche sotto e sopra le energie misurate (tratteggiato) e allarga l'asse delle energie per mostrarlo",
    keyBeyond: "Tratteggio: lo stesso modello oltre le energie dei dati mostrati, dove è un'estrapolazione.",
    fineUpdating: "Aggiornamento della curva per la tua modifica… nel frattempo la precedente è mostrata più chiara.",
    resetAll: "Ripristina tutto",
    resetAllHint: "Torna ai parametri della valutazione (tutti i livelli)",
    view: "Vista",
    chi2Plain:
      "χ²/N vicino a 1 vuol dire che la linea passa per i punti entro le barre d'errore; sopra 1 la linea si allontana di più dai punti, spesso per normalizzazioni ed effetti sistematici che le barre d'errore non includono.",
    chi2NormNote: (allOne: boolean) =>
      `Questa pagina non riadatta le normalizzazioni: restano ai valori memorizzati nel file${allOne ? " (n = 1 per ogni insieme di dati)" : ""}, e il χ² mostrato conta solo l'incertezza di ciascun punto, non quella sulla scala complessiva di un insieme di dati.`,
    chi2AllSummary: "χ² per tutti i dati del fit",
    chi2AllText: (v: string) => `χ²/N = ${v} su tutti gli insiemi di dati attivi (per ciascuno nella tabella qui sotto).`,
    elapsed: (s: string) => `${s} s`,
    lastTook: (s: string) => `l'ultimo ${s} s`,
    nDatasets: (n: number) => `${n} insiemi di dati`,
    sharedNote: "I pannelli dello stesso tipo condividono l'asse dell'energia; ciascuno ha la sua scala verticale.",
  },

  // --- levels (round 3) ---
  levels: {
    title: "Diagramma dei livelli",
    description:
      "Livelli per energia di eccitazione, una colonna per spin-parità. Le linee tratteggiate sono le soglie di particella; l'asse a destra dà l'energia nel centro di massa del canale d'ingresso.",
    descriptionList:
      "Livelli per energia di eccitazione, con spin-parità e larghezza totale Γ. Le voci tratteggiate sono le soglie di particella.",
    excitation: "Energia di eccitazione",
    cm: (pair: string) => `in ${pair}`,
    aria: (n: number) => `Diagramma dei livelli con ${n} livelli. Usa le frecce per passare da un livello all'altro e Invio per selezionarlo.`,
    status: { free: "energia variabile nel fit", partial: "solo larghezze variabili", fixed: "fisso" } as Record<"free" | "partial" | "fixed", string>,
    levelAria: (jpi: string, energy: string, status: string, widths: string) =>
      `livello ${jpi} a ${energy} MeV, ${status}${widths ? `, ${widths}` : ""}`,
    thresholdAria: (pair: string, energy: string) => `soglia ${pair} a ${energy} MeV`,
    background: (n: number, energy: string) => `${n} pol${n === 1 ? "o" : "i"} di fondo a ${energy} MeV`,
    backgroundShort: (n: number, energy: string) => `${n} poli di fondo · ${energy} MeV`,
    legendEnergyFree: "energia variabile nel fit",
    legendWidthsFree: "larghezze/ANC libere nel fit",
    legendFixed: "fisso",
    legendAnc: "ANC (sotto soglia)",
    legendThreshold: "soglia di particella",
    legendWidth: "±Γ/2",
    legendData: "dati del fit",
    zoomHint: "Trascina lungo l'asse delle energie per ingrandire.",
    zoomData: "Zoom sui dati",
    zoomReset: "Schema intero",
    zoomed: (lo: string, hi: string) => `Intervallo ${lo}–${hi} MeV`,
    moreAbove: (n: number) => `altri ${n} sopra`,
    moreBelow: (n: number) => `altri ${n} sotto`,
    crowded: "Zona affollata: trascina lungo l'asse per ingrandire.",
    prompt: "Seleziona un livello per vederne larghezze e canali.",
    width: "Γ",
    noWidth: "nessuna larghezza parziale (legato in tutti i canali di particella)",
    anc: "ANC",
    clearSelection: "Deseleziona",
    // sliders
    flipSign: (name: string, negative: boolean) =>
      `${name}: segno ${negative ? "negativo" : "positivo"}; premi per renderlo ${negative ? "positivo" : "negativo"}`,
    valueInput: (name: string, unit: string) => `${name}, valore esatto in ${unit}`,
    logSlider: "scala log",
    deltaChi2: (v: string) => `Δχ² ${v}`,
    notANumber: "Inserisci un numero, ad es. 34,5 o 1,2e-3",
    levelInDiagram: "Selezionato nel diagramma",
    // --- evaluations (round 4) ---
    groundState: "stato fondamentale",
    keyEnergyFree: "energia variabile nel fit",
    keyWidthsFree: "solo larghezze variabili, energia fissa",
    keyFixed: "fisso",
    plainThreshold: "linea tratteggiata: una soglia di particella — sopra di essa il nucleo può spezzarsi in quella coppia",
    plainWidth: "banda ombreggiata: la larghezza Γ del livello (più è larga, meno vive il livello), ±Γ/2",
    plainWideWidth: (w: string) => `freccia, e “Γ ${w}” accanto all'energia: una larghezza troppo grande da ombreggiare`,
    plainData: "barra blu sull'asse di destra: le energie coperte dai dati del fit",
    plainAnc: "cerchio vuoto: uno stato legato, libero nel fit tramite il suo ANC",
    plainBar: "barretta: come decade il livello, la quota di ciascun canale (Γc/Γ)",
    plainEffective: "livello tratteggiato: un polo efficace — molto sopra i dati del fit, o doppione di un altro della stessa spin-parità; i dati non lo misurano come stato",
    glossary: "glossario",
    wideWidth: (w: string) => `Γ ${w}`,
    noteAbove: (max: string) =>
      `Polo efficace: sta molto sopra i dati del fit (che arrivano a ${max} MeV), quindi agisce sul fit dall'esterno dell'intervallo misurato, come un polo di fondo; i suoi parametri non sono quelli di uno stato misurato qui.`,
    noteOverlap: (jpi: string, energy: string) =>
      `Polo efficace: si sovrappone, entro le larghezze, all'altro polo ${jpi} a ${energy} MeV. Due poli della stessa spin-parità così vicini agiscono insieme (uno stato largo e il suo fondo), quindi nessuno dei due da solo è uno stato del nucleo.`,
    notePhoton: (particle: string, photon: string) =>
      `La sua larghezza di particella (${particle}) è meno dell'1% della larghezza γ (${photon}), quindi la barretta mostra quasi solo γ: nei canali di particella questo polo ha un effetto minimo.`,
    ancIn: (channel: string) => `ANC in ${channel}`,
    effective: "polo efficace",
    filters: "Filtra i livelli",
    filtersSummary: (shown: number, total: number) => `${shown} livelli su ${total} mostrati`,
    backgroundRow: (n: number, energy: string) => `${n} poli di fondo a ${energy} MeV (fissi, molto sopra i dati)`,
    columnWidth: "Γ (keV)",
    above: (pair: string, energy: string) => `soglia ${pair} · ${energy} MeV`,
    listLegend: "● energia variabile nel fit · ○ solo larghezze variabili · grigio: fisso",
  },

  // --- r7 evalui ---
  live: {
    stages: {
      open: "Preparazione del modello…",
      edit: "Ricalcolo…",
      data: "Calcolo delle curve…",
      fine: "Calcolo della curva continua…",
      extrap: "Calcolo delle estrapolazioni…",
    },
    stagePreparing: "Preparazione del modello…",
    firstChange: "Prima modifica su questo modello: il server lo sta ancora preparando. Le modifiche successive sono molto più rapide.",
    seconds: (n: string) => `${n} s`,
    minutes: (n: string) => `${n} min`,
    elapsedLong: (t: string) => `${t} finora`,
    left: (t: string) => `ancora circa ${t}`,
    longer: "più del solito",
    busy: (n: string) => `Il server è occupato. Nuovo tentativo tra ${n} s…`,
    extrapStale: "Nel frattempo sono mostrate, sbiadite, le estrapolazioni precedenti alla tua modifica.",
    previewNote: "Mentre il calcolo si avvia è mostrato il fit pubblicato; una modifica fatta ora verrà applicata appena il calcolo sarà pronto.",
    skipToLevels: "Vai ai livelli",
    skipToPlot: "Torna al grafico",
    nFreeParams: (n: number) => (n === 1 ? "1 parametro libero" : `${n} parametri liberi`),
    publishedFitLegend: "fit pubblicato (prima della tua modifica)",
    muchWorse: (x: string) => `molto peggio, ×${x}`,
    muchBetter: (x: string) => `molto meglio, ÷${x}`,
    chi2Huge:
      "Qui è grande perché questi dati hanno barre d'errore piccolissime: spostare di poco una risonanza stretta allontana la linea da molti punti insieme.",
    gridTitle: "Griglie energia × angolo",
    gridText: (n: number) =>
      `${n === 1 ? "Questa curva è" : "Queste curve sono"} una sezione d'urto differenziale su una griglia di energie e angoli: mostrate a richiesta, per alcuni angoli o come mappa.`,
    gridShow: "Mostra",
    gridHide: "Nascondi",
    gridAngles: "Angoli",
    gridMap: "Mappa",
    gridMapAria: (name: string) => `Mappa di ${name}: energia in orizzontale, angolo in verticale, colore la sezione d'urto (logaritmica).`,
    gridLoading: "Calcolo di questa griglia…",
    gridSummary: (ne: number, na: number, e0: string, e1: string, a0: string, a1: string) =>
      `${ne} energie (${e0}–${e1} MeV) × ${na} angoli (${a0}–${a1}°)`,
    finalState: (label: string) => `verso ${label}`,
    groundState: "stato fondamentale",
    background: "Fondo (molto sopra i dati)",
    showMore: (n: number) => `Mostra altri ${n}`,
    showFewer: "Mostra meno",
    opensIn: (s: string) => `si apre in circa ${s} s`,
  },

  // --- r9 eval ---
  r9: {
    almost: "quasi finito",
    worse: "molto peggio",
    better: "molto meglio",
    sharing: "il server sta preparando anche altri modelli",
    noSpare: "Prima modifica su questo modello: il server lo sta ancora preparando. Le modifiche successive sono molto più rapide.",
    publishedShown: "Sono mostrate, sbiadite, le curve pubblicate; le tue compaiono appena pronte.",
    gridSummaryOne: (ne: number, e0: string, e1: string, a: string) => `${ne} energie (${e0}–${e1} MeV) a ${a}°`,
  },

  // --- r11 eval ---
  r11: {
    stillWorking: "calcolo ancora in corso",
    serverBusy: "Server occupato: si stanno preparando anche altri modelli",
    coldOpen: "Nessuna copia di questo modello era pronta in anticipo: avviarne una richiede un po' più di tempo.",
    firstCurve: "Prima curva continua su questo modello: è ancora in preparazione. Le successive sono molto più rapide.",
    firstExtrap: "Prime estrapolazioni su questo modello: sono ancora in preparazione. Le successive sono molto più rapide.",
    curveSoon: (s: string) => `Curva continua pronta tra circa ${s} s; nel frattempo è mostrata la linea che unisce i punti.`,
    curveAlmost: "Curva continua quasi pronta; nel frattempo è mostrata la linea che unisce i punti.",
    chi2Settled: (v: string) => `χ²/N degli insiemi di dati mostrati: ${v}.`,
    chi2AllDiffers: "su tutti i dati:",
    chi2Published: "il fit pubblicato: perché è sopra 1",
    sLowest: "S all'energia più bassa",
  },
  // --- r13 final ---
  r13: {
    detailsColumn: "Dettagli",
  },
}

export const evalEn = en
export const evalIt = it
export const evalDict = (lang: Lang): EvalDictionary => (lang === "it" ? it : en)
