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
} from "@/lib/atlas-core.mjs"
import { renderMarkdown } from "@/lib/content"

/* -- types ----------------------------------------------------------------- */

export type ReactionKind = "capture" | "transfer" | "fusion" | "weak" | "decay"
export type Importance = "key" | "major" | "minor"
export type Status = "well-known" | "improving" | "uncertain" | "unmeasured"
export type EventCategory = "theory" | "experiment" | "observation" | "facility" | "luna"

export interface Family {
  id: string
  name: string
  summary: string
  /** Network ids, in file order. */
  networks: string[]
}

export interface Temperature {
  label: string
  /** GK. */
  T9: number
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
  methods: string[]
  measurements: Measurement[]
  evaluations: string[]
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
}

/* -- loading --------------------------------------------------------------- */

// Read once per build process. Every atlas page asks for the whole database,
// and there are sixty of them.
let cache: Atlas | null = null

export function getAtlas(): Atlas {
  if (!cache) cache = buildAtlas(readRaw()) as unknown as Atlas
  return cache
}

/** The JSON export, as written to public/atlas/data.json. */
export function getAtlasExport(): unknown {
  return exportAtlas(getAtlas() as never)
}

export const getReactionIds = () => getAtlas().reactions.map((r) => r.id)

export function getReaction(id: string): Reaction | undefined {
  return getAtlas().reactions.find((r) => r.id === id)
}

export function getNetwork(id: string): Network | undefined {
  return getAtlas().networks.find((n) => n.id === id)
}

export function getFamily(id: string): Family | undefined {
  return getAtlas().families.find((f) => f.id === id)
}

export function getFacility(id: string): Facility | undefined {
  return getAtlas().facilities.find((f) => f.id === id)
}

export function getMethod(id: string): Method | undefined {
  return getAtlas().methods.find((m) => m.id === id)
}

/** Details are Markdown with KaTeX, rendered by the same pipeline as the notes. */
export async function renderDetails(markdown: string): Promise<string> {
  return markdown ? renderMarkdown(markdown) : ""
}

/** Events that name a reaction, oldest first. */
export function eventsFor(id: string): TimelineEvent[] {
  return getAtlas().timeline.filter((e) => e.reactions.includes(id))
}

/* -- the map --------------------------------------------------------------- */

export interface MapReaction {
  id: string
  hasFile: boolean
  label: string
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
  q: QValue | null
  gamow: GamowWindow[]
  windowNote: string | null
  halfLife: string | null
  measurements: number
  luna: boolean
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
  families: Family[]
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
export function getMapData(): MapData {
  const atlas = getAtlas()
  const { cells, maxZ, maxN } = chartCells(atlas as never) as {
    cells: MapCell[]
    maxZ: number
    maxN: number
  }
  const reactions: MapReaction[] = atlas.reactions
    .filter((r) => r.from && r.to && r.networks.length > 0)
    .map((r) => ({
      id: r.id,
      hasFile: r.hasFile,
      label: r.label,
      kind: r.kind,
      line: firstSentence(r.summary),
      summary: r.summary,
      role: r.role,
      from: r.from!,
      to: r.to!,
      networks: r.networks,
      families: r.families,
      importance: r.importance,
      status: r.status,
      statusNote: r.statusNote,
      q: r.q,
      gamow: r.gamow,
      windowNote: r.windowNote,
      halfLife: r.halfLife?.text ?? null,
      measurements: r.measurements.length,
      luna: r.luna,
    }))
  return {
    families: atlas.families,
    networks: atlas.networks,
    reactions,
    cells,
    maxZ,
    maxN,
  }
}

/* -- formatting ------------------------------------------------------------ */

// Pure helpers, in a module of their own so the client-side map can use them
// without pulling the file-reading half of the atlas into the browser bundle.
export {
  formatGamow,
  formatQ,
  formatTemperature,
  KIND_LABEL,
  STATUS_HINT,
  STATUS_LABEL,
} from "@/lib/atlas-format"
