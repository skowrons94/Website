/**
 * Rows of the columnar index (public/data/exfor/index.json) as GapRow
 * objects, for a set of reactions.
 */

import type { GapRow } from "./gap.ts"
import { QUANTITY_CLASSES } from "./quantity.ts"
import type { DxIndex } from "./types.ts"

export function gapRows(index: DxIndex, reactions: number[]): GapRow[] {
  const want = new Set(reactions)
  const d = index.datasets
  const S = index.strings
  const out: GapRow[] = []
  for (let k = 0; k < d.id.length; k++) {
    if (!want.has(d.r[k])) continue
    out.push({
      id: d.id[k],
      q: QUANTITY_CLASSES[d.q[k]] ?? "other",
      qs: S.quantities[d.qs[k]] ?? "",
      e0: d.e0[k],
      e1: d.e1[k],
      k0: d.k0[k],
      k1: d.k1[k],
      n: d.n[k],
      y: d.y[k],
      a: S.authors[d.a[k]] ?? "",
      i: S.institutes[d.i[k]] ?? "",
      f: d.f[k],
      lv: d.lv[k],
      fr: d.fr[k],
    })
  }
  return out
}
