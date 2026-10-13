/**
 * The atlas pages' "Measurements (EXFOR)" panel, computed at build time from
 * the committed index (no index or shard is fetched by the atlas page).
 */

import type { MapRow } from "@/components/data/gap-map"
export { mapRows }
import type { PanelWindow } from "@/components/data/measurements-panel"
import { getReaction } from "@/lib/atlas"
import { atlasReactions, atlasWindows, channelOf, gapRows, genericWindows, readIndex, type Channel, type WindowMetrics } from "@/lib/data/build"
import { fill } from "@/lib/data/fill"
import { years } from "@/lib/data/format"
import { lowestMeasured, rowGroup, type GapRow } from "@/lib/data/gap"
import { mapRows } from "@/lib/data/map-rows"
import { dict, type Lang } from "@/lib/i18n"

const entryOf = (id: string) => id.split(".")[0]

export interface PanelData {
  slugs: { slug: string; key: string; n: number }[]
  rows: MapRow[]
  windows: PanelWindow[]
  lowest: { E: number; id: string; y: number | null; a: string } | null
  counts: string
  macs: { n: number; lo: number; hi: number } | null
  threshold: number | null
  neutron: boolean
  entries: string[]
  channel: Channel | null
}

function toPanel(w: WindowMetrics): PanelWindow {
  return { label: w.label, network: w.network, T9: w.T9, E0: w.E0, width: w.width, lo: w.lo, hi: w.hi, kT: w.kT, unmeasured: w.unmeasured, widths: w.widths, below: w.below }
}

function summarise(rows: GapRow[], windows: WindowMetrics[], channel: Channel | null, lang: Lang, slugs: PanelData["slugs"]): PanelData {
  const t = dict(lang).dataExpert.panel
  const drawn = mapRows(rows)
  const entries = [...new Set(rows.map((r) => entryOf(r.id)))]
  const lowest = lowestMeasured(rows)
  const macsRows = rows.filter((r) => rowGroup(r) === "macs" && r.k0 !== null)
  const missing = rows.length - drawn.length
  let counts = fill(t.counts, { n: rows.length, e: entries.length, years: years(rows.map((r) => r.y)) })
  if (missing > 0) counts += ` · ${fill(t.noEnergy, { n: missing })}`
  const neutron = Boolean(channel && (channel.z1 === 0 || channel.z2 === 0))
  return {
    slugs,
    rows: drawn,
    windows: windows.map(toPanel),
    lowest: lowest ? { ...lowest, a: lowest.a } : null,
    counts,
    macs: macsRows.length
      ? { n: macsRows.length, lo: Math.min(...macsRows.map((r) => r.k0 as number)) * 1000, hi: Math.max(...macsRows.map((r) => (r.k1 ?? r.k0) as number)) * 1000 }
      : null,
    threshold: channel && channel.threshold > 0 ? channel.threshold : null,
    neutron,
    entries,
    channel,
  }
}

/** The panel of an atlas reaction, or null when EXFOR has nothing for it. */
export function atlasPanel(atlasId: string, lang: Lang): PanelData | null {
  const r = getReaction(atlasId, lang)
  if (!r) return null
  const idx = readIndex()
  const rs = atlasReactions(atlasId)
  if (!rs.length) return null
  const rows = gapRows(idx, rs)
  if (!rows.length) return null
  const main = rs.sort((a, b) => idx.reactions.n[b] - idx.reactions.n[a])
  const slugs = main.map((k) => ({ slug: idx.reactions.slug[k], key: idx.reactions.key[k], n: idx.reactions.n[k] }))
  const channel = channelOf(idx.reactions.key[main[0]])
  return summarise(rows, atlasWindows(r, rows, channel), channel, lang, slugs)
}

/** Temperatures offered for a reaction outside the atlas. */
export const GENERIC_TEMPS = [
  { label: "T₉ = 0.015", T9: 0.015 },
  { label: "T₉ = 0.05", T9: 0.05 },
  { label: "T₉ = 0.1", T9: 0.1 },
  { label: "T₉ = 0.3", T9: 0.3 },
  { label: "T₉ = 1", T9: 1 },
  { label: "T₉ = 3", T9: 3 },
]
export const GENERIC_TEMPS_N = [
  { label: "kT = 8 keV", T9: 8 / 86.17333 },
  { label: "kT = 25 keV", T9: 25 / 86.17333 },
  { label: "kT = 30 keV", T9: 30 / 86.17333 },
  { label: "kT = 90 keV", T9: 90 / 86.17333 },
]

/** The panel of any index reaction, by slug: the atlas windows when it is an atlas reaction, else generic temperatures. */
export function slugPanel(slug: string, lang: Lang): PanelData | null {
  const idx = readIndex()
  const r = idx.reactions.slug.indexOf(slug)
  if (r < 0) return null
  const key = idx.reactions.key[r]
  const rows = gapRows(idx, [r])
  const channel = channelOf(key)
  const atlas = idx.reactions.atlas[r][0]
  const reaction = atlas ? getReaction(atlas, lang) : undefined
  const slugs = [{ slug, key, n: idx.reactions.n[r] }]
  let windows: WindowMetrics[] = reaction ? atlasWindows(reaction, rows, channel) : []
  if (!windows.length && channel) {
    const neutron = channel.z1 === 0 || channel.z2 === 0
    windows = genericWindows(channel, rows, neutron ? GENERIC_TEMPS_N : GENERIC_TEMPS)
  }
  return summarise(rows, windows, channel, lang, slugs)
}
