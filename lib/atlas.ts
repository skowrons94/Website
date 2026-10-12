/**
 * The reaction atlas, typed.
 *
 * The loading and the physics live in `lib/atlas-core.mjs`, in plain JavaScript,
 * because the prebuild scripts read the same files under bare `node`; this
 * module gives the pages the shapes and adds what only the site needs (Markdown
 * rendering, lookups, the map's data). Like `lib/content.ts`, it runs at build
 * time only.
 */

import {
  buildAtlas,
  chartCells,
  exportAtlas,
  firstSentence,
  readRaw,
  sProcessPath,
} from "@/lib/atlas-core.mjs"
import { renderMarkdown } from "@/lib/content"
import type { Lang } from "@/lib/i18n"

/* -- types ----------------------------------------------------------------- */

export type ReactionKind = "capture" | "transfer" | "fusion" | "weak" | "decay"
export type Importance = "key" | "major" | "minor"
export type Status = "well-known" | "improving" | "uncertain" | "unmeasured"
export type EventCategory = "theory" | "experiment" | "observation" | "facility" | "luna"

export interface Family {
  id: string
  name: string
  summary: string
  /** A page of its own (`/atlas/s-process`), linked instead of the map. */
  page: string | null
  /** False for a family drawn on a chart of its own, not on the map. */
  onMap: boolean
  /** Other families whose pages this one links to. */
  see: string[]
  /** Network ids, in file order. */
  networks: string[]
}

export interface Temperature {
  label: string
  /** GK. */
  T9: number
  /** The reactions of the network it applies to; all when absent. */
  reactions?: string[]
}

export interface Network {
  id: string
  family: string
  name: string
  summary: string
  temperatures: Temperature[]
  /** Reaction ids, in the order a nucleus meets them. */
  reactions: string[]
}

export interface NuclideRef {
  code: string
  A: number
  Z: number
  N: number
}

export interface Measurement {
  year: number | null
  /** Id in facilities.yaml; null for `facility: other`, named in `lab`. */
  facility: string | null
  /** Free-text laboratory, for one facilities.yaml does not describe. */
  lab: string
  method: string | null
  energy: string
  note: string
  refs: string[]
  /** Any of its references is a LUNA paper. */
  luna: boolean
}

export interface QValue {
  /** MeV, from atomic mass excesses. Includes 2mₑc² where a positron is emitted. */
  value: number
  /** A positron is emitted, and `value` counts its annihilation. */
  annihilation: boolean
  /** `value` less the annihilation energy; equal to it otherwise. */
  kinetic: number
}

export interface GamowWindow {
  network: string
  label: string
  T9: number
  /** keV. */
  E0: number
  /** keV, 1/e full width. */
  width: number
  /**
   * Endothermic reaction whose ordinary window would reach below the
   * threshold: the window is then [lo, hi] above it (keV), and E0 its maximum.
   */
  thresholdLimited?: boolean
  lo?: number
  hi?: number
  threshold?: number
}

export interface ThermalEnergy {
  network: string
  label: string
  T9: number
  /** keV. */
  kT: number
}

export interface HalfLife {
  seconds: number | null
  stable: boolean
  text: string
}

export interface Reaction {
  id: string
  /** False for an id networks.yaml lists before its file is written. */
  hasFile: boolean
  label: string
  /** The reaction in words: `nitrogen‑14 + proton → oxygen‑15 + gamma ray`. */
  plain: string
  /** YYYY-MM-DD of the last change to its file (git, else `reviewed:`), or null. */
  updated: string | null
  kind: ReactionKind
  target: string
  projectile: string
  ejectile: string
  product: string
  from: NuclideRef | null
  to: NuclideRef | null
  networks: string[]
  families: string[]
  importance: Importance
  summary: string
  role: string
  /** Markdown. */
  details: string
  status: Status | null
  statusNote: string
  /** Plain-language version of statusNote, when that one is technical. */
  statusPlain: string
  methods: string[]
  measurements: Measurement[]
  evaluations: string[]
  rmatrix: string[]
  openQuestions: string[]
  related: string[]
  q: QValue | null
  gamow: GamowWindow[]
  thermal: ThermalEnergy[]
  /** Why there is no Gamow window, where that needs saying. */
  windowNote: string | null
  /** Of the target, for decays and electron capture. */
  halfLife: HalfLife | null
  productHalfLife: HalfLife | null
  /** Every reference key the entry cites, in order of first appearance. */
  references: string[]
  luna: boolean
  lunaYears: number[]
  /** Specialist sections still in English on a translated page. */
  untranslated: ("details" | "measurements" | "openQuestions")[]
}

export interface Reference {
  key: string
  authors: string
  title: string
  journal?: string
  year: number
  doi?: string
  arxiv?: string
  url?: string
  luna?: boolean
  checked?: string
}

export interface Facility {
  id: string
  name: string
  lab?: string
  location?: string
  country?: string
  underground?: boolean
  /** Optional override of the grouping on /atlas/methods. */
  group?: "underground" | "surface" | "other"
  depth?: string
  accelerator?: string
  years?: string
  luna?: boolean
  url?: string
  summary?: string
  details?: string
  refs?: string[]
}

export interface Method {
  id: string
  name: string
  summary?: string
  details?: string
  strengths?: string | string[]
  limits?: string | string[]
  examples?: string[]
  refs?: string[]
}

export interface TimelineEvent {
  id: string
  year: number | null
  month: number | null
  url: string | null
  title: string
  text: string
  categories: string[]
  luna: boolean
  reactions: string[]
  refs: string[]
  facility: string | null
  /** Shown under the timeline's "Highlights" filter. */
  highlight: boolean
}

export interface AtlasMeta {
  title: string
  author: string
  url: string
  licence: string
  licenceUrl: string
  /** YYYY-MM-DD: the last change to the content. */
  version: string | null
  versionFromGit: boolean
}

export interface GlossaryTerm {
  id: string
  term: string
  also: string
  text: string
  see: string[]
  page: string | null
}

export interface Atlas {
  families: Family[]
  networks: Network[]
  reactions: Reaction[]
  references: Record<string, Reference>
  facilities: Facility[]
  methods: Method[]
  timeline: TimelineEvent[]
  /** False while content/atlas/timeline.yaml does not exist. */
  timelinePresent: boolean
  meta: AtlasMeta
  glossary: GlossaryTerm[]
}

/* -- loading --------------------------------------------------------------- */

// Read once per build process and language. Every atlas page asks for the
// whole database, and there are sixty of them in each language.
const cache = new Map<Lang, Atlas>()

export function getAtlas(lang: Lang = "en"): Atlas {
  let atlas = cache.get(lang)
  if (!atlas) {
    atlas = buildAtlas(readRaw(), { lang }) as unknown as Atlas
    cache.set(lang, atlas)
  }
  return atlas
}

/** The JSON export, as written to public/atlas/data.json. */
export function getAtlasExport(): unknown {
  return exportAtlas(getAtlas() as never)
}

export const getReactionIds = () => getAtlas().reactions.map((r) => r.id)

export function getReaction(id: string, lang: Lang = "en"): Reaction | undefined {
  return getAtlas(lang).reactions.find((r) => r.id === id)
}

export function getNetwork(id: string, lang: Lang = "en"): Network | undefined {
  return getAtlas(lang).networks.find((n) => n.id === id)
}

export function getFamily(id: string, lang: Lang = "en"): Family | undefined {
  return getAtlas(lang).families.find((f) => f.id === id)
}

export function getFacility(id: string, lang: Lang = "en"): Facility | undefined {
  return getAtlas(lang).facilities.find((f) => f.id === id)
}

export function getMethod(id: string, lang: Lang = "en"): Method | undefined {
  return getAtlas(lang).methods.find((m) => m.id === id)
}

/** Details are Markdown with KaTeX, rendered by the same pipeline as the notes. */
export async function renderDetails(markdown: string): Promise<string> {
  return markdown ? renderMarkdown(paragraphs(markdown)) : ""
}

// Abbreviations after which a full stop does not end a sentence.
const ABBREVIATIONS =
  /(?:\bet al|\be\.g|\bi\.e|\bcf|\bvs|\bFig|\bEq|\bRef|\bRefs|\bPhys|\bRev|\bLett|\bNucl|\bAstrophys|\bJ|\bAstron|\bEur|\bProc|\bNo|\bVol|\bSect|\bapprox|\b[A-Z])\.$/

/**
 * Break a long paragraph of specialist text into paragraphs of about three
 * sentences, so a page does not open on a wall of text. Text that already has
 * paragraphs (a blank line), lists, headings or display maths is left as the
 * author wrote it. Sentences end at `. ` followed by a capital letter or a
 * nuclide, outside parentheses and not after a known abbreviation.
 */
export function paragraphs(markdown: string, perParagraph = 3, minLength = 650): string {
  const text = markdown.trim()
  if (text.length < minLength || /\n\s*\n|^\s*([-*#>]|\d+\.)\s|\$\$/m.test(text)) return text
  const flat = text.replace(/\s*\n\s*/g, " ")
  const sentences: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i]
    if (c === "(" || c === "[") depth++
    else if ((c === ")" || c === "]") && depth > 0) depth--
    else if ((c === "." || c === "?" || c === "!") && depth === 0 && flat[i + 1] === " ") {
      const next = flat[i + 2] ?? ""
      if (!/[A-Z\u00C0-\u00DD\u2070-\u209F¹²³]/.test(next)) continue
      if (ABBREVIATIONS.test(flat.slice(Math.max(0, i - 12), i + 1))) continue
      sentences.push(flat.slice(start, i + 1).trim())
      start = i + 2
    }
  }
  sentences.push(flat.slice(start).trim())
  if (sentences.length <= perParagraph + 1) return text
  // Even groups: 7 sentences become 3 + 2 + 2 rather than 3 + 3 + 1.
  const groups = Math.ceil(sentences.length / perParagraph)
  const size = Math.ceil(sentences.length / groups)
  const out: string[] = []
  for (let i = 0; i < sentences.length; i += size) out.push(sentences.slice(i, i + size).join(" "))
  return out.join("\n\n")
}

/** The glossary, in file order. */
export const getGlossary = (lang: Lang = "en") => getAtlas(lang).glossary

/** Events that name a reaction, oldest first. */
export function eventsFor(id: string, lang: Lang = "en"): TimelineEvent[] {
  return getAtlas(lang).timeline.filter((e) => e.reactions.includes(id))
}

/* -- the map --------------------------------------------------------------- */

export interface MapReaction {
  id: string
  hasFile: boolean
  label: string
  plain: string
  kind: ReactionKind
  /** First sentence of the summary, for the tooltip. */
  line: string
  summary: string
  role: string
  from: NuclideRef
  to: NuclideRef
  networks: string[]
  families: string[]
  importance: Importance
  status: Status | null
  statusNote: string
  /** Plain-language version of statusNote, when that one is technical. */
  statusPlain: string
  q: QValue | null
  gamow: GamowWindow[]
  windowNote: string | null
  halfLife: string | null
  measurements: number
  luna: boolean
  /** The site's own R-matrix evaluations of this system. */
  rmatrix: string[]
}

export interface MapCell {
  code: string
  A: number
  Z: number
  N: number
  symbol: string
  stable: boolean
  inNetwork: boolean
  halfLife: string
}

export interface MapData {
  families: (Family & { links: { href: string; name: string }[] })[]
  networks: Pick<Network, "id" | "family" | "name" | "summary" | "reactions" | "temperatures">[]
  reactions: MapReaction[]
  cells: MapCell[]
  maxZ: number
  maxN: number
}

/**
 * Everything the client-side map needs, and nothing else: the long specialist
 * text and the bibliography stay on the server.
 */
export function getMapData(lang: Lang = "en"): MapData {
  const atlas = getAtlas(lang)
  const { cells, maxZ, maxN } = chartCells(atlas as never, undefined, lang) as {
    cells: MapCell[]
    maxZ: number
    maxN: number
  }
  // Families with a chart of their own (the s-process, iron to lead) are
  // not drawn: the map is the chart of the light nuclei. Their reactions stay
  // only where they also belong to a family on the map.
  const onMap = new Set(atlas.families.filter((f) => f.onMap).map((f) => f.id))
  const networks = atlas.networks.filter((n) => onMap.has(n.family))
  const networkIds = new Set(networks.map((n) => n.id))
  const reactions: MapReaction[] = atlas.reactions
    .filter((r) => r.from && r.to && r.networks.some((n) => networkIds.has(n)))
    .map((r) => ({
      id: r.id,
      hasFile: r.hasFile,
      label: r.label,
      plain: r.plain,
      kind: r.kind,
      line: firstSentence(r.summary),
      summary: r.summary,
      role: r.role,
      from: r.from!,
      to: r.to!,
      networks: r.networks.filter((n) => networkIds.has(n)),
      families: r.families.filter((f) => onMap.has(f)),
      importance: r.importance,
      status: r.status,
      statusNote: r.statusNote,
      statusPlain: r.statusPlain,
      q: r.q,
      gamow: r.gamow,
      windowNote: r.windowNote,
      halfLife: r.halfLife?.text ?? null,
      measurements: r.measurements.length,
      luna: r.luna,
      rmatrix: r.rmatrix,
    }))
  const families = atlas.families
    .filter((f) => f.onMap)
    .map((f) => ({
      ...f,
      links: f.see
        .map((id) => atlas.families.find((x) => x.id === id))
        .filter((x): x is Family => Boolean(x?.page))
        .map((x) => ({ href: x.page!, name: x.name })),
    }))
  return {
    families,
    networks,
    reactions,
    cells,
    maxZ,
    maxN,
  }
}

/* -- the s-process path ------------------------------------------------------ */

export interface SCell {
  code: string
  A: number
  Z: number
  N: number
  symbol: string
  stable: boolean
  /** Radioactive, but older than the Solar System would need (t½ > 10¹⁶ s). */
  primordial: boolean
  onPath: boolean
  branch: boolean
  role: "s-only" | "r-only" | "p" | null
  /** Laboratory half-life, s; null when stable. */
  seconds: number | null
  halfLife: string
}

export interface SEdge {
  from: string
  to: string
  kind: "n" | "beta-" | "ec" | "alpha"
  /** A decay arm that carries under a tenth of the decays (¹²⁸I → ¹²⁸Te). */
  minor?: boolean
  /** A decay that happens only in the hot, ionised star (¹⁶³Dy → ¹⁶³Ho). */
  stellar?: boolean
}

export interface SPath {
  nodes: NuclideRef[]
  edges: SEdge[]
  cells: SCell[]
  sOnly: string[]
  rOnly: string[]
  branch: string[]
  zMin: number
  zMax: number
  nMin: number
  nMax: number
}

const sCache = new Map<Lang, SPath>()

/** The s-process path from ⁵⁶Fe to the Pb–Bi cycle, from NUBASE2020 and AME2020. */
export function getSProcessPath(lang: Lang = "en"): SPath {
  let path = sCache.get(lang)
  if (!path) {
    path = sProcessPath(undefined, lang) as unknown as SPath
    sCache.set(lang, path)
  }
  return path
}

/* -- formatting ------------------------------------------------------------ */

// Pure helpers, in a module of their own so the client-side map can use them
// without pulling the file-reading half of the atlas into the browser bundle.
export {
  formatGamow,
  formatQ,
  formatTemperature,
  KIND_LABEL,
  kindLabel,
  STATUS_HINT,
  STATUS_LABEL,
  statusHint,
  statusLabel,
} from "@/lib/atlas-format"
