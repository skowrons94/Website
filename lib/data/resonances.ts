/**
 * Resonances in the window: ENSDF levels of a compound nucleus between an
 * entrance threshold S and S + E_max, and the resonance strengths ωγ EXFOR
 * holds for them (WID/STR datasets of that entrance reaction). A strength is
 * matched to a level when S + E_r (c.m.) lies within max(3 keV, 3 dE) of the
 * level energy.
 */

import { NOT_DATA, REPLACED } from "./quantity.ts"
import { flagBits } from "./shard-rows.ts"
import type { EnsdfLevel, Shard } from "./types.ts"

export interface Strength {
  id: string
  /** keV, c.m. */
  Er: number
  /** eV */
  value: number
  /** eV */
  err: number | null
  limit: string | null
  year: number | null
  author: string
}

/** Every measured ωγ of a shard (not calculated, recommended, deleted or superseded). */
export function strengthsOf(shard: Shard): Strength[] {
  const out: Strength[] = []
  for (const ds of shard.datasets) {
    const m = ds.meta
    if (m.quantity_class !== "strength" || !m.quantity.includes("STR")) continue
    if (flagBits(m.flags, m.complex, m.cm_approx) & (NOT_DATA | REPLACED)) continue
    const e = shard.entries[m.entry]
    const p = ds.points
    // a paged shard keeps the points in its pages: not read at build time
    if (!p?.value) continue
    for (let i = 0; i < p.value.length; i++) {
      const E = p.E_cm[i]
      const v = p.value[i]
      if (E === null || v === null) continue
      out.push({
        id: m.id,
        Er: E * 1000,
        value: v * 1e6,
        err: p.d_tot?.[i] != null ? (p.d_tot[i] as number) * 1e6 : null,
        limit: p.limit?.[i] ?? null,
        year: (e?.year as number | null) ?? null,
        author: e?.first_author ?? "",
      })
    }
  }
  return out
}

export interface WindowLevel {
  level: EnsdfLevel
  /** keV above the threshold (negative: subthreshold) */
  Er: number
  strengths: Strength[]
}

export function matchTolerance(level: EnsdfLevel): number {
  return Math.max(3, 3 * (level.dE_keV ?? 0))
}

/** Levels with S < E_x ≤ S + top (keV), each with its matched strengths. */
export function levelsInWindow(levels: EnsdfLevel[], S: number, top: number, strengths: Strength[]): WindowLevel[] {
  return levels
    .filter((l) => l.E_keV > S && l.E_keV <= S + top)
    .map((level) => {
      const tol = matchTolerance(level)
      return { level, Er: level.E_keV - S, strengths: strengths.filter((s) => Math.abs(S + s.Er - level.E_keV) <= tol) }
    })
}
