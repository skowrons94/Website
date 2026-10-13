/**
 * Rows of the columnar index (public/data/exfor/index.json) as GapRow
 * objects, for a set of reactions (lib/data/lowest.mjs indexRows).
 */

import type { GapRow } from "./gap.ts"
import { indexRows } from "./lowest.mjs"
import type { DxIndex } from "./types.ts"

export function gapRows(index: DxIndex, reactions: number[]): GapRow[] {
  return indexRows(index, reactions) as GapRow[]
}
