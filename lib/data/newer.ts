/**
 * A measurement the atlas lists below the lowest energy in EXFOR: newer
 * results reach EXFOR months or years after they are published. An atlas
 * measurement says how low it went with `lowest_keV` (centre of mass); when
 * that is below EXFOR's lowest point, the data pages say a lower measurement
 * is not yet in EXFOR, naming it. The note goes away by itself once EXFOR
 * holds the data.
 */

import { getAtlas, type Measurement } from "@/lib/atlas"
import type { Lang } from "@/lib/locale"

export interface Newer {
  /** keV, centre of mass */
  keV: number
  /** "JUNA (2022), down to 186 keV" */
  text: string
}

/** The lowest atlas measurement below `exforKeV` (null: EXFOR has nothing), or null. */
export function newerThanExfor(atlasId: string, exforKeV: number | null, lang: Lang): Newer | null {
  const atlas = getAtlas(lang)
  const r = atlas.reactions.find((x) => x.id === atlasId)
  if (!r) return null
  const below = r.measurements.filter(
    (m): m is Measurement & { lowestKeV: number } => m.lowestKeV !== null && (exforKeV === null || m.lowestKeV < exforKeV * 0.98),
  )
  if (!below.length) return null
  const m = below.reduce((a, b) => (b.lowestKeV < a.lowestKeV ? b : a))
  const where = (m.facility && atlas.facilities.find((f) => f.id === m.facility)?.name) || m.lab
  const head = [where, m.year ? `(${m.year})` : ""].filter(Boolean).join(" ")
  return { keV: m.lowestKeV, text: m.energy ? `${head}, ${m.energy}` : head }
}
