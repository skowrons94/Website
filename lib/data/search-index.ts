/**
 * The search page's per-reaction summary of the EXFOR index: one record per
 * reaction, computed once (in a Web Worker) from the 90,000 index rows, so
 * every filter afterwards is a pass over 7,700 small records.
 */

import { countsForRate, rowGroup } from "./gap.ts"
import { measuredColumns, measuredMin } from "./lowest.mjs"
import { GROUPS } from "./quantity.ts"
import { parseKey, parseNuc } from "./nuclide.ts"
import { QUANTITY_CLASSES } from "./quantity.ts"
import type { DxIndex } from "./types.ts"

export interface ReactionSummary {
  key: string
  slug: string
  n: number
  atlas: boolean
  Zt: number
  At: number
  projectile: string
  process: string
  z1: number
  /** reduced mass from mass numbers (u) */
  mu: number
  /** lowest measured E_cm (keV), as on the reaction pages; null when none counts */
  lowest: number | null
  y0: number | null
  y1: number | null
  labs: number
  /** bit per quantity group (GROUPS order) */
  groups: number
}

export function summarise(index: DxIndex): ReactionSummary[] {
  const R = index.reactions
  const d = index.datasets
  const S = index.strings
  const out: ReactionSummary[] = R.key.map((key, r) => {
    const k = parseKey(key)
    const t = k ? parseNuc(k.target) : null
    const p = k ? parseNuc(k.projectile) : null
    const At = t?.A ?? 0
    const Ap = p?.A ?? 0
    return {
      key,
      slug: R.slug[r],
      n: R.n[r],
      atlas: R.atlas[r].length > 0,
      Zt: t?.Z ?? -1,
      At,
      projectile: k?.projectile ?? "",
      process: k?.process ?? "",
      z1: p?.Z ?? 0,
      mu: At && Ap ? (At * Ap) / (At + Ap) : 0,
      lowest: null,
      y0: null,
      y1: null,
      labs: 0,
      groups: 0,
    }
  })
  const labs: Set<string>[] = R.key.map(() => new Set())
  for (let i = 0; i < d.id.length; i++) {
    const s = out[d.r[i]]
    const row = {
      id: d.id[i],
      q: QUANTITY_CLASSES[d.q[i]] ?? "other",
      qs: S.quantities[d.qs[i]] ?? "",
      e0: d.e0[i],
      e1: d.e1[i],
      k0: d.k0[i],
      k1: d.k1[i],
      n: d.n[i],
      y: d.y[i],
      a: "",
      i: "",
      ...measuredColumns(d, i),
      f: d.f[i],
      lv: d.lv[i],
      fr: d.fr[i],
    }
    s.groups |= 1 << GROUPS.indexOf(rowGroup(row))
    const y = d.y[i]
    if (y) {
      s.y0 = s.y0 === null ? y : Math.min(s.y0, y)
      s.y1 = s.y1 === null ? y : Math.max(s.y1, y)
    }
    const inst = S.institutes[d.i[i]]
    if (inst) labs[d.r[i]].add(inst)
    if (countsForRate(row)) {
      const E = (measuredMin(row) as number) * 1000
      if (s.lowest === null || E < s.lowest) s.lowest = E
    }
  }
  out.forEach((s, r) => (s.labs = labs[r].size))
  return out
}

/** The Gamow peak (keV) at T₉ from mass numbers; null for a neutron. */
export function gamowPeak(s: ReactionSummary, T9: number): number | null {
  if (!s.z1 || s.Zt <= 0 || !s.mu) return null
  return 122 * Math.cbrt(s.z1 * s.z1 * s.Zt * s.Zt * s.mu * T9 * T9)
}
