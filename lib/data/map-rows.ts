/** Index or shard rows as gap-map rows (energies in keV; kT for a Maxwellian average). */

import type { MapRow } from "@/components/data/gap-map"
import { countsForRate, rowGroup, type GapRow } from "@/lib/data/gap"
import { NOT_DATA, REPLACED } from "@/lib/data/quantity"

export function mapRows(rows: GapRow[]): MapRow[] {
  const out: MapRow[] = []
  for (const r of rows) {
    const g = rowGroup(r)
    const macs = g === "macs"
    const lo = macs ? r.k0 : r.e0
    const hi = macs ? r.k1 : r.e1
    if (lo === null || hi === null || !(lo > 0)) continue
    const counted = g === "sigma" || g === "S" || g === "partial" ? countsForRate(r) : !(r.f & (NOT_DATA | REPLACED))
    out.push({ id: r.id, g, e0: lo * 1000, e1: Math.max(hi, lo) * 1000, counted, a: r.a.replace(/\+$/, " et al."), y: r.y, n: r.n })
  }
  return out
}

