/**
 * A shard's datasets as table rows and gap-map rows, and the links between a
 * dataset and the site's evaluations ("used in evaluation X").
 */

import { countsForRate, type GapRow } from "./gap.ts"
import { FLAG_BITS, groupOf, type Group } from "./quantity.ts"
import type { Shard, ShardDataset, ShardEntry } from "./types.ts"

export interface EvalLink {
  id: string
  reactions: string[]
  entries: string[]
  subentries: string[]
  dois: string[]
}

const FRAMES = ["lab", "cm", "lab-res", "cm-res", null]

export function flagBits(flags: string[], complex: boolean, cmApprox: boolean): number {
  let f = 0
  const set = new Set(flags)
  if (complex) set.add("complex")
  if (cmApprox) set.add("cm_approx")
  FLAG_BITS.forEach((name, i) => {
    if (set.has(name)) f |= 1 << i
  })
  return f
}

export interface TableRow {
  id: string
  entry: string
  index: number
  year: number | null
  author: string
  authors: string[]
  lab: string
  labFull: string
  facility: string
  methods: string[]
  detectors: string[]
  group: Group
  qclass: string
  quantity: string
  levels: number
  e0: number | null
  e1: number | null
  k0: number | null
  k1: number | null
  n: number
  errors: string[]
  norm: number | null
  flags: string[]
  flagBits: number
  doi: string | null
  exfor: string
  counted: boolean
  decimated: { kept: number; total: number } | null
  evaluations: string[]
  plottable: boolean
  gap: GapRow
}

function shortName(name: string): string {
  return name.split(",")[0].replace(/^L(INFN)/, "$1").trim()
}

export function evaluationsOf(links: EvalLink[], key: string, ds: ShardDataset, entry: ShardEntry | undefined): string[] {
  const m = ds.meta
  const subentry = `${m.entry}.${m.subentry}`
  const dois = new Set<string>()
  const doi = (m.doi as string | null | undefined) ?? entry?.doi
  if (doi) dois.add(doi.toLowerCase())
  for (const r of entry?.refs ?? []) if (r.doi) dois.add(r.doi.toLowerCase())
  return links
    .filter((e) => e.reactions.includes(key))
    .filter((e) => e.subentries.includes(subentry) || e.entries.includes(m.entry) || e.dois.some((d) => dois.has(d)))
    .map((e) => e.id)
}

export function tableRows(shard: Shard, links: EvalLink[]): TableRow[] {
  const key = shard.reaction.key
  return shard.datasets.map((ds, index) => {
    const m = ds.meta
    const e = shard.entries[m.entry]
    const fac = e?.facility?.[0]
    const inst = (fac?.institute && e?.institutes.find((i) => i.code === fac.institute)) || e?.institutes?.[0]
    const labFull = inst?.name ?? ""
    const errs = new Set<string>()
    let norm: number | null = null
    for (const c of m.err_components) {
      if (c.where === "point") errs.add(c.kind === "digitising" ? "dig" : c.kind)
      else if ((c.kind === "sys" || c.kind === "total") && c.relative && typeof c.value === "number") norm = Math.hypot(norm ?? 0, c.value)
    }
    const f = flagBits(m.flags, m.complex, m.cm_approx)
    const gap: GapRow = {
      id: m.id,
      q: m.quantity_class,
      qs: m.quantity,
      e0: m.emin_cm,
      e1: m.emax_cm,
      k0: m.kt_min,
      k1: m.kt_max,
      n: m.npts,
      y: (m.year as number | null | undefined) ?? e?.year ?? null,
      a: (e?.first_author ?? "") + ((e?.authors?.length ?? 0) > 1 ? "+" : ""),
      i: inst?.code ?? "",
      f,
      lv: m.final_levels.length,
      fr: FRAMES.indexOf(m.E_frame),
    }
    const group = groupOf(m.quantity_class, m.final_levels.length, m.quantity)
    return {
      id: m.id,
      entry: m.entry,
      index,
      year: gap.y,
      author: e?.first_author ?? "",
      authors: e?.authors ?? [],
      lab: shortName(labFull),
      labFull,
      facility: fac ? fac.name : "",
      methods: e?.methods ?? [],
      detectors: e?.detectors ?? [],
      group,
      qclass: m.quantity_class,
      quantity: m.quantity,
      levels: m.final_levels.length,
      e0: m.emin_cm,
      e1: m.emax_cm,
      k0: m.kt_min,
      k1: m.kt_max,
      n: m.npts,
      errors: [...errs],
      norm,
      flags: m.flags,
      flagBits: f,
      doi: ((m.doi as string | null | undefined) ?? e?.doi) || null,
      exfor: e?.links?.exfor ?? `https://nds.iaea.org/EXFOR/${m.entry}`,
      counted: countsForRate(gap),
      decimated: ds.decimated ? { kept: ds.decimated.kept, total: ds.decimated.total } : null,
      evaluations: evaluationsOf(links, key, ds, e),
      plottable: (m.quantity_class === "sigma" || m.quantity_class === "S") && !m.complex && !(f & (1 << 6)),
      gap,
    }
  })
}
