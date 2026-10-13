/**
 * "What changes most", read off two burns: the rows (final abundance with the
 * changed rates over without), split into what a reader expects and what is
 * news. A changed reaction always moves its own target, the nucleus it burns
 * (its self-effect); the knock-on effects on every other nucleus are the
 * interesting part, and in a cycle in balance they can all be tiny. The
 * reactions to suggest instead come from the precomputed sensitivity tables
 * (scripts/rates/sensitivity.mjs). Pure: the explorers and the tests share it.
 */

import type { DecayMap } from "./analysis.ts"
import type { Network } from "./schema.ts"

export interface ChangeRow {
  name: string
  label: string
  ratio: number
}

/** A change a reader can see: 1% either way. */
export const VISIBLE = 0.01
const LN_VISIBLE = Math.log1p(VISIBLE) - 1e-12

/** |ln ratio| ≥ ln 1.01 (or a nucleus that appears or vanishes). */
export function visible(ratio: number): boolean {
  return !Number.isFinite(Math.log(ratio)) || Math.abs(Math.log(ratio)) >= LN_VISIBLE
}

const byMagnitude = (a: ChangeRow, b: ChangeRow) => Math.abs(Math.log10(b.ratio)) - Math.abs(Math.log10(a.ratio))

/** The light explorers' rows: every nucleus that moved beyond the solver's noise (0.1%). */
export function lightChangeRows(network: Network, base: ArrayLike<number>, mod: ArrayLike<number>): ChangeRow[] {
  const rows: ChangeRow[] = []
  network.nuclei.forEach((n, i) => {
    const a = base[i]
    const b = mod[i]
    if (Math.max(a, b) < 1e-20) return
    const ratio = a > 0 ? b / a : b > 0 ? Infinity : 1
    if (Math.abs(Math.log10(ratio)) < 4.3e-4) return
    rows.push({ name: n.name, label: n.label, ratio })
  })
  return rows.sort(byMagnitude)
}

/** The s-process rows, after the decays: the heavy nuclei (Z ≥ 26) or the light ones. */
export function sprocessChangeRows(
  network: Network,
  baseDec: ArrayLike<number>,
  modDec: ArrayLike<number>,
  decays: DecayMap,
  heavy: boolean,
): ChangeRow[] {
  const nm = network.ui.not_modelled ?? {}
  const rows: ChangeRow[] = []
  network.nuclei.forEach((n, i) => {
    const a = baseDec[i]
    const b = modDec[i]
    if (decays.branches.has(i) || Math.max(a, b) < 1e-14 || n.Z === 0 || n.name in nm) return
    if (heavy !== n.Z >= 26) return
    const ratio = a > 0 ? b / a : Infinity
    if (Math.abs(Math.log10(ratio)) < 1e-3) return
    rows.push({ name: n.name, label: n.label, ratio })
  })
  return rows.sort(byMagnitude)
}

/** The nuclei the changed reactions burn: their targets (a decay's is the nucleus that decays). */
export function changedTargets(network: Network, scale: Record<string, number>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [id, f] of Object.entries(scale)) {
    if (f === 1) continue
    const r = network.reactions.find((x) => x.id === id)
    const n = r ? network.nuclei[r.target] : undefined
    if (n && !out.has(n.name)) out.set(n.name, id)
  }
  return out
}

export interface SplitChanges {
  /** the changed reactions' own targets that moved (the expected part) */
  self: ChangeRow[]
  /** every other nucleus that moved by 1% or more (the bars) */
  knock: ChangeRow[]
  /** every other nucleus that moved by less than 1% (a fold) */
  small: ChangeRow[]
  /**
   * what to say: "knock" when there are bars to draw, "self" when only the
   * targets moved visibly (a cycle in balance), "none" when nothing did
   */
  state: "knock" | "self" | "none"
}

export function splitChanges(rows: ChangeRow[], targets: { has(name: string): boolean }): SplitChanges {
  const self: ChangeRow[] = []
  const knock: ChangeRow[] = []
  const small: ChangeRow[] = []
  for (const r of rows) {
    if (targets.has(r.name)) self.push(r)
    else if (visible(r.ratio)) knock.push(r)
    else small.push(r)
  }
  const state = knock.length ? "knock" : self.some((r) => visible(r.ratio)) ? "self" : "none"
  return { self, knock, small, state }
}

// -- suggestions, from the sensitivity tables -------------------------------------

/** One reaction's reach at ×2: how many other nuclei move by 1% or more, and the largest |s|. */
export interface Reach {
  id: string
  n: number
  max: number
}

/** The sensitivity table of a network, as scripts/rates/sensitivity.mjs writes it. */
export interface SensitivityTable {
  factor: number
  scenarios: Record<string, { nuclei: string[]; reactions: string[]; s: number[][] }>
}

/**
 * Each scenario's reactions ranked by their knock-on reach: the number of
 * nuclei other than the reaction's own target that a doubling moves by 1%
 * or more, then the largest such response. Only reactions that reach at
 * least one; at most `keep`.
 */
export function rankReactions(network: Network, table: SensitivityTable, keep = 8): Record<string, Reach[]> {
  const cut = Math.log1p(VISIBLE) / Math.log(table.factor)
  const out: Record<string, Reach[]> = {}
  for (const s of network.scenarios) {
    const t = table.scenarios[s.id]
    if (!t) continue
    const list: Reach[] = []
    t.reactions.forEach((id, k) => {
      const r = network.reactions.find((x) => x.id === id)
      const target = r ? network.nuclei[r.target]?.name : undefined
      let n = 0
      let max = 0
      t.nuclei.forEach((name, j) => {
        if (name === target) return
        const v = Math.abs(t.s[k][j])
        if (v >= cut) n++
        if (v > max) max = v
      })
      if (n > 0) list.push({ id, n, max })
    })
    list.sort((a, b) => b.n - a.n || b.max - a.max || a.id.localeCompare(b.id))
    out[s.id] = list.slice(0, keep)
  }
  return out
}

/** The reaction "What if" opens on: the best-reaching of the picker's own reactions (else the first). */
export function defaultReaction(candidates: string[], ranked: Reach[] | undefined): string | null {
  const best = ranked?.find((r) => candidates.includes(r.id))
  return best?.id ?? candidates[0] ?? null
}

/**
 * The reaction to try instead when a change moved only its own target: the
 * bottleneck when it reaches further, else the best-reaching one not yet
 * changed.
 */
export function suggestReaction(
  ranked: Reach[] | undefined,
  changed: string[],
  bottleneckId: string | null = null,
): { id: string; why: "slowest" | "sensitive" } | null {
  const list = (ranked ?? []).filter((r) => !changed.includes(r.id))
  if (bottleneckId && list.some((r) => r.id === bottleneckId)) return { id: bottleneckId, why: "slowest" }
  return list.length ? { id: list[0].id, why: "sensitive" } : null
}
